package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionDecisionMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionMapper;
import com.mftb.admin.mapper.RdmSupplementaryVerificationMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 任务27「紧急豁免 + 仅产品补验闭环」纯 Mockito 离线单测。
 *
 * <p>锁死 leader 强调的四条口径（全部 fail-closed）：
 * <ol>
 *   <li><b>只可豁免缺失的产品验收，业务验收永不可豁免</b>：缺失清单由服务端按当前范围版本计算，
 *       路径A 缺业务验收直接拒绝；</li>
 *   <li><b>豁免也要四眼</b>：裁决人不得是申请人本人（管理员亦不得自批）；{@code product_risk} 仅
 *       缺失项产品验收人可签、{@code release} 须项目成员；两类裁决齐备且均 approved 才生效；</li>
 *   <li><b>补验期限按补验人真实工作日历</b>：{@code addWorkingDays(today, days, verifierId)} 冻结 deadline，
 *       {@code calendar_version=workday:v1:<verifierId>}，逾期用 {@code overdueWorkingDays} 判定不用 cron，
 *       补验失败即升级整改；</li>
 *   <li><b>豁免只豁免发布时序、不豁免开放</b>：{@code isProductAcceptanceEstablished} 要求真实验收 pass
 *       或补验单 completed+pass，pending/overdue/failed 一律阻断开放。</li>
 * </ol>
 *
 * <p><b>边界声明</b>：以 mock 依赖驱动分支走向，不等价于真实数据库/并发证明（须在任务24 集成测试验证）。
 */
class RdmReleaseExemptionServiceTest {

    private static final long BATCH_ID = 900L;
    private static final long PROJECT_ID = 77L;
    private static final long ITEM_ID = 500L;
    private static final long OTHER_ITEM_ID = 501L;
    private static final long EXEMPTION_ID = 8800L;
    private static final long SUPPLEMENTARY_ID = 7700L;
    private static final long RECORD_ID = 6600L;
    private static final long OWNER_ID = 11L;      // 发布负责人 = 豁免申请人
    private static final long APPROVER_ID = 22L;   // 项目成员 = release 裁决签署人
    private static final long ACCEPTOR_ID = 33L;   // 缺失项产品验收人 = product_risk 裁决签署人 / 补验人
    private static final long OTHER_ID = 44L;      // 无关人员
    private static final int SCOPE_VERSION = 4;
    private static final String SYS_A = "SYS_A";
    private static final String BUILD_A = "build-a-1";

    private RdmReleaseExemptionMapper exemptionMapper;
    private RdmReleaseExemptionDecisionMapper exemptionDecisionMapper;
    private RdmSupplementaryVerificationMapper supplementaryMapper;
    private RdmReleaseBatchMapper batchMapper;
    private RdmReleaseDeploymentMapper deploymentMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmAcceptanceRecordService acceptanceRecordService;
    private RdmWorkingDayCalculator workingDayCalculator;
    private RdmFlowVersionGuard flowVersionGuard;
    private RdmAccessGuard accessGuard;
    private RdmIdempotentService idempotentService;
    private OperatorResolver operatorResolver;
    private RdmReleaseExemptionService service;

    @BeforeEach
    void setUp() {
        exemptionMapper = mock(RdmReleaseExemptionMapper.class);
        exemptionDecisionMapper = mock(RdmReleaseExemptionDecisionMapper.class);
        supplementaryMapper = mock(RdmSupplementaryVerificationMapper.class);
        batchMapper = mock(RdmReleaseBatchMapper.class);
        deploymentMapper = mock(RdmReleaseDeploymentMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        acceptanceRecordService = mock(RdmAcceptanceRecordService.class);
        workingDayCalculator = mock(RdmWorkingDayCalculator.class);
        flowVersionGuard = mock(RdmFlowVersionGuard.class);
        accessGuard = mock(RdmAccessGuard.class);
        idempotentService = mock(RdmIdempotentService.class);
        operatorResolver = mock(OperatorResolver.class);

        // executeOnce 直接执行业务动作（模拟原子占位后回放）
        doAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get())
                .when(idempotentService).executeOnce(any(), any(), any());
        doReturn("stub-hash").when(idempotentService).stableRequestHash(any());

        // 默认现场：批次部署中、路径A、产品验收缺失、业务验收通过、构建齐全
        doReturn(batch(RdmConstants.RB_DEPLOYING)).when(batchMapper).selectById(BATCH_ID);
        doReturn(new ArrayList<>(List.of(deployment(SYS_A, BUILD_A)))).when(deploymentMapper).selectList(any());
        doReturn(item(ITEM_ID, SCOPE_VERSION, RdmConstants.PATH_A, ACCEPTOR_ID)).when(deliveryItemMapper).selectById(ITEM_ID);
        doReturn(true).when(acceptanceRecordService).hasBizAcceptancePassed(anyLong(), any());
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(anyLong(), any());
        doReturn(1).when(flowVersionGuard).productVerificationDays();
        doReturn(LocalDate.now().plusDays(1)).when(workingDayCalculator).addWorkingDays(any(), anyInt(), any());
        // insert 回填 id，供补验单绑定 exemptionId
        doAnswer(inv -> {
            ((RdmReleaseExemption) inv.getArgument(0)).setId(EXEMPTION_ID);
            return 1;
        }).when(exemptionMapper).insert(any(RdmReleaseExemption.class));
        // 默认无在途豁免、无既有裁决
        doReturn(null).when(exemptionMapper).selectOne(any());
        doReturn(null).when(exemptionDecisionMapper).selectOne(any());

        service = new RdmReleaseExemptionService(exemptionMapper, exemptionDecisionMapper, supplementaryMapper,
                batchMapper, deploymentMapper, deliveryItemMapper, acceptanceRecordMapper, acceptanceRecordService,
                workingDayCalculator, flowVersionGuard, accessGuard, idempotentService, operatorResolver);
    }

