package com.mftb.admin.service.doc;

import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.SpaceSave;
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

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * P0 真实 MySQL 验收：迁移结构、Markdown/PDF 创建、索引检索、资产下载与清理顺序。
 *
 * <p>只在注入 DB_URL 时运行；夹具使用唯一标记创建，结束后按外键逆序物理清理。
 * 本测试不验证 PDF 正文提取（P0 未接入 PDFBox），只验证文件头、资产与下载权限。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+",
        disabledReason = "需要真实 MySQL；CI 无库时跳过")
class DocKnowledgeIntegrationTest {
    @Autowired private DocKnowledgeService knowledge;
    @Autowired private DocAckService acks;
    @Autowired private DocReadingService readings;
    @Autowired private DocApiSpecService apiSpecs;
    @Autowired private DocArchiveService archiveService;
    @Autowired private DocNativeSpaceService spaces;
    @Autowired private DocAssetService assets;
    @Autowired private DocObjectStorage storage;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SysUserMapper users;

    private SysUser admin;
    private long spaceId;
    private String marker;

    @BeforeEach void fixture() {
        admin = users.selectList(null).stream()
                .filter(user -> "admin".equals(user.getRole()) && Integer.valueOf(1).equals(user.getStatus())
                        && !Boolean.TRUE.equals(user.getMustChangePassword()))
                .findFirst().orElse(null);
        assertNotNull(admin, "测试库缺少可用的超级管理员账号");
        asUser(admin);
        marker = "DK" + System.currentTimeMillis();
        spaceId = spaces.create(new SpaceSave("DOC-KNOW-IT-" + marker, "P0 知识库集成测试空间，自动清理")).id();
    }

    @AfterEach void cleanup() {
        List<Long> nodes = jdbc.queryForList("SELECT node_id FROM doc_native_document WHERE space_id=?", Long.class, spaceId);
        List<String> objectKeys = jdbc.queryForList("SELECT object_key FROM doc_asset WHERE space_id=?", String.class, spaceId);
        if (!nodes.isEmpty()) {
            String in = String.join(",", nodes.stream().map(String::valueOf).toList());
            jdbc.update("DELETE FROM doc_handoff WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_confirmation WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_document_acl WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_acl_entry WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_ack_target WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_ack_receipt WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_reader_state WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_favorite WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_note WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_book_meta WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_disposal_request WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_archive_meta WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_api_change WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_api_operation WHERE spec_id IN (SELECT id FROM doc_api_spec WHERE node_id IN (" + in + "))");
            jdbc.update("DELETE FROM doc_api_spec WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_node_tag WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_search_index WHERE node_id IN (" + in + ")");
            jdbc.update("DELETE FROM doc_revision_asset WHERE revision_id IN (SELECT id FROM doc_revision WHERE node_id IN (" + in + "))");
            jdbc.update("DELETE FROM doc_revision WHERE node_id IN (" + in + ")");
        }
        jdbc.update("DELETE FROM doc_ingest_request WHERE request_key LIKE ?", "it-know-" + marker + "-%");
        jdbc.update("DELETE FROM doc_audit_event WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_asset WHERE space_id=?", spaceId);
        jdbc.update("DELETE t FROM doc_tag t WHERE t.space_id=? AND NOT EXISTS "
                + "(SELECT 1 FROM doc_node_tag nt WHERE nt.tag_id=t.id)", spaceId);
        jdbc.update("DELETE FROM doc_category WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_native_document WHERE space_id=?", spaceId);
        for (Long node : nodes) jdbc.update("DELETE FROM doc_node WHERE id=?", node);
        jdbc.update("DELETE FROM doc_integration_grant WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space_member WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space_access WHERE space_id=?", spaceId);
        jdbc.update("DELETE FROM doc_space WHERE id=? AND name LIKE ?", spaceId, "DOC-KNOW-IT-%");
        objectKeys.forEach(key -> {
            try {
                storage.delete(key);
            } catch (RuntimeException ignored) {
                // 文件清理失败不影响数据库夹具清理；本地磁盘残留由部署侧清理
            }
        });
        SecurityContextHolder.clearContext();
    }

    @Test void knowledgeSchemaAndFulltextIndexAreReady() {
        assertEquals(1L, count("SELECT COUNT(*) FROM sys_schema_version WHERE version_key='doc:knowledge-v3.0'"));
        for (String table : List.of("doc_category", "doc_tag", "doc_node_tag", "doc_asset",
                "doc_revision_asset", "doc_acl_entry", "doc_user_clearance", "doc_search_index")) {
            assertEquals(1L, count("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", table),
                    "缺表: " + table);
        }
        assertEquals(1L, count("SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() "
                + "AND TABLE_NAME='doc_search_index' AND INDEX_NAME='ft_doc_search' AND INDEX_TYPE='FULLTEXT'"));
    }

