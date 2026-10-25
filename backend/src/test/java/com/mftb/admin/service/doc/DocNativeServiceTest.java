package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.mftb.admin.service.doc.DocNativeAccess.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 业务分支回归不连接数据库；真实 MySQL 锁、事务及迁移另行验收。 */
class DocNativeServiceTest {
    private static ValidatorFactory factory;
    private JdbcTemplate jdbc;
    private DocNativeStore store;
    private DocNativeAccess access;
    private PermissionService permissions;
    private DocContentValidation validation;
    private DocNativeService documents;
    private DocNativeWorkflowService workflow;
    private Head head;
    private SysUser user;

    @BeforeAll static void createValidator() { factory = Validation.buildDefaultValidatorFactory(); }
    @AfterAll static void closeValidator() { factory.close(); }
    @AfterEach void clearIdentity() { SecurityContextHolder.clearContext(); }

    @BeforeEach void setup() {
        jdbc = mock(JdbcTemplate.class);
        store = spy(new DocNativeStore(jdbc));
        var operators = mock(OperatorResolver.class);
        permissions = mock(PermissionService.class);
        user = new SysUser(); user.setId(7L); user.setStatus(1); user.setName("测试人员"); user.setUsername("doc-test");
        when(operators.currentUser()).thenReturn(user);
        when(permissions.hasSystemAccess(user, "doc")).thenReturn(true);
        when(permissions.hasPermission(eq(user), anyString(), anyString())).thenReturn(true);
        access = spy(new DocNativeAccess(store, operators, permissions, new DocAclResolver(store)));
        doReturn(READ | EDIT | CONFIRM | MANAGE).when(access).member(anyLong(), anyLong());
        validation = new DocContentValidation(factory.getValidator());
        var spaces = mock(DocNativeSpaceService.class);
        documents = new DocNativeService(store, access, spaces, validation, mock(DocIndexService.class));
        workflow = new DocNativeWorkflowService(store, access, spaces, validation);
        head = new Head(); head.setNodeId(41L); head.setSpaceId(3L); head.setOwnerUserId(7L);
        head.setCreatedByUserId(7L); head.setDocumentNo("PLAN-2026-000041"); head.setDraftRevisionId(83L);
        head.setVersion(3); head.setLifecycle(1); head.setExecutionStatus(1);
        doReturn(head).when(store).head(eq(41L), anyBoolean());
        doReturn(null).when(store).pending(anyLong());
        doReturn(0L).when(store).count(anyString(), any(Object[].class));
        doReturn(List.of()).when(store).rows(anyString(), any(), any(Object[].class));
    }

    private Save input(Integer version, String markdown) {
        return new Save(3L, "方案", "摘要", markdown, List.of("文档"), "", "", "", "测试修订", "source-test", version);
    }
    private void expectCode(int code, Executable action) {
        assertEquals(code, assertThrows(BusinessException.class, action).getCode());
    }
    private void ingest(Save input, Receipt receipt) {
        Map<String, Object> row = new HashMap<>();
        row.put("request_hash", DocContentValidation.hash("revision:41:" + validation.encode(validation.content(input))));
        row.put("response_json", receipt == null ? null : validation.encode(receipt));
        when(jdbc.queryForMap(contains("FROM doc_ingest_request"), eq(7L), eq("request-001"))).thenReturn(row);
    }
    private Confirmation confirmation(int status, long reviewer, long revision) {
        var row = new Confirmation(); row.setId(5L); row.setNodeId(41L); row.setRevisionId(revision);
        row.setReviewerUserId(reviewer); row.setStatus(status);
        doReturn(row).when(store).one(contains("FROM doc_confirmation"), eq(Confirmation.class), eq(5L));
        return row;
    }

