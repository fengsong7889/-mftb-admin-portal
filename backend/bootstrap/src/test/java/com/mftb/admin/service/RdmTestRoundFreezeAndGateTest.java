package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmTestBatchDTO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务20 A 段纯 Mockito 离线单测：冻结不可变测试轮次 + 多人执行 + fail-closed caseId 映射 + 门禁按冻结唯一用例集。
 *
 * <p><b>重要边界声明</b>：本测试以 mock 的 Mapper / executeOnce 驱动服务层编排逻辑，只验证「分支走向与门禁口径」，
 * <b>不等价于真实数据库并发证明</b>——真正的「多人并发追加执行 / 幂等只一个成功」依赖 MySQL 唯一索引与事务隔离，
 * 须在任务24 的集成/并发测试中以真实库验证。executeOnce 在此被 mock 为直接运行 supplier，以便验证业务分支。
 */
class RdmTestRoundFreezeAndGateTest {

    private static final long BATCH_ID = 900L;
    private static final long ITEM_ID = 500L;
    private static final long OTHER_ITEM = 501L;
    private static final long ROUND_ID = 700L;
    private static final long LEAD = 11L;
    private static final long TESTER1 = 21L;
    private static final long TESTER2 = 22L;
    private static final int SCOPE = 3;

    private RdmTestBatchMapper batchMapper;
    private RdmTestExecutionMapper executionMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmIssueMapper issueMapper;
    private RdmTestRoundMapper testRoundMapper;
    private RdmEvidenceInvalidationMapper evidenceInvalidationMapper;
    private RdmIdempotentService idempotentService;
    private RdmTestBatchService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        batchMapper = mock(RdmTestBatchMapper.class);
        executionMapper = mock(RdmTestExecutionMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        issueMapper = mock(RdmIssueMapper.class);
        RdmAccessGuard accessGuard = mock(RdmAccessGuard.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        testRoundMapper = mock(RdmTestRoundMapper.class);
        evidenceInvalidationMapper = mock(RdmEvidenceInvalidationMapper.class);
        idempotentService = mock(RdmIdempotentService.class);

        // executeOnce 直接运行 supplier（业务分支可测）；stableRequestHash 返回非空以构造合法幂等键
        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<Object>) inv.getArgument(1)).get());
        when(idempotentService.stableRequestHash(any())).thenReturn("stub-hash");
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        when(issueMapper.selectCount(any())).thenReturn(0L);
        when(executionMapper.selectCount(any())).thenReturn(0L);
        when(testRoundMapper.selectCount(any())).thenReturn(0L);
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(new ArrayList<>());

        service = new RdmTestBatchService(batchMapper, executionMapper, deliveryItemMapper, requirementMapper,
                issueMapper, accessGuard, bizSeqService, operatorResolver, testRoundMapper,
                // 任务33：失效过滤委派共享解析器，包同一个 mock Mapper 以保持桩数据口径不变
                new EvidenceValidityResolver(evidenceInvalidationMapper), idempotentService,
                mock(RdmDeliveryItemService.class));
    }

    /* ==================== 夹具 ==================== */

    private RdmTestBatch batch(int roundNo, String status, List<Long> itemIds, String caseSnapshotJson) {
        RdmTestBatch b = new RdmTestBatch();
        b.setId(BATCH_ID);
        b.setBatchNo("TC900");
        b.setRoundNo(roundNo);
        b.setStatus(status);
        b.setDeliveryItemIdsJson(JsonUtils.toJson(itemIds));
        b.setTestEnv("SIT");
        b.setTestLeadUserId(LEAD);
        b.setExecutorUserIdsJson(JsonUtils.toJson(List.of(TESTER1, TESTER2)));
        b.setBuildIdsJson(JsonUtils.toJson(List.of("BUILD-1")));
        b.setCaseSnapshotJson(caseSnapshotJson);
        return b;
    }

    private RdmDeliveryItem item(long id, int scopeVersion, String status) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(id);
        it.setScopeVersion(scopeVersion);
        it.setStatus(status);
        it.setTitle("item-" + id);
        return it;
    }

    private Map<String, Object> frozenCase(long itemId, String caseId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("deliveryItemId", itemId);
        m.put("caseId", caseId);
        m.put("caseTitle", "T-" + caseId);
        m.put("mandatory", true);
        m.put("scopeVersion", SCOPE);
        return m;
    }

    private RdmTestRound round(int roundNo, List<Map<String, Object>> cases) {
        RdmTestRound r = new RdmTestRound();
        r.setId(ROUND_ID);
        r.setBatchId(BATCH_ID);
        r.setRoundNo(roundNo);
        r.setTestEnv("SIT");
        r.setCaseSnapshotJson(JsonUtils.toJson(cases));
        r.setBuildMappingJson(JsonUtils.toJson(List.of()));
        return r;
    }

    private RdmTestExecution exec(long id, long itemId, String caseId, String result, int roundNo) {
        RdmTestExecution e = new RdmTestExecution();
        e.setId(id);
        e.setBatchId(BATCH_ID);
        e.setDeliveryItemId(itemId);
        e.setCaseId(caseId);
        e.setResult(result);
        e.setRoundNo(roundNo);
        return e;
    }

    /* ==================== A.1 受理即冻结不可变轮次 ==================== */

    @Test
    @DisplayName("A.1/A.2 受理冻结：缺失caseId按确定性规则分配、mandatory服务端判true、回填scopeVersion、写evidenceHash")
    void acceptFreezesImmutableRoundWithNormalizedCases() {
        String draft = "[{\"deliveryItemId\":500,\"caseTitle\":\"登录  成功\"},"
                + "{\"deliveryItemId\":500,\"caseTitle\":\"登录失败\"}]";
        RdmTestBatch b = batch(1, RdmConstants.TB_PENDING, List.of(ITEM_ID), draft);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));

        service.acceptBatch(BATCH_ID, LEAD);

        ArgumentCaptor<RdmTestRound> cap = ArgumentCaptor.forClass(RdmTestRound.class);
        verify(testRoundMapper).insert(cap.capture());
        RdmTestRound frozen = cap.getValue();
        assertEquals(BATCH_ID, frozen.getBatchId());
        assertEquals(1, frozen.getRoundNo());
        assertEquals(LEAD, frozen.getFrozenBy());
        assertNotNull(frozen.getFrozenAt());
        assertNotNull(frozen.getEvidenceHash());
        assertEquals(64, frozen.getEvidenceHash().length());

        List<Map<String, Object>> cases = JsonUtils.parseMapList(frozen.getCaseSnapshotJson());
        assertEquals(2, cases.size());
        for (Map<String, Object> c : cases) {
            assertNotNull(c.get("caseId"), "服务端必须为缺失 caseId 的用例分配稳定 caseId");
            assertTrue(String.valueOf(c.get("caseId")).startsWith("C-500-"), "确定性 caseId 前缀: " + c.get("caseId"));
            assertEquals(Boolean.TRUE, c.get("mandatory"), "mandatory 由服务端判 true，前端不能降级");
            assertEquals(SCOPE, ((Number) c.get("scopeVersion")).intValue(), "scopeVersion 由服务端回填");
        }
        // 规范化标题去多余空白
        assertTrue(frozen.getCaseSnapshotJson().contains("登录 成功"));
        // 批次推进为 executing
        assertEquals(RdmConstants.TB_EXECUTING, b.getStatus());
        verify(batchMapper).updateById(b);
    }

    @Test
    @DisplayName("A.2 确定性 caseId：同输入同 caseId（跨轮可对齐）")
    void deriveCaseIdIsDeterministic() {
        String draft = "[{\"deliveryItemId\":500,\"caseTitle\":\"用例A\"}]";
        RdmTestBatch b1 = batch(1, RdmConstants.TB_PENDING, List.of(ITEM_ID), draft);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b1);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        service.acceptBatch(BATCH_ID, LEAD);
        ArgumentCaptor<RdmTestRound> c1 = ArgumentCaptor.forClass(RdmTestRound.class);
        verify(testRoundMapper).insert(c1.capture());
        String caseId1 = String.valueOf(JsonUtils.parseMapList(c1.getValue().getCaseSnapshotJson()).get(0).get("caseId"));

        // 同一草稿再冻结一轮（复测新轮），caseId 必须一致
        RdmTestBatch b2 = batch(2, RdmConstants.TB_PENDING, List.of(ITEM_ID), draft);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b2);
        service.acceptBatch(BATCH_ID, LEAD);
        ArgumentCaptor<RdmTestRound> c2 = ArgumentCaptor.forClass(RdmTestRound.class);
        verify(testRoundMapper, atLeastOnce()).insert(c2.capture());
        RdmTestRound last = c2.getAllValues().get(c2.getAllValues().size() - 1);
        String caseId2 = String.valueOf(JsonUtils.parseMapList(last.getCaseSnapshotJson()).get(0).get("caseId"));
        assertEquals(caseId1, caseId2, "同输入必须得到同一稳定 caseId");
    }

    @Test
    @DisplayName("A.5 拒绝空冻结用例集")
    void acceptRejectsEmptyCaseSet() {
        RdmTestBatch b = batch(1, RdmConstants.TB_PENDING, List.of(ITEM_ID), "[]");
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.acceptBatch(BATCH_ID, LEAD));
        assertTrue(ex.getMessage().contains("拒絕凍結空用例集"), ex.getMessage());
        verify(testRoundMapper, never()).insert(any(RdmTestRound.class));
    }

    @Test
    @DisplayName("A.1 batchId+roundNo 唯一：已冻结的轮次不可重复冻结/修改")
    void acceptRejectsDuplicateFreeze() {
        RdmTestBatch b = batch(1, RdmConstants.TB_PENDING, List.of(ITEM_ID),
                "[{\"deliveryItemId\":500,\"caseTitle\":\"x\"}]");
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        when(testRoundMapper.selectCount(any())).thenReturn(1L);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.acceptBatch(BATCH_ID, LEAD));
        assertTrue(ex.getMessage().contains("已凍結"), ex.getMessage());
    }

    /* ==================== A.5 fail-closed caseId 映射 + scopeVersion 权威 ==================== */

    private RdmTestBatch executingWithFrozenRound() {
        RdmTestBatch b = batch(1, RdmConstants.TB_EXECUTING, List.of(ITEM_ID), null);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        RdmTestRound r = round(1, List.of(frozenCase(ITEM_ID, "CASE-A")));
        when(testRoundMapper.selectOne(any())).thenReturn(r);
        return b;
    }

    private RdmTestBatchDTO.Execute execDto(String caseId, String result, Integer scopeVersion, long itemId) {
        RdmTestBatchDTO.Execute dto = new RdmTestBatchDTO.Execute();
        dto.setDeliveryItemId(itemId);
        dto.setCaseId(caseId);
        dto.setResult(result);
        dto.setScopeVersion(scopeVersion);
        dto.setCaseTitle("T");
        return dto;
    }

    @Test
    @DisplayName("A.5 fail-closed：caseId 未映射到冻结用例集即拒绝，不静默接收")
    void submitExecutionRejectsUnknownCaseId() {
        executingWithFrozenRound();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitExecution(
                BATCH_ID, execDto("UNKNOWN", "pass", SCOPE, ITEM_ID), TESTER1, "T1"));
        assertTrue(ex.getMessage().contains("未映射到當前輪次凍結用例集"), ex.getMessage());
        verify(executionMapper, never()).insert(any(RdmTestExecution.class));
    }

    @Test
    @DisplayName("A.5 fail-closed：V3 录入缺失 caseId 即拒绝（不用 caseTitle 模糊兜底）")
    void submitExecutionRejectsMissingCaseId() {
        executingWithFrozenRound();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitExecution(
                BATCH_ID, execDto(null, "pass", SCOPE, ITEM_ID), TESTER1, "T1"));
        assertTrue(ex.getMessage().contains("必須攜帶 caseId"), ex.getMessage());
    }

    @Test
    @DisplayName("scopeVersion 以冻结轮次为权威：客户端传值不一致即拒绝")
    void submitExecutionRejectsScopeVersionMismatch() {
        executingWithFrozenRound();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitExecution(
                BATCH_ID, execDto("CASE-A", "pass", 9, ITEM_ID), TESTER1, "T1"));
        assertTrue(ex.getMessage().contains("scopeVersion 以凍結輪次為權威"), ex.getMessage());
        verify(executionMapper, never()).insert(any(RdmTestExecution.class));
    }

    @Test
    @DisplayName("A.2 张冠李戴防护：交付项不属于本批次即拒绝录入")
    void submitExecutionRejectsItemNotInBatch() {
        executingWithFrozenRound();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitExecution(
                BATCH_ID, execDto("CASE-A", "pass", SCOPE, OTHER_ITEM), TESTER1, "T1"));
        assertTrue(ex.getMessage().contains("不屬於本提測批次"), ex.getMessage());
    }

    @Test
    @DisplayName("A.2 happy path：录入盖章冻结事实(caseId/testRoundId/scopeVersion/evidenceJson)")
    void submitExecutionStampsFrozenFacts() {
        executingWithFrozenRound();
        when(executionMapper.selectList(any())).thenReturn(new ArrayList<>());
        RdmTestBatchDTO.Execute dto = execDto("CASE-A", "pass", SCOPE, ITEM_ID);
        dto.setEvidenceJson("{\"shot\":\"a.png\"}");
        dto.setRequestId("req-1");

        service.submitExecution(BATCH_ID, dto, TESTER1, "T1");

        ArgumentCaptor<RdmTestExecution> cap = ArgumentCaptor.forClass(RdmTestExecution.class);
        verify(executionMapper).insert(cap.capture());
        RdmTestExecution saved = cap.getValue();
        assertEquals("CASE-A", saved.getCaseId());
        assertEquals(ROUND_ID, saved.getTestRoundId());
        assertEquals(SCOPE, saved.getScopeVersion());
        assertEquals("{\"shot\":\"a.png\"}", saved.getEvidenceJson());
        assertEquals("req-1", saved.getRequestId());
        assertEquals(TESTER1, saved.getExecutorUserId());
    }

    @Test
    @DisplayName("A.2 多人追加：failed 批次仍可继续录入（不因第一条 fail 终止整批）")
    void submitExecutionAllowedOnFailedBatch() {
        RdmTestBatch b = batch(1, RdmConstants.TB_FAILED, List.of(ITEM_ID), null);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(testRoundMapper.selectOne(any())).thenReturn(round(1, List.of(frozenCase(ITEM_ID, "CASE-B"))));
        when(executionMapper.selectList(any())).thenReturn(new ArrayList<>());
        service.submitExecution(BATCH_ID, execDto("CASE-B", "pass", SCOPE, ITEM_ID), TESTER2, "T2");
        verify(executionMapper).insert(any(RdmTestExecution.class));
    }

    /* ==================== A.3/A.4/A.5/A.7/A.8 门禁 isTestPassed ==================== */

    private void stubGate(List<RdmTestExecution> execs, List<RdmEvidenceInvalidation> invalidations,
                          List<Map<String, Object>> cases) {
        RdmTestBatch b = batch(1, RdmConstants.TB_EXECUTING, List.of(ITEM_ID), null);
        when(batchMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(b)));
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(new ArrayList<>(invalidations));
        when(testRoundMapper.selectOne(any())).thenReturn(round(1, cases));
        when(executionMapper.selectList(any())).thenReturn(new ArrayList<>(execs));
    }

    @Test
    @DisplayName("A.3 同轮失败不被掩盖：一条 pass 不能覆盖同轮另一人的 fail")
    void gateRejectsWhenFailMaskedByPass() {
        stubGate(List.of(
                        exec(1, ITEM_ID, "CASE-A", "pass", 1),
                        exec(2, ITEM_ID, "CASE-A", "fail", 1)),
                List.of(), List.of(frozenCase(ITEM_ID, "CASE-A")));
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.4 skip ≠ 通过")
    void gateRejectsSkip() {
        stubGate(List.of(exec(1, ITEM_ID, "CASE-A", "skip", 1)),
                List.of(), List.of(frozenCase(ITEM_ID, "CASE-A")));
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.4 未执行 ≠ 通过（冻结必测用例无执行记录）")
    void gateRejectsNotExecuted() {
        stubGate(List.of(), List.of(), List.of(frozenCase(ITEM_ID, "CASE-A")));
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.5 分母是冻结唯一 caseId：必测全 pass 才通过")
    void gatePassesWhenAllMandatoryPass() {
        stubGate(List.of(
                        exec(1, ITEM_ID, "CASE-A", "pass", 1),
                        exec(2, ITEM_ID, "CASE-B", "pass", 1)),
                List.of(), List.of(frozenCase(ITEM_ID, "CASE-A"), frozenCase(ITEM_ID, "CASE-B")));
        assertTrue(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.5 部分必测通过不足以放行（CASE-B 未 pass）")
    void gateRejectsWhenPartialMandatoryPass() {
        stubGate(List.of(exec(1, ITEM_ID, "CASE-A", "pass", 1)),
                List.of(), List.of(frozenCase(ITEM_ID, "CASE-A"), frozenCase(ITEM_ID, "CASE-B")));
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.7 无有效批次 → 恒 false（绝不从 QA 任务进度推导）")
    void gateFalseWhenNoValidBatch() {
        when(batchMapper.selectList(any())).thenReturn(new ArrayList<>());
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.5 critical/major 未闭环缺陷阻断放行")
    void gateRejectsWhenBlockingIssue() {
        stubGate(List.of(exec(1, ITEM_ID, "CASE-A", "pass", 1)),
                List.of(), List.of(frozenCase(ITEM_ID, "CASE-A")));
        when(issueMapper.selectCount(any())).thenReturn(1L);
        assertFalse(service.isTestPassed(ITEM_ID));
    }

    @Test
    @DisplayName("A.8 + 失效过滤语义一致性：范围变更后旧提测批次登记失效即不再作为门禁凭证")
    void gateConsumesEvidenceInvalidationConsistently() {
        List<RdmTestExecution> passing = List.of(exec(1, ITEM_ID, "CASE-A", "pass", 1));
        List<Map<String, Object>> cases = List.of(frozenCase(ITEM_ID, "CASE-A"));

        // 无失效登记 → 有效批次通过
        stubGate(passing, List.of(), cases);
        assertTrue(service.isTestPassed(ITEM_ID), "无失效时有效证据应通过");

        // 登记该批次因范围变更失效 → 过滤后无有效批次 → 恒 false
        RdmEvidenceInvalidation inv = new RdmEvidenceInvalidation();
        inv.setDeliveryItemId(ITEM_ID);
        inv.setEvidenceType(RdmEvidenceInvalidation.TYPE_TEST_BATCH);
        inv.setEvidenceId(BATCH_ID);
        inv.setOldScopeVersion(SCOPE);
        inv.setNewScopeVersion(SCOPE + 1);
        stubGate(passing, List.of(inv), cases);
        assertFalse(service.isTestPassed(ITEM_ID), "失效过滤语义必须与「范围变更后旧证据失效」一致");
    }

    /* ==================== A.6 部分交付独立判断 ==================== */

    @Test
    @DisplayName("A.6 部分交付独立：某交付项全必测 pass 即独立推进至 pending_acceptance（整批未全通过）")
    void partialDeliveryAdvancesPassedItemIndependently() {
        RdmTestBatch b = batch(1, RdmConstants.TB_EXECUTING, List.of(ITEM_ID, OTHER_ITEM), null);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        RdmTestRound r = round(1, List.of(frozenCase(ITEM_ID, "CASE-A"), frozenCase(OTHER_ITEM, "CASE-B")));
        when(testRoundMapper.selectOne(any())).thenReturn(r);
        // 仅 CASE-A(item500) 有 pass 执行；CASE-B(item501) 未执行
        when(executionMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(exec(1, ITEM_ID, "CASE-A", "pass", 1))));
        when(executionMapper.selectCount(any())).thenReturn(0L);
        RdmDeliveryItem item500 = item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING);
        when(deliveryItemMapper.selectById(ITEM_ID)).thenReturn(item500);

        service.submitExecution(BATCH_ID, execDto("CASE-A", "pass", SCOPE, ITEM_ID), TESTER1, "T1");

        // item500 独立推进；批次整体保持 executing（item501 未通过）
        assertEquals(RdmConstants.DI_PENDING_ACCEPTANCE, item500.getStatus());
        verify(deliveryItemMapper).updateById(item500);
        assertEquals(RdmConstants.TB_EXECUTING, b.getStatus());
    }

    /* ==================== A.1 复测新轮冻结 ==================== */

    @Test
    @DisplayName("A.1 复测冻结新轮次(round+1)，旧轮次只读保留")
    void retestFreezesNewRound() {
        RdmTestBatch b = batch(1, RdmConstants.TB_FAILED, List.of(ITEM_ID),
                "[{\"deliveryItemId\":500,\"caseTitle\":\"用例A\"}]");
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        RdmTestBatchDTO.Retest dto = new RdmTestBatchDTO.Retest();
        dto.setReason("回歸失敗，修復後複測");

        service.retestBatch(BATCH_ID, dto, LEAD);

        ArgumentCaptor<RdmTestRound> cap = ArgumentCaptor.forClass(RdmTestRound.class);
        verify(testRoundMapper).insert(cap.capture());
        assertEquals(2, cap.getValue().getRoundNo(), "复测冻结 round+1 的新轮次");
        assertEquals(2, b.getRoundNo());
        assertEquals(RdmConstants.TB_EXECUTING, b.getStatus());
    }

    /* ==================== A.9 executeOnce 幂等接入 ==================== */

    @Test
    @DisplayName("A.9 executeOnce 接入：受理/执行/复测均以服务端派生键走原子幂等")
    void executeOnceWiredForAllWriteOps() {
        // 受理
        RdmTestBatch pending = batch(1, RdmConstants.TB_PENDING, List.of(ITEM_ID),
                "[{\"deliveryItemId\":500,\"caseTitle\":\"x\"}]");
        when(batchMapper.selectById(BATCH_ID)).thenReturn(pending);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        service.acceptBatch(BATCH_ID, LEAD);

        // 执行
        RdmTestBatch executing = batch(1, RdmConstants.TB_EXECUTING, List.of(ITEM_ID), null);
        when(batchMapper.selectById(BATCH_ID)).thenReturn(executing);
        when(testRoundMapper.selectOne(any())).thenReturn(round(1, List.of(frozenCase(ITEM_ID, "CASE-A"))));
        when(executionMapper.selectList(any())).thenReturn(new ArrayList<>());
        service.submitExecution(BATCH_ID, execDto("CASE-A", "pass", SCOPE, ITEM_ID), TESTER1, "T1");

        ArgumentCaptor<IdempotentKey> cap = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService, atLeastOnce()).executeOnce(cap.capture(), any(), any());
        List<String> bizTypes = cap.getAllValues().stream().map(IdempotentKey::getBizType).toList();
        assertTrue(bizTypes.contains("rdm_test_accept"), "受理接入 executeOnce");
        assertTrue(bizTypes.contains("rdm_test_exec"), "执行接入 executeOnce");
        IdempotentKey execKey = cap.getAllValues().stream()
                .filter(k -> "rdm_test_exec".equals(k.getBizType())).findFirst().orElseThrow();
        assertEquals("test_batch:" + BATCH_ID, execKey.getResourceKey());
        assertTrue(execKey.getClientRequestId().startsWith("exec:round1:CASE-A:"), execKey.getClientRequestId());
        assertEquals(TESTER1, execKey.getUserId());
    }

    @Test
    @DisplayName("executeOnce 派生键：userId 为空 fail-closed（登录态失效）")
    void nullUserRejected() {
        assertThrows(BusinessException.class,
                () -> service.submitExecution(BATCH_ID, execDto("CASE-A", "pass", SCOPE, ITEM_ID), null, "x"));
    }

    @Test
    @DisplayName("A.9 复测接入 executeOnce（派生 retest 键）")
    void retestWiredToExecuteOnce() {
        RdmTestBatch b = batch(1, RdmConstants.TB_EXECUTING, List.of(ITEM_ID),
                "[{\"deliveryItemId\":500,\"caseTitle\":\"x\"}]");
        when(batchMapper.selectById(BATCH_ID)).thenReturn(b);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item(ITEM_ID, SCOPE, RdmConstants.DI_TESTING)));
        RdmTestBatchDTO.Retest dto = new RdmTestBatchDTO.Retest();
        dto.setReason("複測");
        service.retestBatch(BATCH_ID, dto, LEAD);
        ArgumentCaptor<IdempotentKey> cap = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(cap.capture(), any(), any());
        assertEquals("rdm_test_retest", cap.getValue().getBizType());
        assertTrue(cap.getValue().getClientRequestId().startsWith("retest:round2:"), cap.getValue().getClientRequestId());
    }
}
