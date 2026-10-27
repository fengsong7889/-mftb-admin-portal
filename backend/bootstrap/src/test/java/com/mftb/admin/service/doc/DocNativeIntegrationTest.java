package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 真实 MySQL 集成验收：只验证 Mockito 证明不了的锁、事务、幂等落库与限流。
 * 仅在注入 DB_URL 时运行；夹具用唯一标记创建并在结束后物理清理本模块自己的数据。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+",
        disabledReason = "需要真实 MySQL；CI 无库时跳过")
class DocNativeIntegrationTest {
    @Autowired private DocNativeService documents;
    @Autowired private DocNativeWorkflowService workflow;
    @Autowired private DocNativeSpaceService spaces;
    @Autowired private DocIntegrationGrantService grants;
    @Autowired private DocNativeAccess access;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SysUserMapper users;

    private SysUser admin;
    private long spaceId;
    private String marker;

    @BeforeEach void fixture() {
        // 超级管理员未必是 id=1：内置 admin 账号在存量库里可能被重新创建
        admin = users.selectList(null).stream()
                .filter(user -> "admin".equals(user.getRole()) && Integer.valueOf(1).equals(user.getStatus())
                        && !Boolean.TRUE.equals(user.getMustChangePassword()))
                .findFirst().orElse(null);
        assertNotNull(admin, "测试库缺少可用的超级管理员账号");
        asUser(admin);
        marker = "DN" + System.currentTimeMillis();
        spaceId = spaces.create(new SpaceSave("DOCNATIVE-IT-" + marker, "原生文档集成测试空间，自动清理")).id();
    }

    @AfterEach void cleanup() {
        List<Long> nodes = jdbc.queryForList("SELECT node_id FROM doc_native_document WHERE space_id=?", Long.class, spaceId);
        jdbc.update("DELETE FROM doc_ingest_request WHERE request_key LIKE ?", "it-" + marker + "-%");
        jdbc.update("DELETE FROM doc_audit_event WHERE space_id=?", spaceId);
        if (!nodes.isEmpty()) {
            String in = String.join(",", nodes.stream().map(String::valueOf).toList());
            jdbc.update("DELETE FROM doc_handoff WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_confirmation WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_document_acl WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_acl_entry WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_node_tag WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_search_index WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_revision_asset WHERE revision_id IN (SELECT id FROM doc_revision WHERE node_id IN (" + in + "))");
            jdbc.update("DELETE FROM doc_revision WHERE node_id IN (" + in + ")");
        }
        jdbc.update("DELETE FROM doc_asset WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_category WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_native_document WHERE space_id=?", spaceId);
        for (Long node : nodes) jdbc.update("DELETE FROM doc_node WHERE id=?", node);
        jdbc.update("DELETE FROM doc_integration_grant WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space_member WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space_access WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space WHERE id=? AND name LIKE ?", spaceId, "DOCNATIVE-IT-%");
        SecurityContextHolder.clearContext();
    }

    @Test void createIsIdempotentAndRejectsDifferentPayloadUnderSameKey() {
        String key = key("create");
        Receipt first = documents.create(payload("幂等创建", 1), key);
        Receipt replay = documents.create(payload("幂等创建", 1), key);
        assertEquals(first, replay);
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_revision WHERE node_id=?", first.documentId()));
        assertEquals("PLAN-" + java.time.Year.now().getValue() + "-" + String.format("%06d", first.documentId()), first.documentNo());
        BusinessException conflict = assertThrows(BusinessException.class, () -> documents.create(payload("改过的正文", 1), key));
        assertEquals(409, conflict.getCode());
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_revision WHERE node_id=?", first.documentId()));
    }

    @Test void staleVersionCannotAppendRevision() {
        Receipt created = documents.create(payload("版本冲突", 1), key("create"));
        documents.save(created.documentId(), payload("第一次修改", created.version()), key("save-1"));
        // 用已被消费的版本号再保存必须 409，而不是静默追加第三个修订
        assertEquals(409, assertThrows(BusinessException.class,
                () -> documents.save(created.documentId(), payload("并发旧版本", created.version()), key("save-2"))).getCode());
        assertEquals(2L, count("SELECT COUNT(*) FROM doc_revision WHERE node_id=?", created.documentId()));
    }