    @Test void noMenuCannotRead() {
        when(permissions.hasPermission(eq(user), anyString(), anyString())).thenReturn(false);
        expectCode(403, () -> access.read(head));
    }
    @Test void libraryViewDoesNotGrantEdit() {
        when(permissions.hasPermission(eq(user), anyString(), anyString())).thenReturn(false);
        when(permissions.hasPermission(user, "doc-library", "view")).thenReturn(true);
        assertDoesNotThrow(() -> access.read(head));
        expectCode(403, () -> access.edit(head));
    }
    @Test void ownerStillNeedsSpaceMembership() {
        doReturn(0).when(access).member(3L, 7L);
        expectCode(403, () -> access.read(head));
    }
    @Test void restrictedAclCannotWidenSpaceMembership() {
        head.setOwnerUserId(8L); head.setCreatedByUserId(8L); head.setRestricted(true);
        expectCode(403, () -> access.read(head));
        doReturn(1L).when(store).count(contains("FROM doc_document_acl"), eq(41L), eq(7L), eq(READ));
        assertDoesNotThrow(() -> access.read(head));
        doReturn(0).when(access).member(3L, 7L);
        expectCode(403, () -> access.read(head));
    }
    @ParameterizedTest @ValueSource(ints = {0, 1, 5})
    void readOrConfirmDoesNotGrantEdit(int bits) {
        doReturn(bits).when(access).member(3L, 7L);
        expectCode(403, () -> access.edit(head));
    }
    @Test void readerCannotReadUnapprovedRevision() {
        doReturn(READ).when(access).member(3L, 7L);
        var revision = new Revision(); revision.setId(83L);
        doReturn(revision).when(store).revision(41L, 83L);
        expectCode(403, () -> documents.read(41L, 83L, false));
    }
    @Test void disabledUserAndForcedPasswordChangeAreRejected() {
        user.setStatus(0); expectCode(401, access::user);
        user.setStatus(1); user.setMustChangePassword(true); expectCode(401, access::user);
    }
    @Test void integrationIsRestrictedToItsSpaceAndCannotApprove() {
        var grant = new Grant(); grant.setSpaceId(4L); grant.setCanWrite(true);
        SecurityContextHolder.getContext().setAuthentication(new DocIntegrationAuthentication(user, grant));
        expectCode(403, () -> access.read(head));
        expectCode(403, () -> workflow.decide(5L, new Decision(3, "approve", "")));
        expectCode(403, () -> workflow.execution(41L, new Execution(3, 83L, 2, "测试证据")));
    }
    @Test void readOnlyIntegrationCannotWrite() {
        var grant = new Grant(); grant.setSpaceId(3L); grant.setCanWrite(false);
        SecurityContextHolder.getContext().setAuthentication(new DocIntegrationAuthentication(user, grant));
        assertDoesNotThrow(() -> access.read(head));
        expectCode(403, () -> access.edit(head));
    }
    @Test void staleVersionCannotAppendRevision() {
        Save input = input(2, "修订正文"); ingest(input, null);
        expectCode(409, () -> documents.save(41L, input, "request-001"));
        verify(store, never()).insert(anyString(), any(Object[].class));
    }
    @Test void pendingConfirmationFreezesEditing() {
        Save input = input(3, "修订正文"); ingest(input, null);
        doReturn(new Confirmation()).when(store).pending(41L);
        expectCode(409, () -> documents.save(41L, input, "request-001"));
        verify(store, never()).insert(anyString(), any(Object[].class));
    }
    @Test void sameKeyAndPayloadReturnOriginalReceiptWithoutNewRevision() {
        Save input = input(3, "修订正文");
        Receipt receipt = new Receipt(41L, head.getDocumentNo(), 83L, "a".repeat(64), 3,
                LocalDateTime.of(2026, 10, 23, 10, 0), "/doc-plans/detail?id=41&revision=83");
        ingest(input, receipt);
        var revision = new Revision(); revision.setId(83L);
        doReturn(revision).when(store).revision(41L, 83L);
        assertEquals(receipt, documents.save(41L, input, "request-001"));
        verify(store, never()).insert(anyString(), any(Object[].class));
        verify(store, never()).bump(anyLong());
    }
    @Test void sameKeyWithDifferentPayloadConflicts() {
        when(jdbc.queryForMap(contains("FROM doc_ingest_request"), eq(7L), eq("request-001")))
                .thenReturn(Map.of("request_hash", "different"));
        expectCode(409, () -> documents.save(41L, input(3, "修订正文"), "request-001"));
        verify(store, never()).insert(anyString(), any(Object[].class));
    }
    @Test void replayStillRechecksCurrentAccess() {
        Save input = input(3, "修订正文");
        Receipt receipt = new Receipt(99L, "PLAN-OTHER", 100L, "a".repeat(64), 1, LocalDateTime.now(), "/doc-plans/detail?id=99&revision=100");
        ingest(input, receipt);
        doThrow(new BusinessException(403, "不可访问")).when(store).head(99L, false);
        expectCode(403, () -> documents.save(41L, input, "request-001"));
    }
    @Test void rejectedConfirmationRequiresReason() {
        confirmation(1, 7L, 83L);
        expectCode(400, () -> workflow.decide(5L, new Decision(3, "reject", "  ")));
        verifyNoInteractions(jdbc);
    }
    @Test void onlyDesignatedReviewerCanDecide() {
        confirmation(1, 8L, 83L);
        expectCode(403, () -> workflow.decide(5L, new Decision(3, "approve", "")));
        verifyNoInteractions(jdbc);
    }
    @Test void staleRevisionCannotBeApproved() {
        confirmation(1, 7L, 82L);
        expectCode(409, () -> workflow.decide(5L, new Decision(3, "approve", "")));
        verifyNoInteractions(jdbc);
    }
    @Test void approvalUpdatesEffectiveVersionButNotExecutionBaseline() {
        confirmation(1, 7L, 83L); head.setAdoptedRevisionId(70L);
        workflow.decide(5L, new Decision(3, "approve", "已核验"));
        verify(jdbc).update("UPDATE doc_native_document SET effective_revision_id=?,draft_revision_id=NULL WHERE node_id=?", 83L, 41L);
        verify(jdbc, never()).update(contains("adopted_revision_id"), any(Object[].class));
    }
    @Test void executionCannotSkipToCompleted() {
        doReturn(1L).when(store).count(contains("FROM doc_confirmation"), eq(41L), eq(83L));
        expectCode(409, () -> workflow.execution(41L, new Execution(3, 83L, 4, "测试完成证据")));
        verifyNoInteractions(jdbc);
    }
    @Test void executionRequiresApprovedRevision() {
        expectCode(409, () -> workflow.execution(41L, new Execution(3, 83L, 2, "测试执行证据")));
    }
    @Test void handoffCannotSilentlySwitchAdoptedBaseline() {
        head.setAdoptedRevisionId(70L); head.setEffectiveRevisionId(83L);
        expectCode(409, () -> workflow.handoff(41L, new HandoffSave(3, 83L, 8L, "完成", "剩余", "风险")));
    }
    @Test void acceptedHandoffIsIdempotentForRecipient() {
        var handoff = new Handoff(); handoff.setNodeId(41L); handoff.setRecipientUserId(7L); handoff.setStatus(2);
        doReturn(handoff).when(store).one(contains("FROM doc_handoff"), eq(Handoff.class), eq(6L));
        workflow.accept(6L, new Action(1, "再次接收"));
        verifyNoInteractions(jdbc);
    }
    @Test void contentLimitUsesUtf8BytesAndDoesNotTruncate() {
        expectCode(413, () -> validation.content(input(3, "文".repeat(DocContentValidation.MAX_BYTES / 3 + 1))));
        String source = "# 正文\n保留尾部空格  \n";
        assertEquals(source, validation.content(input(3, source)).markdown());
    }
    private DocNativeStore repositoryProxy() {
        var proxy = new ProxyFactory(store);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice((MethodInterceptor) invocation -> invocation.proceed());
        return (DocNativeStore) proxy.getProxy();
    }
    @Test void repositoryProxySupportsRealSearchPath() {
        DocNativeStore proxy = repositoryProxy();
        assertNotSame(store, proxy);
        assertSame(jdbc, proxy.jdbc());
        when(jdbc.query(any(PreparedStatementCreator.class), org.mockito.ArgumentMatchers.<RowMapper<Long>>any()))
                .thenReturn(List.of(0L), List.of());
        var service = new DocNativeService(proxy, access, mock(DocNativeSpaceService.class), validation, mock(DocIndexService.class));
        Page page = service.search(null, null, "effective", 1, 20);
        assertEquals(0, page.total()); assertTrue(page.records().isEmpty());
    }
    @Test void repositoryProxySupportsSpaceMembershipReads() {
        var operators = mock(OperatorResolver.class);
        var proxy = repositoryProxy();
        var service = new DocNativeAccess(proxy, operators, permissions, new DocAclResolver(proxy));
        when(jdbc.queryForList(anyString(), eq(Integer.class), eq(3L), eq(7L))).thenReturn(List.of(READ));
        assertEquals(READ, service.member(3L, 7L));
    }
    @Test void privateKeyPatternIsRejectedWithoutEchoingContent() {
        String source = "-----BEGIN " + "PRIVATE KEY-----\n测试私钥内容";
        BusinessException error = assertThrows(BusinessException.class, () -> validation.content(input(3, source)));
        assertEquals(400, error.getCode()); assertFalse(error.getMessage().contains(source));
    }
}
