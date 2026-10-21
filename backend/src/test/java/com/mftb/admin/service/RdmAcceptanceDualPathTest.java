package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmAcceptanceRecordDTO;
import com.mftb.admin.dto.RdmAcceptanceRecordVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务20 B 段纯 Mockito 离线单测：双路径验收 + 顺序前置 + 四眼 + conditional 语义 + 最新适用证据 + open 事实门禁 + 归属核对。
 *
 * <p><b>重要边界声明</b>：本测试以 mock 的 Mapper / accessGuard / executeOnce / RdmTestBatchService 驱动服务层编排逻辑，
 * 只验证「分支走向与门禁口径」，<b>不等价于真实数据库并发证明</b>；真实并发/幂等唯一约束须在任务24 集成测试验证。
 * <p>{@code isOpenFactEstablished} 原为任务21 协调点（保守恒 false）；<b>任务27 已接到真实开放事实</b>
 * （委派 {@link RdmOpenFactService} 只读判定，门禁编排与 protected 签名未变）。
 * 本测试默认注入 mock 的 openFactService（返回 false，与任务20/21 保守语义一致），
 * 并继续用 spy 覆盖以验证「已建立开放事实」分支；<b>既有断言一律保留，不做任何弱化</b>。
 */
class RdmAcceptanceDualPathTest {