    @Test void concurrentSaveWithSameVersionAllowsSingleWriter() throws Exception {
        Receipt created = documents.create(payload("并发基线", 1), key("create"));
        int version = created.version();
        List<String> results = runConcurrently(2, index -> {
            try {
                asUser(admin);
                documents.save(created.documentId(), payload("并发正文" + index, version), key("save-" + index));
                return "OK";
            } catch (BusinessException exception) {
                return "E" + exception.getCode();
            }
        });
        assertEquals(1, results.stream().filter("OK"::equals).count(), "同一 expectedVersion 只允许一个写入成功: " + results);
        assertEquals(1, results.stream().filter("E409"::equals).count(), "另一个必须收到 409 而不是静默覆盖: " + results);
        assertEquals(2L, count("SELECT COUNT(*) FROM doc_revision WHERE node_id=?", created.documentId()));
    }

    @Test void pendingConfirmationFreezesEditingAndApprovalKeepsExecutionBaseline() {
        Receipt created = documents.create(payload("确认流程", 1), key("create"));
        long revisionId = created.revisionId();
        workflow.submit(created.documentId(), new Submit(created.version(), revisionId, admin.getId()));
        assertEquals(409, assertThrows(BusinessException.class,
                () -> documents.save(created.documentId(), payload("待确认期间修改", created.version()), key("save"))).getCode());
        workflow.decide(confirmationId(created.documentId()),
                new Decision(headVersion(created.documentId()), "approve", "真实库确认"));
        View view = documents.read(created.documentId(), revisionId, false);
        assertEquals(revisionId, view.document().getEffectiveRevisionId());
        assertNull(view.document().getDraftRevisionId());
        assertEquals(1, view.document().getExecutionStatus(), "确认生效不得自动把执行进度推到执行中");
        assertEquals(409, assertThrows(BusinessException.class,
                () -> workflow.execution(created.documentId(), new Execution(headVersion(created.documentId()), revisionId, 4, "试图跳级"))).getCode());
        workflow.execution(created.documentId(), new Execution(headVersion(created.documentId()), revisionId, 2, "进入执行"));
        assertEquals(2, headVersionState(created.documentId()));
    }

    @Test void handoffBindsAdoptedRevisionAndRecipientAcceptIsIdempotent() {
        SysUser recipient = users.selectList(null).stream()
                .filter(user -> !user.getId().equals(admin.getId()) && "admin".equals(user.getRole())
                        && Integer.valueOf(1).equals(user.getStatus()))
                .findFirst().orElse(null);
        assumeTrue(recipient != null, "测试库没有第二个启用管理员，跳过接管链路");
        spaces.saveMember(spaceId, new MemberSave(recipient.getId(), 15));
        Receipt created = documents.create(payload("交接流程", 1), key("create"));
        workflow.submit(created.documentId(), new Submit(created.version(), created.revisionId(), admin.getId()));
        workflow.decide(confirmationId(created.documentId()),
                new Decision(headVersion(created.documentId()), "approve", "交接前确认"));
        long handoffId = workflow.handoff(created.documentId(),
                new HandoffSave(headVersion(created.documentId()), created.revisionId(), recipient.getId(), "已完成", "剩余项", "风险"));
        asUser(recipient);
        workflow.accept(handoffId, new Action(headVersion(created.documentId()), "接收"));
        workflow.accept(handoffId, new Action(headVersion(created.documentId()), "重复接收"));
        assertEquals(recipient.getId().longValue(), count("SELECT owner_user_id FROM doc_native_document WHERE node_id=?", created.documentId()));
        assertEquals(created.revisionId().longValue(), count("SELECT adopted_revision_id FROM doc_native_document WHERE node_id=?", created.documentId()));
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_handoff WHERE node_id=? AND status=2", created.documentId()));
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_audit_event WHERE node_id=? AND action='HANDOFF_ACCEPT'", created.documentId()));
    }