    /* ==================== 夹具 ==================== */

    private static RdmReleaseBatch batch(String status) {
        RdmReleaseBatch b = new RdmReleaseBatch();
        b.setId(BATCH_ID);
        b.setBatchNo("RB20261015001");
        b.setVersionTag("v1.0.0");
        b.setProjectId(PROJECT_ID);
        b.setStatus(status);
        b.setApplicantUserId(OWNER_ID);
        b.setVersion(3);
        b.setApplicationVersion(1);
        b.setScopeSnapshotJson(JsonUtils.toJson(List.of(scopeRow(ITEM_ID, SCOPE_VERSION, RdmConstants.PATH_A))));
        return b;
    }

    private static RdmReleaseDeployment deployment(String systemCode, String buildId) {
        RdmReleaseDeployment d = new RdmReleaseDeployment();
        d.setReleaseBatchId(BATCH_ID);
        d.setSystemCode(systemCode);
        d.setBuildId(buildId);
        d.setDeployOrder(1);
        d.setDeployStatus(RdmConstants.DEPLOY_PENDING);
        return d;
    }

    private static RdmDeliveryItem item(long id, int scopeVersion, String path, Long productAcceptorId) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(id);
        it.setItemNo("DI-" + id);
        it.setTitle("交付项" + id);
        it.setScopeVersion(scopeVersion);
        it.setAcceptancePath(path);
        it.setProductAcceptorUserId(productAcceptorId);
        it.setProductAcceptorUserName("验收人" + productAcceptorId);
        it.setStatus(RdmConstants.DI_PENDING_RELEASE);
        return it;
    }

    private static RdmReleaseExemption exemption(long id, long applicantId) {
        RdmReleaseExemption e = new RdmReleaseExemption();
        e.setId(id);
        e.setReleaseBatchId(BATCH_ID);
        e.setApplicationVersion(4);
        e.setApplicantUserId(applicantId);
        e.setReason("紧急上线");
        e.setRisk("低风险");
        e.setRollbackPlan("执行回滚脚本");
        e.setMissingAcceptanceJson(JsonUtils.toJson(List.of(missingRow(ITEM_ID, SCOPE_VERSION))));
        e.setScopeSnapshotJson(JsonUtils.toJson(List.of(scopeRow(ITEM_ID, SCOPE_VERSION, RdmConstants.PATH_A))));
        e.setBuildMappingJson(JsonUtils.toJson(List.of(buildRow(SYS_A, BUILD_A))));
        e.setEvidenceHash("evidence-hash-1");
        return e;
    }

    private static RdmReleaseExemptionDecision decision(String type, String result) {
        RdmReleaseExemptionDecision d = new RdmReleaseExemptionDecision();
        d.setExemptionId(EXEMPTION_ID);
        d.setDecisionType(type);
        d.setDecision(result);
        d.setSignerUserId(APPROVER_ID);
        return d;
    }

    private static RdmSupplementaryVerification supplementary(long id, String status, Long verifierId) {
        RdmSupplementaryVerification sv = new RdmSupplementaryVerification();
        sv.setId(id);
        sv.setReleaseBatchId(BATCH_ID);
        sv.setDeliveryItemId(ITEM_ID);
        sv.setScopeVersion(SCOPE_VERSION);
        sv.setBuildId(BUILD_A);
        sv.setVerificationType(RdmConstants.SUPPLEMENTARY_TYPE_PRODUCT);
        sv.setExemptionId(EXEMPTION_ID);
        sv.setVerifierUserId(verifierId);
        sv.setDeadline(LocalDateTime.now().plusDays(1));
        sv.setCalendarVersion(RdmConstants.CALENDAR_VERSION_WORKDAY_PREFIX + verifierId);
        sv.setStatus(status);
        sv.setEscalated(0);
        sv.setEscalationLevel(0);
        sv.setVersion(0);
        return sv;
    }

    private static RdmAcceptanceRecord record(long id, long itemId, String type, Integer scopeVersion, String conclusion) {
        RdmAcceptanceRecord r = new RdmAcceptanceRecord();
        r.setId(id);
        r.setRecordNo("AR-" + id);
        r.setDeliveryItemId(itemId);
        r.setAcceptanceType(type);
        r.setScopeVersion(scopeVersion);
        r.setConclusion(conclusion);
        r.setSignerUserId(ACCEPTOR_ID);
        return r;
    }

    private static Map<String, Object> scopeRow(long itemId, int scopeVersion, String path) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("deliveryItemId", itemId);
        row.put("itemNo", "DI-" + itemId);
        row.put("title", "交付项" + itemId);
        row.put("scopeVersion", scopeVersion);
        row.put("acceptancePath", path);
        return row;
    }

    private static Map<String, Object> missingRow(long itemId, int scopeVersion) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("deliveryItemId", itemId);
        row.put("itemNo", "DI-" + itemId);
        row.put("scopeVersion", scopeVersion);
        return row;
    }

    private static Map<String, Object> buildRow(String systemCode, String buildId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("systemCode", systemCode);
        row.put("buildId", buildId);
        return row;
    }

    private static RdmReleaseBatchDTO.Exemption exemptionDto() {
        RdmReleaseBatchDTO.Exemption dto = new RdmReleaseBatchDTO.Exemption();
        dto.setReason("紧急上线");
        dto.setRisk("低风险");
        dto.setRollbackPlan("执行回滚脚本");
        return dto;
    }

    private static RdmReleaseBatchDTO.ExemptionDecision decisionDto(String type, String result) {
        RdmReleaseBatchDTO.ExemptionDecision dto = new RdmReleaseBatchDTO.ExemptionDecision();
        dto.setDecisionType(type);
        dto.setDecision(result);
        dto.setReason("经评估同意");
        return dto;
    }

    private static RdmReleaseBatchDTO.SupplementaryComplete completeDto(Long recordId, String result) {
        RdmReleaseBatchDTO.SupplementaryComplete dto = new RdmReleaseBatchDTO.SupplementaryComplete();
        dto.setAcceptanceRecordId(recordId);
        dto.setResult(result);
        return dto;
    }

    private static void runIgnoringBusinessErrors(Runnable r) {
        try {
            r.run();
        } catch (RuntimeException ignored) {
            // 幂等占位发生在业务校验之前：即便业务因校验拒绝，executeOnce 也已被调用
        }
    }

    /* ==================== 1. 只可豁免缺失的产品验收；业务验收永不可豁免 ==================== */

    @Test
    @DisplayName("无缺失产品验收时申请豁免被拒（不得为无缺失批次开豁免后门）")
    void applyRejectedWhenNoMissingProductAcceptance() {
        doReturn(true).when(acceptanceRecordService).hasProductAcceptancePassed(anyLong(), any());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        assertTrue(ex.getMessage().contains("無需緊急豁免") || ex.getMessage().contains("无需紧急豁免"),
                "应提示无需豁免，实际: " + ex.getMessage());
        verify(exemptionMapper, never()).insert(any(RdmReleaseExemption.class));
    }

    @Test
    @DisplayName("业务验收永不可豁免：路径A 缺业务验收时申请豁免直接拒绝")
    void applyRejectedWhenBusinessAcceptanceMissing() {
        doReturn(false).when(acceptanceRecordService).hasBizAcceptancePassed(anyLong(), any());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        assertTrue(ex.getMessage().contains("業務驗收永不可豁免") || ex.getMessage().contains("业务验收永不可豁免"),
                "应拒绝豁免业务验收，实际: " + ex.getMessage());
        verify(exemptionMapper, never()).insert(any(RdmReleaseExemption.class));
    }

    @Test
    @DisplayName("批次已结束（released/rolled_back/cancelled）不可再申请豁免")
    void applyRejectedWhenBatchEnded() {
        doReturn(batch(RdmConstants.RB_RELEASED)).when(batchMapper).selectById(BATCH_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        assertTrue(ex.getMessage().contains("不可再申請") || ex.getMessage().contains("不可再申请"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("已有在途/生效豁免时不可重复发起")
    void applyRejectedWhenInFlightExists() {
        RdmReleaseExemption inFlight = exemption(EXEMPTION_ID, OWNER_ID);
        doReturn(inFlight).when(exemptionMapper).selectOne(any());
        // 无裁决留痕 => isFullyRejected=false（在途）
        doReturn(new ArrayList<RdmReleaseExemptionDecision>()).when(exemptionDecisionMapper).selectList(any());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        assertTrue(ex.getMessage().contains("不可重複發起") || ex.getMessage().contains("不可重复发起"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("部署清单缺构建标识时拒绝冻结补验事实")
    void applyRejectedWhenNoBuildId() {
        doReturn(new ArrayList<>(List.of(deployment(SYS_A, null)))).when(deploymentMapper).selectList(any());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        assertTrue(ex.getMessage().contains("構建標識") || ex.getMessage().contains("构建标识"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("申请豁免：按补验人真实工作日历冻结 deadline、calendar_version、缺失清单与证据哈希")
    void applyFreezesDeadlineByVerifierWorkingCalendar() {
        LocalDate due = LocalDate.now().plusDays(7);
        doReturn(due).when(workingDayCalculator).addWorkingDays(any(), anyInt(), any());

        RdmReleaseExemption saved = service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人");

        assertNotNull(saved);
        assertEquals(RdmReleaseFactService.nextApplicationVersion(batch(RdmConstants.RB_DEPLOYING)),
                saved.getApplicationVersion().intValue(), "申请版本应自增");
        assertNotNull(saved.getEvidenceHash(), "证据哈希必须冻结");
        assertTrue(saved.getMissingAcceptanceJson().contains("\"deliveryItemId\""), "缺失清单必须服务端计算并冻结");

        // 期限按补验人本人真实工作日历计算，而非简单自然日
        verify(workingDayCalculator).addWorkingDays(any(LocalDate.class), eq(1), eq(ACCEPTOR_ID));

        ArgumentCaptor<RdmSupplementaryVerification> captor =
                ArgumentCaptor.forClass(RdmSupplementaryVerification.class);
        verify(supplementaryMapper).insert(captor.capture());
        RdmSupplementaryVerification sv = captor.getValue();
        assertEquals(EXEMPTION_ID, sv.getExemptionId(), "补验单必须绑定 DB 生成的 exemptionId");
        assertEquals(RdmConstants.SUPPLEMENTARY_STATUS_PENDING, sv.getStatus());
        assertEquals(RdmConstants.SUPPLEMENTARY_TYPE_PRODUCT, sv.getVerificationType());
        assertEquals(ACCEPTOR_ID, sv.getVerifierUserId(), "补验人默认取交付项产品验收人");
        assertEquals(RdmConstants.CALENDAR_VERSION_WORKDAY_PREFIX + ACCEPTOR_ID, sv.getCalendarVersion(),
                "calendar_version 必须标明 workday:v1:<补验人>");
        assertEquals(due.atTime(23, 59, 59), sv.getDeadline(), "deadline 由真实工作日推算至当日 23:59:59");
        assertEquals(0, sv.getEscalated());
    }

    @Test
    @DisplayName("补验人覆盖：supplementaryPlan 指定补验人时按其日历冻结期限")
    void applyUsesOverrideVerifier() {
        RdmReleaseBatchDTO.Exemption dto = exemptionDto();
        RdmReleaseBatchDTO.SupplementaryPlanItem plan = new RdmReleaseBatchDTO.SupplementaryPlanItem();
        plan.setDeliveryItemId(ITEM_ID);
        plan.setVerifierUserId(OTHER_ID);
        plan.setVerifierUserName("覆盖补验人");
        dto.setSupplementaryPlan(List.of(plan));

        service.applyExemption(BATCH_ID, dto, OWNER_ID, "负责人");

        verify(workingDayCalculator).addWorkingDays(any(LocalDate.class), eq(1), eq(OTHER_ID));
        ArgumentCaptor<RdmSupplementaryVerification> captor =
                ArgumentCaptor.forClass(RdmSupplementaryVerification.class);
        verify(supplementaryMapper).insert(captor.capture());
        assertEquals(OTHER_ID, captor.getValue().getVerifierUserId());
        assertEquals(RdmConstants.CALENDAR_VERSION_WORKDAY_PREFIX + OTHER_ID, captor.getValue().getCalendarVersion());
    }

    /* ==================== 2. 豁免也要四眼 + 签署资格 + 两类裁决齐备 ==================== */

    @Test
    @DisplayName("四眼：豁免裁决人不得是申请人本人（管理员亦不得自批）")
    void decideRejectedWhenSignerIsApplicant() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decideExemption(BATCH_ID, EXEMPTION_ID,
                        decisionDto(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED),
                        OWNER_ID, "申请人"));
        assertTrue(ex.getMessage().contains("四眼原則") || ex.getMessage().contains("四眼原则"),
                "实际: " + ex.getMessage());
        verify(exemptionDecisionMapper, never()).insert(any(RdmReleaseExemptionDecision.class));
    }

    @Test
    @DisplayName("product_risk 仅缺失项产品验收人可签（非验收人即使是项目成员也被拒，管理员无代签）")
    void productRiskOnlyMissingAcceptorCanSign() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        // OTHER_ID 不是缺失项产品验收人（验收人是 ACCEPTOR_ID）
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decideExemption(BATCH_ID, EXEMPTION_ID,
                        decisionDto(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED),
                        OTHER_ID, "无关人员"));
        assertTrue(ex.getMessage().contains("產品驗收人") || ex.getMessage().contains("产品验收人"),
                "实际: " + ex.getMessage());
        // product_risk 签署资格来自交付项权威字段，不查项目成员、不用 canSeeAll
        verify(accessGuard, never()).requireProjectMember(anyLong(), anyLong());
        verify(accessGuard, never()).canSeeAll(any());
    }

    @Test
    @DisplayName("release 裁决须项目成员：合格签署人成功留痕")
    void releaseDecisionRequiresProjectMemberAndSucceeds() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        doReturn(null).when(exemptionDecisionMapper).selectOne(any());

        RdmReleaseExemptionDecision saved = service.decideExemption(BATCH_ID, EXEMPTION_ID,
                decisionDto(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED),
                APPROVER_ID, "审批人");

        verify(accessGuard).requireProjectMember(eq(PROJECT_ID), eq(APPROVER_ID));
        assertNotNull(saved);
        assertEquals(APPROVER_ID, saved.getSignerUserId());
        assertEquals(RdmConstants.EXEMPTION_DECISION_RELEASE, saved.getDecisionType());
        assertEquals("evidence-hash-1", saved.getEvidenceHash(), "裁决须绑定豁免证据哈希");
        verify(exemptionDecisionMapper).insert(any(RdmReleaseExemptionDecision.class));
    }

    @Test
    @DisplayName("product_risk 缺失项产品验收人可成功签署")
    void productRiskAcceptorCanSign() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        doReturn(null).when(exemptionDecisionMapper).selectOne(any());

        RdmReleaseExemptionDecision saved = service.decideExemption(BATCH_ID, EXEMPTION_ID,
                decisionDto(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED),
                ACCEPTOR_ID, "产品验收人");

        assertEquals(ACCEPTOR_ID, saved.getSignerUserId());
        verify(exemptionDecisionMapper).insert(any(RdmReleaseExemptionDecision.class));
    }

    @Test
    @DisplayName("同一类型裁决不可重复")
    void decideRejectedWhenDuplicate() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        doReturn(decision(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED))
                .when(exemptionDecisionMapper).selectOne(any());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decideExemption(BATCH_ID, EXEMPTION_ID,
                        decisionDto(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED),
                        APPROVER_ID, "审批人"));
        assertTrue(ex.getMessage().contains("不可重複裁決") || ex.getMessage().contains("不可重复裁决"),
                "实际: " + ex.getMessage());
        verify(exemptionDecisionMapper, never()).insert(any(RdmReleaseExemptionDecision.class));
    }

    @Test
    @DisplayName("豁免单不属于该批次时拒绝裁决")
    void decideRejectedWhenExemptionNotInBatch() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decideExemption(999999L, EXEMPTION_ID,
                        decisionDto(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED),
                        APPROVER_ID, "审批人"));
        assertTrue(ex.getMessage().contains("不屬於該發布批次") || ex.getMessage().contains("不属于该发布批次"),
                "实际: " + ex.getMessage());
    }

    /* ==================== 3. 补验完成登记：仅指定补验人 + 真实记录 + 结论一致 ==================== */

    @Test
    @DisplayName("仅本补验单指定补验人可登记（管理员无代签）")
    void completeRejectedWhenNotAssignedVerifier() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(record(RECORD_ID, ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, RdmConstants.ACCEPT_PASS))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.completeSupplementary(SUPPLEMENTARY_ID,
                        completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), OTHER_ID, "无关人员"));
        assertTrue(ex.getMessage().contains("僅本補驗單指定的補驗人") || ex.getMessage().contains("仅本补验单指定的补验人"),
                "实际: " + ex.getMessage());
        verify(supplementaryMapper, never()).updateById(any(RdmSupplementaryVerification.class));
    }

    @Test
    @DisplayName("补验必须引用真实存在的验收记录")
    void completeRejectedWhenRecordMissing() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(null).when(acceptanceRecordMapper).selectById(RECORD_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.completeSupplementary(SUPPLEMENTARY_ID,
                        completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人"));
        assertTrue(ex.getMessage().contains("驗收記錄不存在") || ex.getMessage().contains("验收记录不存在"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("验收记录须同交付项、product 类型、scopeVersion 一致")
    void completeRejectedWhenRecordMismatch() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        // 不同交付项
        doReturn(record(RECORD_ID, OTHER_ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, RdmConstants.ACCEPT_PASS))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.completeSupplementary(SUPPLEMENTARY_ID,
                        completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人"));
        assertTrue(ex.getMessage().contains("不屬於同一交付項") || ex.getMessage().contains("不属于同一交付项"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("补验结果 pass 必须对应验收记录结论 pass")
    void completeRejectedWhenResultMismatchConclusion() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(record(RECORD_ID, ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, "reject"))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.completeSupplementary(SUPPLEMENTARY_ID,
                        completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人"));
        assertTrue(ex.getMessage().contains("必須對應驗收記錄結論 pass") || ex.getMessage().contains("必须对应验收记录结论"),
                "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("补验通过：status=completed，写入真实验收记录与证据")
    void completePassMarksCompleted() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(record(RECORD_ID, ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, RdmConstants.ACCEPT_PASS))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);

        RdmSupplementaryVerification saved = service.completeSupplementary(SUPPLEMENTARY_ID,
                completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人");

        assertEquals(RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED, saved.getStatus());
        assertEquals(RdmConstants.SUPPLEMENTARY_RESULT_PASS, saved.getResult());
        assertEquals(RECORD_ID, saved.getAcceptanceRecordId());
        assertNotNull(saved.getCompletedAt());
        assertEquals(ACCEPTOR_ID, saved.getCompletedBy());
        assertEquals(0, saved.getEscalated(), "通过不升级");
        verify(supplementaryMapper).updateById(any(RdmSupplementaryVerification.class));
    }

    @Test
    @DisplayName("补验失败：status=failed + escalated=1 + escalationLevel>=1（未验收不得开放）")
    void completeFailEscalates() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(record(RECORD_ID, ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, "reject"))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);
        doReturn(0).when(workingDayCalculator).overdueWorkingDays(any(), any(), any());

        RdmSupplementaryVerification saved = service.completeSupplementary(SUPPLEMENTARY_ID,
                completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_FAIL), ACCEPTOR_ID, "验收人");

        assertEquals(RdmConstants.SUPPLEMENTARY_STATUS_FAILED, saved.getStatus());
        assertEquals(RdmConstants.SUPPLEMENTARY_RESULT_FAIL, saved.getResult());
        assertEquals(1, saved.getEscalated(), "补验失败立即升级整改");
        assertNotNull(saved.getEscalatedAt());
        assertTrue(saved.getEscalationLevel() >= 1, "失败至少升级 L1");
        verify(supplementaryMapper).updateById(any(RdmSupplementaryVerification.class));
    }

    @Test
    @DisplayName("补验单已结束时不可重复登记")
    void completeRejectedWhenAlreadyFinished() {
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.completeSupplementary(SUPPLEMENTARY_ID,
                        completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人"));
        assertTrue(ex.getMessage().contains("不可重複登記") || ex.getMessage().contains("不可重复登记"),
                "实际: " + ex.getMessage());
    }

    /* ==================== 4. 逾期刷新（真实工作日历，不用 cron） ==================== */

    @Test
    @DisplayName("refreshOverdue 用真实工作日历判逾期并升级，不依赖 cron")
    void refreshOverdueMarksOverdueByWorkingCalendar() {
        RdmSupplementaryVerification sv = supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID);
        sv.setDeadline(LocalDateTime.now().minusDays(10));
        doReturn(new ArrayList<>(List.of(sv))).when(supplementaryMapper).selectList(any());
        doReturn(3).when(workingDayCalculator).overdueWorkingDays(any(), any(), eq(ACCEPTOR_ID));

        int marked = service.refreshOverdue(BATCH_ID);

        assertEquals(1, marked);
        assertEquals(RdmConstants.SUPPLEMENTARY_STATUS_OVERDUE, sv.getStatus());
        assertEquals(1, sv.getEscalated());
        assertEquals(2, sv.getEscalationLevel(), "逾期3工作日=L2");
        verify(workingDayCalculator).overdueWorkingDays(any(), any(), eq(ACCEPTOR_ID));
        verify(supplementaryMapper).updateById(any(RdmSupplementaryVerification.class));
    }

    @Test
    @DisplayName("refreshOverdue 跳过非 pending 补验单（completed/failed 不再判逾期）")
    void refreshOverdueSkipsFinished() {
        RdmSupplementaryVerification done = supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED, ACCEPTOR_ID);
        doReturn(new ArrayList<>(List.of(done))).when(supplementaryMapper).selectList(any());

        int marked = service.refreshOverdue(BATCH_ID);

        assertEquals(0, marked);
        verify(supplementaryMapper, never()).updateById(any(RdmSupplementaryVerification.class));
    }

    @Test
    @DisplayName("escalationLevel 边界：0/1/3/5 工作日 => 0/1/2/3，封顶 L3")
    void escalationLevelBoundaries() {
        assertEquals(0, RdmReleaseExemptionService.escalationLevel(0));
        assertEquals(1, RdmReleaseExemptionService.escalationLevel(1));
        assertEquals(1, RdmReleaseExemptionService.escalationLevel(2));
        assertEquals(2, RdmReleaseExemptionService.escalationLevel(3));
        assertEquals(2, RdmReleaseExemptionService.escalationLevel(4));
        assertEquals(3, RdmReleaseExemptionService.escalationLevel(5));
        assertEquals(RdmConstants.ESCALATION_LEVEL_MAX, RdmReleaseExemptionService.escalationLevel(99));
    }

    /* ==================== 5. 豁免只豁免发布时序、不豁免开放 ==================== */

    @Test
    @DisplayName("isProductAcceptanceEstablished：真实验收 pass 或补验 completed+pass 才算建立，否则阻断开放")
    void productAcceptanceEstablishedRequiresRealFact() {
        // 真实验收未过 + 无 completed 补验 => false
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(anyLong(), any());
        doReturn(0L).when(supplementaryMapper).selectCount(any());
        assertFalse(service.isProductAcceptanceEstablished(ITEM_ID, SCOPE_VERSION),
                "pending/overdue/failed 补验一律不算，紧急豁免不豁免开放");

        // 补验 completed+pass => true
        doReturn(1L).when(supplementaryMapper).selectCount(any());
        assertTrue(service.isProductAcceptanceEstablished(ITEM_ID, SCOPE_VERSION));

        // 真实验收 pass => 直接 true（无需补验）
        doReturn(true).when(acceptanceRecordService).hasProductAcceptancePassed(anyLong(), any());
        assertTrue(service.isProductAcceptanceEstablished(ITEM_ID, SCOPE_VERSION));
    }

    @Test
    @DisplayName("isExemptionEffective：两类裁决齐备且均 approved、范围与构建未变才生效")
    void exemptionEffectiveRequiresBothApprovedAndUnchanged() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectOne(any());

        // 仅 product_risk approved => 不生效
        doReturn(new ArrayList<>(List.of(
                decision(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED))))
                .when(exemptionDecisionMapper).selectList(any());
        assertFalse(service.isExemptionEffective(batch(RdmConstants.RB_DEPLOYING), List.of(deployment(SYS_A, BUILD_A))),
                "缺 release 裁决不生效");

        // 两类均 approved + 范围/构建一致 => 生效
        doReturn(new ArrayList<>(List.of(
                decision(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED),
                decision(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED))))
                .when(exemptionDecisionMapper).selectList(any());
        assertTrue(service.isExemptionEffective(batch(RdmConstants.RB_DEPLOYING), List.of(deployment(SYS_A, BUILD_A))));

        // 构建漂移 => 失效（必须重新申请）
        assertFalse(service.isExemptionEffective(batch(RdmConstants.RB_DEPLOYING), List.of(deployment(SYS_A, "build-CHANGED"))),
                "构建映射变化后豁免必须失效");
    }

    @Test
    @DisplayName("isProductAcceptanceWaived：仅覆盖缺失清单内且 scopeVersion 一致的交付项")
    void waivedOnlyForListedItemAndScope() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectOne(any());
        doReturn(new ArrayList<>(List.of(
                decision(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED),
                decision(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED))))
                .when(exemptionDecisionMapper).selectList(any());
        List<RdmReleaseDeployment> deployments = List.of(deployment(SYS_A, BUILD_A));

        assertTrue(service.isProductAcceptanceWaived(batch(RdmConstants.RB_DEPLOYING), deployments, ITEM_ID, SCOPE_VERSION));
        assertFalse(service.isProductAcceptanceWaived(batch(RdmConstants.RB_DEPLOYING), deployments, OTHER_ITEM_ID, SCOPE_VERSION),
                "不在缺失清单内的项不被豁免");
        assertFalse(service.isProductAcceptanceWaived(batch(RdmConstants.RB_DEPLOYING), deployments, ITEM_ID, SCOPE_VERSION + 1),
                "范围版本漂移后不豁免");
    }

    @Test
    @DisplayName("isBothDecisionsApproved：仅两类均 approved 才为 true")
    void bothDecisionsApproved() {
        doReturn(new ArrayList<>(List.of(
                decision(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED),
                decision(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED))))
                .when(exemptionDecisionMapper).selectList(any());
        assertTrue(service.isBothDecisionsApproved(EXEMPTION_ID));

        doReturn(new ArrayList<>(List.of(
                decision(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK, RdmConstants.DECISION_APPROVED))))
                .when(exemptionDecisionMapper).selectList(any());
        assertFalse(service.isBothDecisionsApproved(EXEMPTION_ID));
    }

    /* ==================== 6. 幂等与列宽 ==================== */

    @Test
    @DisplayName("三个写操作走 executeOnce 原子幂等，派生 clientRequestId 适配 VARCHAR(64) ascii")
    void allWriteOperationsAreIdempotentAndFitClientRequestIdColumn() {
        doReturn(exemption(EXEMPTION_ID, OWNER_ID)).when(exemptionMapper).selectById(EXEMPTION_ID);
        doReturn(supplementary(SUPPLEMENTARY_ID, RdmConstants.SUPPLEMENTARY_STATUS_PENDING, ACCEPTOR_ID))
                .when(supplementaryMapper).selectById(SUPPLEMENTARY_ID);
        doReturn(record(RECORD_ID, ITEM_ID, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, SCOPE_VERSION, RdmConstants.ACCEPT_PASS))
                .when(acceptanceRecordMapper).selectById(RECORD_ID);

        runIgnoringBusinessErrors(() -> service.applyExemption(BATCH_ID, exemptionDto(), OWNER_ID, "负责人"));
        runIgnoringBusinessErrors(() -> service.decideExemption(BATCH_ID, EXEMPTION_ID,
                decisionDto(RdmConstants.EXEMPTION_DECISION_RELEASE, RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人"));
        runIgnoringBusinessErrors(() -> service.completeSupplementary(SUPPLEMENTARY_ID,
                completeDto(RECORD_ID, RdmConstants.SUPPLEMENTARY_RESULT_PASS), ACCEPTOR_ID, "验收人"));

        ArgumentCaptor<IdempotentKey> captor = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService, times(3)).executeOnce(captor.capture(), any(), any());
        Set<String> bizTypes = captor.getAllValues().stream()
                .map(IdempotentKey::getBizType).collect(Collectors.toSet());
        assertEquals(Set.of("rdm_release_exemption", "rdm_release_exemption_decision", "rdm_supplementary_complete"),
                bizTypes, "三个写入口必须各自原子幂等");
        for (IdempotentKey key : captor.getAllValues()) {
            String clientRequestId = key.getClientRequestId();
            assertNotNull(clientRequestId);
            assertTrue(clientRequestId.length() <= 64,
                    "clientRequestId 超出 VARCHAR(64) 列宽: " + clientRequestId);
            assertTrue(clientRequestId.chars().allMatch(c -> c >= 0x20 && c <= 0x7E),
                    "clientRequestId 含非 ascii 字符: " + clientRequestId);
        }
    }

    @Test
    @DisplayName("客户端提供 requestId 时优先用作幂等判别子")
    void clientRequestIdIsPreferredWhenProvided() {
        RdmReleaseBatchDTO.Exemption dto = exemptionDto();
        dto.setRequestId("req-20261015-abc");

        runIgnoringBusinessErrors(() -> service.applyExemption(BATCH_ID, dto, OWNER_ID, "负责人"));

        ArgumentCaptor<IdempotentKey> captor = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(captor.capture(), any(), any());
        assertTrue(captor.getValue().getClientRequestId().contains("req-20261015-abc"),
                "应优先使用客户端 requestId: " + captor.getValue().getClientRequestId());
    }

    @Test
    @DisplayName("登录态失效（actor 为空且无法解析）时 fail-closed")
    void anonymousActorIsRejected() {
        doReturn(null).when(operatorResolver).currentUser();
        assertThrows(BusinessException.class,
                () -> service.applyExemption(BATCH_ID, exemptionDto(), null, null));
    }
}