    @Test void spacesListsNativeSpaceWithoutSqlAliasError() {
        // 回归：space_kind 属于 doc_space(s)，不能误取 doc_space_access(a).space_kind
        assertTrue(knowledge.spaces().stream().anyMatch(space -> space.id() == spaceId && space.managed()));
    }

    @Test void pendingAcksQueryWorksUnderOnlyFullGroupBy() {
        DocWrite write = new DocWrite(spaceId, "签收制度 " + marker, "待签收查询回归", 1, null, 2, 1,
                List.of("签收"), "", "# 签收\n\n待签收查询回归。", "ack.md",
                List.of(), "集成测试", "session-ack-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-ack");
        acks.saveTargets(receipt.documentId(), new AckTargetSave(List.of(new AckTargetInput("ALL", "0", null))));
        PendingAckPage page = acks.pending(1, 20);
        assertTrue(page.records().stream().anyMatch(row -> row.nodeId().equals(receipt.documentId())),
                "待签收查询必须在 only_full_group_by 下返回本人工单");
        var coverage = acks.coverage(receipt.documentId());
        assertFalse(coverage.rows().isEmpty());
        assertTrue(coverage.targetUsers() >= 1);
        Long adminRole = jdbc.queryForObject("SELECT id FROM sys_role WHERE code='admin' AND status=1 LIMIT 1", Long.class);
        acks.saveTargets(receipt.documentId(), new AckTargetSave(
                List.of(new AckTargetInput("ROLE", String.valueOf(adminRole), null))));
        var roleCoverage = acks.coverage(receipt.documentId());
        assertEquals("ROLE", roleCoverage.rows().get(0).subjectType());
        assertTrue(roleCoverage.rows().get(0).targetUsers() >= 1);
        var csv = acks.exportReceipts(receipt.documentId());
        assertTrue(new String(csv.content(), java.nio.charset.StandardCharsets.UTF_8)
                .startsWith("姓名,工号,签收时间,来源IP,User-Agent"));
    }