    @Test void grantRateLimitRevokeExpiryAndCrossSpaceAreEnforcedInDatabase() {
        GrantCreated issued = grants.issue(new GrantSave(spaceId, "集成限流", true, 1));
        assertTrue(issued.token().startsWith(DocIntegrationGrantService.TOKEN_PREFIX));
        assertEquals(0L, count("SELECT COUNT(*) FROM doc_integration_grant WHERE token_hash=?", issued.token()),
                "库中不得出现明文令牌");
        for (int i = 0; i < 5; i++) assertDoesNotThrow(() -> grants.authenticate(issued.token(), false));
        // 直接把计数推到上限：120 次真实调用在慢库上可能跨过 1 分钟窗口，导致限流断言假失败。
        jdbc.update("UPDATE doc_integration_grant SET request_count=120,rate_window=CURRENT_TIMESTAMP WHERE id=?", issued.id());
        assertEquals(429, assertThrows(BusinessException.class, () -> grants.authenticate(issued.token(), false)).getCode());
        grants.revoke(issued.id());
        assertEquals(401, assertThrows(BusinessException.class, () -> grants.authenticate(issued.token(), false)).getCode());

        String expired = DocIntegrationGrantService.TOKEN_PREFIX + "e".repeat(43);
        jdbc.update("INSERT INTO doc_integration_grant(owner_user_id,space_id,name,token_hash,can_write,expires_at) "
                + "VALUES(?,?,?,?,1,DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 DAY))", admin.getId(), spaceId, "过期令牌", DocContentValidation.hash(expired));
        assertEquals(401, assertThrows(BusinessException.class, () -> grants.authenticate(expired, false)).getCode());

        long otherSpace = spaces.create(new SpaceSave("DOCNATIVE-IT-OTHER-" + marker, "跨空间限制")).id();
        try {
            GrantCreated other = grants.issue(new GrantSave(spaceId, "跨空间", false, 1));
            DocIntegrationAuthentication identity = grants.authenticate(other.token(), false);
            SecurityContextHolder.getContext().setAuthentication(identity);
            assertEquals(403, assertThrows(BusinessException.class, () -> access.space(otherSpace, DocNativeAccess.READ)).getCode());
        } finally {
            // 审计行和外键都指向空间配置，清理必须从子表往上
            jdbc.update("DELETE FROM doc_audit_event WHERE space_id=?", otherSpace);
            jdbc.update("DELETE FROM doc_category WHERE space_id=?", otherSpace);
            jdbc.update("DELETE FROM doc_integration_grant WHERE space_id=?", otherSpace);
            jdbc.update("DELETE FROM doc_space_member WHERE space_id=?", otherSpace);
            jdbc.update("DELETE FROM doc_space_access WHERE space_id=?", otherSpace);
            jdbc.update("DELETE FROM doc_space WHERE id=? AND name LIKE ?", otherSpace, "DOCNATIVE-IT-OTHER-%");
        }
    }

    @Test void integrationCannotApproveEvenWithWriteScope() {
        Receipt created = documents.create(payload("机器不能审批", 1), key("create"));
        workflow.submit(created.documentId(), new Submit(created.version(), created.revisionId(), admin.getId()));
        GrantCreated issued = grants.issue(new GrantSave(spaceId, "机器写入", true, 1));
        SecurityContextHolder.getContext().setAuthentication(grants.authenticate(issued.token(), true));
        long confirmation = confirmationId(created.documentId());
        assertEquals(403, assertThrows(BusinessException.class,
                () -> workflow.decide(confirmation, new Decision(headVersion(created.documentId()), "approve", ""))).getCode());
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_confirmation WHERE id=? AND status=1", confirmation));
    }

    /* ==================== 辅助 ==================== */

    private Save payload(String markdown, int version) {
        return new Save(spaceId, "集成方案 " + marker, "集成测试", markdown, List.of("集成"), "", "", "", "集成测试修订", "session-" + marker, version);
    }
    private String key(String action) { return "it-" + marker + "-" + action; }
    private long confirmationId(long nodeId) {
        Long id = jdbc.queryForObject("SELECT id FROM doc_confirmation WHERE node_id=? ORDER BY id DESC LIMIT 1", Long.class, nodeId);
        return id == null ? -1 : id;
    }
    private int headVersion(long nodeId) {
        Integer value = jdbc.queryForObject("SELECT version FROM doc_native_document WHERE node_id=?", Integer.class, nodeId);
        return value == null ? -1 : value;
    }
    private int headVersionState(long nodeId) {
        Integer value = jdbc.queryForObject("SELECT execution_status FROM doc_native_document WHERE node_id=?", Integer.class, nodeId);
        return value == null ? -1 : value;
    }
    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }
    private void asUser(SysUser user) {
        var auth = new UsernamePasswordAuthenticationToken(user.getUsername(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
    private List<String> runConcurrently(int threads, java.util.function.IntFunction<String> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < threads; i++) {
                final int index = i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(30, TimeUnit.SECONDS);
                    return task.apply(index);
                }));
            }
            ready.await(30, TimeUnit.SECONDS);
            go.countDown();
            List<String> results = new ArrayList<>();
            for (Future<String> future : futures) results.add(future.get(90, TimeUnit.SECONDS));
            return results;
        } finally {
            pool.shutdownNow();
        }
    }
}