    private static final long ITEM_ID = 500L;
    private static final long PRODUCT_ACCEPTOR = 31L;
    private static final long BIZ_ACCEPTOR = 32L;
    private static final int SCOPE = 4;
    private static final String PRODUCT = RdmConstants.ACCEPTANCE_TYPE_PRODUCT;
    private static final String BUSINESS = RdmConstants.ACCEPTANCE_TYPE_BUSINESS;
    private static final String PRE = RdmConstants.ACCEPT_STAGE_PRE;
    private static final String POST = RdmConstants.ACCEPT_STAGE_POST;
    private static final String PASS = RdmConstants.ACCEPT_PASS;
    private static final String FAIL = RdmConstants.ACCEPT_FAIL;
    private static final String COND = RdmConstants.ACCEPT_CONDITIONAL;
    private static final String VALID_CONDITIONS =
            "[{\"condition\":\"修復導出亂碼\",\"deadline\":\"2026-11-01\",\"owner\":\"張三\"}]";

    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmAccessGuard accessGuard;
    private RdmTestBatchService testBatchService;
    private RdmEvidenceInvalidationMapper evidenceInvalidationMapper;
    private RdmIdempotentService idempotentService;
    /** 任务27 新增构造依赖：开放事实只读判定（默认 mock 返回 false，与任务20 保守语义一致） */
    private RdmOpenFactService openFactService;
    private RdmAcceptanceRecordService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        accessGuard = mock(RdmAccessGuard.class);
        testBatchService = mock(RdmTestBatchService.class);
        evidenceInvalidationMapper = mock(RdmEvidenceInvalidationMapper.class);
        idempotentService = mock(RdmIdempotentService.class);
        openFactService = mock(RdmOpenFactService.class);

        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<Object>) inv.getArgument(1)).get());
        when(idempotentService.stableRequestHash(any())).thenReturn("stub-hash");
        when(bizSeqService.next(any())).thenReturn("AR0001");
        when(acceptanceRecordMapper.selectCount(any())).thenReturn(0L);
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(new ArrayList<>());
        // 默认测试已通过、无历史验收记录
        when(testBatchService.isTestPassed(ITEM_ID)).thenReturn(true);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>());
        // 任务27：开放事实默认未建立（mock 默认即 false，此处显式声明以锁死口径）
        when(openFactService.isOpenFactEstablished(anyLong())).thenReturn(false);

        service = new RdmAcceptanceRecordService(acceptanceRecordMapper, deliveryItemMapper, requirementMapper,
                bizSeqService, accessGuard, testBatchService,
                // 任务33：失效过滤委派共享解析器，包同一个 mock Mapper 以保持桩数据口径不变
                new EvidenceValidityResolver(evidenceInvalidationMapper), idempotentService,
                openFactService,
                // 验收写入后重算交付项状态：本用例只验证验收链路，重算用 mock 隔离
                mock(RdmDeliveryItemService.class));
    }

    /* ==================== 夹具 ==================== */

    private RdmDeliveryItem item(String path) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(ITEM_ID);
        it.setReqId(100L);
        it.setScopeVersion(SCOPE);
        it.setAcceptancePath(path);
        it.setProductAcceptorUserId(PRODUCT_ACCEPTOR);
        it.setBizAcceptorUserId(BIZ_ACCEPTOR);
        it.setTitle("item");
        return it;
    }

    private RdmAcceptanceRecord rec(long id, String type, String stage, String conclusion, Integer scope, long signer) {
        RdmAcceptanceRecord r = new RdmAcceptanceRecord();
        r.setId(id);
        r.setRecordNo("AR" + id);
        r.setDeliveryItemId(ITEM_ID);
        r.setAcceptanceType(type);
        r.setStage(stage);
        r.setConclusion(conclusion);
        r.setScopeVersion(scope);
        r.setSignerUserId(signer);
        return r;
    }

    private RdmAcceptanceRecordDTO.Submit dto(String type, String stage, String conclusion, Integer score) {
        RdmAcceptanceRecordDTO.Submit d = new RdmAcceptanceRecordDTO.Submit();
        d.setAcceptanceType(type);
        d.setStage(stage);
        d.setConclusion(conclusion);
        d.setScore(score);
        return d;
    }

    private void givenItem(String path) {
        when(deliveryItemMapper.selectById(ITEM_ID)).thenReturn(item(path));
    }

    /* ==================== B.1 白名单校验 ==================== */

    @Test
    @DisplayName("B.1 白名单：非法验收类型/阶段/结论一律拒绝")
    void whiteListRejectsBadEnums() {
        givenItem(RdmConstants.PATH_A);
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto("xxx", PRE, PASS, null), PRODUCT_ACCEPTOR, "P")).getMessage().contains("非法的驗收類型"));
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(PRODUCT, "mid", PASS, null), PRODUCT_ACCEPTOR, "P")).getMessage().contains("非法的驗收階段"));
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(PRODUCT, PRE, "maybe", null), PRODUCT_ACCEPTOR, "P")).getMessage().contains("非法的驗收結論"));
        verify(acceptanceRecordMapper, never()).insert(any(RdmAcceptanceRecord.class));
    }

    /* ==================== B.4 前置：测试必须通过 ==================== */

    @Test
    @DisplayName("B.4 验收前置：isTestPassed 为假时拒绝任何验收")
    void requiresTestPassedBeforeAcceptance() {
        givenItem(RdmConstants.PATH_A);
        when(testBatchService.isTestPassed(ITEM_ID)).thenReturn(false);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(PRODUCT, PRE, PASS, null), PRODUCT_ACCEPTOR, "P"));
        assertTrue(ex.getMessage().contains("測試尚未通過"), ex.getMessage());
    }

    /* ==================== B.2/B.3 路径与阶段 ==================== */

    @Test
    @DisplayName("B.2 路径A：产品验收 pre_release pass 可提交，签署人来自认证主体")
    void pathAProductPreReleaseOk() {
        givenItem(RdmConstants.PATH_A);
        service.submitAcceptance(ITEM_ID, dto(PRODUCT, PRE, PASS, null), PRODUCT_ACCEPTOR, "P");
        ArgumentCaptor<RdmAcceptanceRecord> cap = ArgumentCaptor.forClass(RdmAcceptanceRecord.class);
        verify(acceptanceRecordMapper).insert(cap.capture());
        RdmAcceptanceRecord saved = cap.getValue();
        assertEquals(PRODUCT, saved.getAcceptanceType());
        assertEquals(PRE, saved.getStage());
        assertEquals(SCOPE, saved.getScopeVersion(), "scopeVersion 以交付项当前范围版本为权威回填");
        assertEquals(PRODUCT_ACCEPTOR, saved.getSignerUserId(), "B.8 签署身份来自认证主体 SysUser.id");
    }

    @Test
    @DisplayName("B.2 产品验收必须 pre_release：post_release 产品验收被拒")
    void productRejectsPostRelease() {
        givenItem(RdmConstants.PATH_A);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(PRODUCT, POST, PASS, null), PRODUCT_ACCEPTOR, "P"));
        assertTrue(ex.getMessage().contains("產品驗收必須在上線前"), ex.getMessage());
    }

    @Test
    @DisplayName("B.4 顺序强制：业务验收前必须先有产品验收 pass")
    void businessRequiresProductPassFirst() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>()); // 无产品验收
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("業務驗收前必須先完成產品驗收"), ex.getMessage());
    }

    @Test
    @DisplayName("B.2 路径A：产品 pass 后业务验收 pre_release 可提交")
    void pathABusinessAfterProductPass() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        service.submitAcceptance(ITEM_ID, dto(BUSINESS, PRE, PASS, 5), BIZ_ACCEPTOR, "B");
        verify(acceptanceRecordMapper).insert(any(RdmAcceptanceRecord.class));
    }

    @Test
    @DisplayName("B.2 路径A：业务验收阶段必须 pre_release，post_release 被拒")
    void pathABusinessRejectsPostRelease() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, POST, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("路徑A的業務驗收必須在上線前"), ex.getMessage());
    }

    @Test
    @DisplayName("B.3 路径B：业务验收阶段必须 post_release，pre_release 被拒")
    void pathBBusinessRejectsPreRelease() {
        givenItem(RdmConstants.PATH_B);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("路徑B的業務驗收必須在上線後"), ex.getMessage());
    }

    /* ==================== B.4 open 事实门禁（任务21 协调点） ==================== */

    @Test
    @DisplayName("B.4 路径B post_release 业务验收：无开放事实时保守拒绝（发布/开放属任务21）")
    void pathBPostReleaseRejectedWithoutOpenFact() {
        givenItem(RdmConstants.PATH_B);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, POST, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("開放事實"), ex.getMessage());
        verify(acceptanceRecordMapper, never()).insert(any(RdmAcceptanceRecord.class));
    }

    @Test
    @DisplayName("B.4 开放事实建立后（spy 覆盖 isOpenFactEstablished=true）路径B业务验收可提交")
    void pathBPostReleaseAllowedWhenOpenFactEstablished() {
        givenItem(RdmConstants.PATH_B);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        RdmAcceptanceRecordService spyService = spy(service);
        doReturn(true).when(spyService).isOpenFactEstablished(anyLong());
        spyService.submitAcceptance(ITEM_ID, dto(BUSINESS, POST, PASS, 5), BIZ_ACCEPTOR, "B");
        verify(acceptanceRecordMapper).insert(any(RdmAcceptanceRecord.class));
    }

    @Test
    @DisplayName("任务27 B.4 开放事实已接真实判定：openFactService 报已建立时路径B业务验收放行（无需 spy）")
    void pathBPostReleaseAllowedWhenOpenFactServiceReportsEstablished() {
        givenItem(RdmConstants.PATH_B);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        // 不 spy：直接让真实依赖 RdmOpenFactService 报「已建立开放事实」，验证任务27 委派链路已接通
        when(openFactService.isOpenFactEstablished(ITEM_ID)).thenReturn(true);
        service.submitAcceptance(ITEM_ID, dto(BUSINESS, POST, PASS, 5), BIZ_ACCEPTOR, "B");
        verify(acceptanceRecordMapper).insert(any(RdmAcceptanceRecord.class));
    }

    @Test
    @DisplayName("任务27 B.4 回滚后开放事实回 false：路径B post_release 业务验收被重新门禁")
    void pathBPostReleaseRejectedAgainAfterOpenFactRevoked() {
        givenItem(RdmConstants.PATH_B);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        // 模拟回滚撤销开放事实后的状态：必须重新阻断，不得凭已回滚的上线继续验收
        when(openFactService.isOpenFactEstablished(ITEM_ID)).thenReturn(false);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, POST, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("開放事實"), ex.getMessage());
        verify(acceptanceRecordMapper, never()).insert(any(RdmAcceptanceRecord.class));
    }

    /* ==================== B.5 conditional 语义 ==================== */

    @Test
    @DisplayName("B.5 产品验收 conditional 不算通过：后续业务验收被拒")
    void productConditionalDoesNotCountAsPass() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, COND, SCOPE, PRODUCT_ACCEPTOR))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("業務驗收前必須先完成產品驗收"), ex.getMessage());
    }

    @Test
    @DisplayName("B.5 业务验收 conditional 必须带结构化条件，缺则拒绝")
    void businessConditionalRequiresConditions() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        RdmAcceptanceRecordDTO.Submit noCond = dto(BUSINESS, PRE, COND, 4);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.submitAcceptance(ITEM_ID, noCond, BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("必須填寫結構化整改條件"), ex.getMessage());
    }

    @Test
    @DisplayName("B.5 业务验收 conditional 条件缺责任人字段被拒；完整条件通过")
    void businessConditionalRejectsIncompleteConditions() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        RdmAcceptanceRecordDTO.Submit incomplete = dto(BUSINESS, PRE, COND, 4);
        incomplete.setConditionsJson("[{\"condition\":\"修復\",\"deadline\":\"2026-11-01\"}]"); // 缺 owner
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, incomplete, BIZ_ACCEPTOR, "B")).getMessage().contains("條件/期限/責任人"));

        RdmAcceptanceRecordDTO.Submit complete = dto(BUSINESS, PRE, COND, 4);
        complete.setConditionsJson(VALID_CONDITIONS);
        service.submitAcceptance(ITEM_ID, complete, BIZ_ACCEPTOR, "B");
        verify(acceptanceRecordMapper).insert(any(RdmAcceptanceRecord.class));
    }

    /* ==================== B.7 正式评分 ==================== */

    @Test
    @DisplayName("B.7 业务验收必须正式评分 1-5，缺失被拒；产品评分独立可空")
    void businessRequiresScore() {
        givenItem(RdmConstants.PATH_A);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, null), BIZ_ACCEPTOR, "B")).getMessage().contains("1-5 分"));
        assertTrue(assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 9), BIZ_ACCEPTOR, "B")).getMessage().contains("1-5 分"));
    }

    /* ==================== B.8 四眼与身份 ==================== */

    @Test
    @DisplayName("B.8 四眼：业务签署人不得与产品签署人为同一人")
    void fourEyesBizSignerMustDifferFromProduct() {
        givenItem(RdmConstants.PATH_A);
        // 产品验收由 BIZ_ACCEPTOR 本人签（同一人），再由其提交业务验收 → 违反四眼
        when(acceptanceRecordMapper.selectList(any())).thenReturn(
                new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, BIZ_ACCEPTOR))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 5), BIZ_ACCEPTOR, "B"));
        assertTrue(ex.getMessage().contains("四眼原則"), ex.getMessage());
    }

    @Test
    @DisplayName("B.8 管理员不得代业务签字：签署守卫 fail-closed 抛错时透传")
    void adminCannotSignBusiness() {
        givenItem(RdmConstants.PATH_A);
        doThrow(new BusinessException("僅交付項的業務驗收人可以執行此操作"))
                .when(accessGuard).requireBizAcceptor(ITEM_ID, 9L);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(
                ITEM_ID, dto(BUSINESS, PRE, PASS, 5), 9L, "admin"));
        assertTrue(ex.getMessage().contains("業務驗收人"), ex.getMessage());
        verify(acceptanceRecordMapper, never()).insert(any(RdmAcceptanceRecord.class));
    }

    /* ==================== B.6 scopeVersion 权威 + 最新适用证据 ==================== */

    @Test
    @DisplayName("B.6 scopeVersion 以交付项当前范围版本为权威，客户端传值不一致被拒")
    void scopeVersionAuthoritative() {
        givenItem(RdmConstants.PATH_A);
        RdmAcceptanceRecordDTO.Submit d = dto(PRODUCT, PRE, PASS, null);
        d.setScopeVersion(SCOPE + 1);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.submitAcceptance(ITEM_ID, d, PRODUCT_ACCEPTOR, "P"));
        assertTrue(ex.getMessage().contains("scopeVersion 以交付項當前範圍版本為權威"), ex.getMessage());
    }

    @Test
    @DisplayName("B.6 门禁取最新适用证据：同范围下最新为 fail 时早期 pass 不算通过")
    void gateUsesLatestValidEvidenceNotHistoricalPass() {
        // 旧 pass(id1) → 新 fail(id2)，同一 scope
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(
                rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR),
                rec(2, PRODUCT, PRE, FAIL, SCOPE, PRODUCT_ACCEPTOR))));
        assertFalse(service.hasProductAcceptancePassed(ITEM_ID, SCOPE), "最新为 fail，早期 pass 不算通过");

        // 旧 fail(id1) → 新 pass(id2)
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(
                rec(1, PRODUCT, PRE, FAIL, SCOPE, PRODUCT_ACCEPTOR),
                rec(2, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR))));
        assertTrue(service.hasProductAcceptancePassed(ITEM_ID, SCOPE), "最新为 pass 才算通过");
    }

    @Test
    @DisplayName("B.5 门禁：最新有效结论为 conditional 不算通过")
    void gateConditionalNotPassed() {
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(
                rec(1, BUSINESS, PRE, COND, SCOPE, BIZ_ACCEPTOR))));
        assertFalse(service.hasBizAcceptancePassed(ITEM_ID, SCOPE));
    }

    @Test
    @DisplayName("B.6 门禁按 scopeVersion 隔离：其他范围版本的 pass 不算当前范围通过")
    void gateIsolatedByScopeVersion() {
        when(acceptanceRecordMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(
                rec(1, PRODUCT, PRE, PASS, SCOPE - 1, PRODUCT_ACCEPTOR))));
        assertFalse(service.hasProductAcceptancePassed(ITEM_ID, SCOPE), "旧范围版本的 pass 不代表当前范围通过");
    }

    @Test
    @DisplayName("B.6 + 失效过滤语义一致性：范围变更后旧验收记录登记失效即不再作为门禁凭证")
    void gateConsumesAcceptanceInvalidationConsistently() {
        List<RdmAcceptanceRecord> passing = new ArrayList<>(List.of(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR)));
        // 无失效 → 通过
        when(acceptanceRecordMapper.selectList(any())).thenReturn(passing);
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(new ArrayList<>());
        assertTrue(service.hasProductAcceptancePassed(ITEM_ID, SCOPE));

        // 登记该验收记录因范围变更失效 → 过滤后无有效 pass → false
        RdmEvidenceInvalidation inv = new RdmEvidenceInvalidation();
        inv.setDeliveryItemId(ITEM_ID);
        inv.setEvidenceType(RdmEvidenceInvalidation.TYPE_ACCEPTANCE);
        inv.setEvidenceId(1L);
        inv.setOldScopeVersion(SCOPE);
        inv.setNewScopeVersion(SCOPE + 1);
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(inv)));
        assertFalse(service.hasProductAcceptancePassed(ITEM_ID, SCOPE),
                "失效过滤语义必须与「范围变更后旧验收证据失效」一致");
    }

    /* ==================== B.9 记录归属核对 ==================== */

    @Test
    @DisplayName("B.9 归属核对：详情 recordId 与路径 deliveryItemId 不一致时拒绝")
    void detailEnforcesOwnership() {
        when(acceptanceRecordMapper.selectById(1L)).thenReturn(rec(1, PRODUCT, PRE, PASS, SCOPE, PRODUCT_ACCEPTOR));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.getRecordDetail(1L, 999L));
        assertTrue(ex.getMessage().contains("驗收記錄不屬於該交付項"), ex.getMessage());
        RdmAcceptanceRecordVO.Detail ok = service.getRecordDetail(1L, ITEM_ID);
        assertNotNull(ok);
        assertEquals(ITEM_ID, ok.getDeliveryItemId());
    }

    /* ==================== B.10 executeOnce 幂等接入 ==================== */

    @Test
    @DisplayName("B.10 executeOnce 接入：提交验收以服务端派生键走原子幂等")
    void executeOnceWiredForSubmit() {
        givenItem(RdmConstants.PATH_A);
        service.submitAcceptance(ITEM_ID, dto(PRODUCT, PRE, PASS, null), PRODUCT_ACCEPTOR, "P");
        ArgumentCaptor<IdempotentKey> cap = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(cap.capture(), any(), any());
        IdempotentKey key = cap.getValue();
        assertEquals("rdm_accept_submit", key.getBizType());
        assertEquals("delivery_item:" + ITEM_ID, key.getResourceKey());
        assertTrue(key.getClientRequestId().startsWith("accept:product:pre_release:"), key.getClientRequestId());
        assertEquals(PRODUCT_ACCEPTOR, key.getUserId());
    }

    @Test
    @DisplayName("B.10 executeOnce 派生键：登录态失效（userId 为空）fail-closed")
    void nullUserRejected() {
        givenItem(RdmConstants.PATH_A);
        assertThrows(BusinessException.class,
                () -> service.submitAcceptance(ITEM_ID, dto(PRODUCT, PRE, PASS, null), null, "P"));
    }
}