    @Test void archiveAndDisposalRequireSeparateApproverAndKeepTombstone() {
        SysUser other = users.selectList(null).stream()
                .filter(user -> !user.getId().equals(admin.getId()))
                .findFirst().orElseThrow();
        DocWrite write = new DocWrite(spaceId, "档案销毁 " + marker, "档案回归", 1, null, 2, 1,
                List.of("档案"), "", "# 档案\n\n档案回归。", "archive.md",
                List.of(), "集成测试", "session-archive-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-archive");
        var meta = archiveService.archive(receipt.documentId(),
                new ArchiveSave(5, java.time.LocalDate.now(), false));
        assertEquals("AR-" + java.time.LocalDate.now().getYear() + "-" + receipt.documentId(), meta.archiveNo());
        assertEquals(4L, jdbc.queryForObject("SELECT status FROM doc_node WHERE id=?", Long.class, receipt.documentId()));
        var request = archiveService.requestDisposal(receipt.documentId(), new DisposalSave("到期销毁"));
        assertEquals(1, request.status());
        assertEquals(409, assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> archiveService.decide(request.id(), new DisposalDecision(true, null))).getCode());
        // 申请人隔离用数据夹具模拟另一名申请人；审批仍由当前管理员执行。
        jdbc.update("UPDATE doc_disposal_request SET requested_by=? WHERE id=?", other.getId(), request.id());
        var destroyed = archiveService.decide(request.id(), new DisposalDecision(true, null));
        assertEquals(4, destroyed.status());
        assertNotNull(destroyed.certificateNo());
        assertEquals(7L, jdbc.queryForObject("SELECT status FROM doc_node WHERE id=?", Long.class, receipt.documentId()));
        assertEquals("", jdbc.queryForObject("SELECT markdown FROM doc_revision WHERE id=?", String.class, receipt.revisionId()));
        assertTrue(new String(archiveService.exportDisposalCsv(), java.nio.charset.StandardCharsets.UTF_8)
                .startsWith("申请ID,文档编号"));
    }

    @Test void apiSpecImportListsOperationsAndDiffsDestructiveChanges() {
        DocWrite write = new DocWrite(spaceId, "接口文档 " + marker, "OpenAPI 回归", 5, null, 2, 1,
                List.of("API"), "", "# API\n\nOpenAPI 回归。", "api.md",
                List.of(), "集成测试", "session-api-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-api");
        String v1 = "{\"openapi\":\"3.0.0\",\"info\":{\"version\":\"1.0\"},\"paths\":{"
                + "\"/users\":{\"get\":{\"summary\":\"list users\"}},"
                + "\"/orders\":{\"post\":{\"summary\":\"create order\"}}}}";
        var first = apiSpecs.importSpec(receipt.documentId(), new ApiSpecImport("crm", "1.0", v1));
        assertEquals(2, first.operations().size());
        assertEquals(0, first.changes().size());
        String v2 = "{\"openapi\":\"3.0.0\",\"info\":{\"version\":\"2.0\"},\"paths\":{"
                + "\"/users\":{\"get\":{\"summary\":\"list all users\"}},"
                + "\"/new\":{\"get\":{\"summary\":\"new endpoint\"}}}}";
        var second = apiSpecs.importSpec(receipt.documentId(), new ApiSpecImport("crm", "2.0", v2));
        assertEquals(2, apiSpecs.specs(receipt.documentId()).size());
        assertTrue(second.pendingDestructive() >= 2);
        assertTrue(second.changes().stream().anyMatch(change -> change.changeType() == 2));
        assertTrue(second.changes().stream().anyMatch(change -> change.changeType() == 3));
        var pending = second.changes().stream().filter(change -> change.acknowledgedBy() == null).findFirst().orElseThrow();
        assertNotNull(apiSpecs.ackChange(pending.id()).acknowledgedBy());
    }

    @Test void readingFavoriteNoteAndBookMetaRoundTrip() {
        DocWrite write = new DocWrite(spaceId, "阅读回归 " + marker, "阅读域回归", 1, null, 2, 1,
                List.of("阅读"), "", "# 阅读\n\n阅读域回归。", "reading.md",
                List.of(), "集成测试", "session-reading-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-reading");
        var state = readings.saveState(receipt.documentId(), new ReaderStateSave(
                receipt.revisionId(), "{\"scroll\":12}", 42.5, 30));
        assertEquals(42.5, state.percent());
        assertTrue(readings.toggleFavorite(receipt.documentId(), "默认"));
        assertFalse(readings.toggleFavorite(receipt.documentId(), null));
        Note note = readings.saveNote(receipt.documentId(), new NoteSave(receipt.revisionId(), 2,
                null, "引用句", "我的批注", 1));
        assertEquals("我的批注", note.content());
        assertEquals(1, readings.notes(receipt.documentId()).size());
        readings.deleteNote(note.id());
        assertTrue(readings.notes(receipt.documentId()).isEmpty());
        BookMeta meta = readings.saveBookMeta(receipt.documentId(), new BookMetaSave(
                "978-7-000-00000-0", "作者", "出版社", 2020, "zh", 100, null, null, 1));
        assertEquals("978-7-000-00000-0", meta.isbn());
        assertEquals("作者", readings.bookMeta(receipt.documentId()).author());
    }

    @Test void markdownDocumentIsImmediatelyEffectiveSearchableAndIdempotentBySession() {
        DocWrite write = new DocWrite(spaceId, "制度正文 " + marker, "集成测试摘要", 1, null, 2, 1,
                List.of("制度", "集成"), "", "# 正文\n\n这是 P0 集成测试正文。", "policy.md",
                List.of(), "集成测试", "session-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-create");
        assertTrue(receipt.documentId() > 0);
        assertEquals(3, knowledge.detail(receipt.documentId(), null).document().getStatus());
        assertEquals(1, knowledge.detail(receipt.documentId(), null).revisions().size());

        Page page = knowledge.search(marker, spaceId, null, 1, null, null, 1, 20);
        assertTrue(page.records().stream().anyMatch(row -> row.nodeId().equals(receipt.documentId())),
                "新建文档必须进入统一检索索引");

        // 换一个 Idempotency-Key、但 sourceSessionKey 相同：返回既有文档而不是第二份
        Receipt replay = knowledge.create(write, "it-know-" + marker + "-retry");
        assertEquals(receipt.documentId(), replay.documentId());
        assertEquals(1L, count("SELECT COUNT(*) FROM doc_node WHERE space_id=? AND title=?", spaceId, write.title()));
    }

    @Test void pdfAssetIsValidatedBoundAndDownloadable() throws Exception {
        byte[] pdf = "%PDF-1.4\n% P0 integration fixture\n".getBytes(StandardCharsets.US_ASCII);
        Asset asset = assets.upload(spaceId, "handbook.pdf", "application/pdf", pdf.length, new ByteArrayInputStream(pdf));
        assertEquals("application/pdf", asset.mime());
        assertEquals("UNSCANNED", asset.scanResult());

        DocWrite write = new DocWrite(spaceId, "员工手册 " + marker, "PDF 集成测试", 2, null, 2, 1,
                List.of("手册"), "", "", "handbook.pdf", List.of(asset.id()), "集成测试", "session-pdf-" + marker, null);
        Receipt receipt = knowledge.create(write, "it-know-" + marker + "-pdf");
        Detail detail = knowledge.detail(receipt.documentId(), null);
        assertEquals(1, detail.assets().size());
        assertEquals(2, detail.document().getContentKind());

        var response = assets.download(asset.id(), receipt.documentId(), false);
        assertNotNull(response.getBody());
        try (InputStream in = response.getBody().getInputStream()) {
            assertArrayEquals(pdf, in.readAllBytes());
        }
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }

    private void asUser(SysUser user) {
        var auth = new UsernamePasswordAuthenticationToken(user.getUsername(), null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
