package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.service.RdmReleaseFactService.BuildEvidence;
import com.mftb.admin.service.RdmReleaseFactService.ItemEvidence;
import com.mftb.admin.service.RdmReleaseGateService.Evidence;
import com.mftb.admin.service.RdmReleaseGateService.Stage;
import com.mftb.admin.util.JsonUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 任务27 发布<b>硬门禁</b>纯 Mockito 离线单测。
 *
 * <p>锁死八条口径（全部 fail-closed）：
 * <ol>
 *   <li>五类闸门（测试/验收/缺陷/依赖/范围）任一不通过即阻断，且<b>每个发布动作都重算</b>；</li>
 *   <li>验收门禁取任务20 权威口径（当前 scopeVersion 下最新有效结论），非「历史上曾有 pass」；</li>
 *   <li><b>业务验收永不可豁免</b>：即使紧急豁免生效，路径A 缺业务验收一律拒绝；</li>
 *   <li><b>紧急豁免只豁免发布时序、不豁免开放</b>：{@link Stage#OPEN} 阶段豁免一律失效，
 *       必须 {@code isProductAcceptanceEstablished}（真实验收 pass 或补验 completed+pass）；</li>
 *   <li>证据哈希：申请后范围/测试/验收/缺陷/构建映射任一变动即失效，必须重新申请；</li>
 *   <li>裁决有效期：{@code RELEASE_VALID_DAYS} 过期必须重新过闸，不得「一次批准、无限期上线」；</li>
 *   <li><b>四眼无 admin 豁免</b>：裁决人不得是申请人；审批资格取「项目成员」，
 *       <b>绝不用 {@code canSeeAll} 充当签署权</b>；</li>
 *   <li><b>构建不可变</b>：部署只能使用申请快照冻结的 buildId，上报不一致即拒。</li>
 * </ol>
 *
 * <p><b>边界声明</b>：本测试以 mock 依赖驱动门禁裁决逻辑，只验证「分支走向与门禁口径」，
 * 不等价于真实数据库/并发证明（须在任务24 集成测试验证）。
 */
class RdmReleaseGateServiceTest {

    private static final long BATCH_ID = 900L;
    private static final long PROJECT_ID = 77L;
    private static final long ITEM_ID = 500L;
    private static final long APPLICANT_ID = 11L;
    private static final long APPROVER_ID = 22L;
    private static final int SCOPE_VERSION = 4;
    private static final String SYS_A = "SYS_A";
    private static final String BUILD_A = "build-a-1";

    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmTestBatchService testBatchService;
    private RdmIssueService issueService;
    private RdmAcceptanceRecordService acceptanceRecordService;
    private RdmReleaseExemptionService exemptionService;
    private RdmAccessGuard accessGuard;
    private RdmFlowVersionGuard flowVersionGuard;
    private RdmReleaseGateService gate;

    @BeforeEach
    void setUp() {
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        testBatchService = mock(RdmTestBatchService.class);
        issueService = mock(RdmIssueService.class);
        acceptanceRecordService = mock(RdmAcceptanceRecordService.class);
        exemptionService = mock(RdmReleaseExemptionService.class);
        accessGuard = mock(RdmAccessGuard.class);
        flowVersionGuard = mock(RdmFlowVersionGuard.class);

        // 默认「全部就绪」现场：测试通过、产品/业务验收通过、无阻断缺陷、无豁免
        doReturn(item(ITEM_ID, SCOPE_VERSION, RdmConstants.PATH_A, RdmConstants.DI_PENDING_RELEASE))
                .when(deliveryItemMapper).selectById(ITEM_ID);
        doReturn(true).when(testBatchService).isTestPassed(anyLong());
        doReturn(true).when(acceptanceRecordService).hasProductAcceptancePassed(anyLong(), any());
        doReturn(true).when(acceptanceRecordService).hasBizAcceptancePassed(anyLong(), any());
        doReturn(false).when(issueService).hasBlockingOpenIssue(anyLong());
        doReturn(false).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(false).when(exemptionService).isProductAcceptanceWaived(any(), any(), anyLong(), any());
        doReturn(true).when(exemptionService).isProductAcceptanceEstablished(anyLong(), any());

        gate = new RdmReleaseGateService(deliveryItemMapper, testBatchService, issueService,
                acceptanceRecordService, exemptionService, accessGuard, flowVersionGuard);
    }

    /* ==================== 夹具 ==================== */

    private static RdmDeliveryItem item(long id, int scopeVersion, String path, String status) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(id);
        it.setItemNo("DI-" + id);
        it.setTitle("交付项" + id);
        it.setScopeVersion(scopeVersion);
        it.setAcceptancePath(path);
        it.setStatus(status);
        return it;
    }

    private static ItemEvidence frozenItem(long itemId, int scopeVersion) {
        ItemEvidence e = new ItemEvidence();
        e.setDeliveryItemId(itemId);
        e.setItemNo("DI-" + itemId);
        e.setTitle("交付项" + itemId);
        e.setScopeVersion(scopeVersion);
        e.setAcceptancePath(RdmConstants.PATH_A);
        e.setItemStatus(RdmConstants.DI_PENDING_RELEASE);
        e.setTestPassed(true);
        e.setProductAccepted(true);
        e.setBusinessAccepted(true);
        e.setBlockingIssue(false);
        return e;
    }

    /**
     * 构造批次：<b>两种快照分别用生产真实格式</b>，避免测试自造格式而假绿。
     * <ul>
     *   <li>{@code scopeSnapshotJson}：<b>行数组</b>（{@code RdmReleaseBatchService#buildScopeSnapshot} 口径，
     *       建批时冻结的范围基准）；</li>
     *   <li>{@code applicationSnapshotJson}：<b>对象</b>（{@link RdmReleaseFactService#buildSnapshotJson} 口径，
     *       含 {@code items} + {@code buildMapping}，申请时冻结的证据与批准构建基准）。</li>
     * </ul>
     * 两者格式不同但必须都能被正确解析：若 {@code snapshotScopeVersions} 只认对象格式，
     * 「范围已变更」硬门禁会静默退化为无条件放行（本测试的 {@code scopeChangeBlocks} 就是为了锁死这一点）。
     */
    private static RdmReleaseBatch batch(Integer applicationVersion, String buildId) {
        RdmReleaseBatch b = new RdmReleaseBatch();
        b.setId(BATCH_ID);
        b.setBatchNo("RB20261015001");
        b.setVersionTag("v1.0.0");
        b.setProjectId(PROJECT_ID);
        b.setStatus(RdmConstants.RB_DEPLOYING);
        b.setApplicantUserId(APPLICANT_ID);
        b.setApplicationVersion(applicationVersion);
        b.setVersion(3);
        b.setScopeSnapshotJson(JsonUtils.toJson(List.of(scopeRow(ITEM_ID, SCOPE_VERSION))));
        b.setApplicationSnapshotJson(RdmReleaseFactService.buildSnapshotJson(BATCH_ID, b.getBatchNo(),
                b.getVersionTag(), applicationVersion, List.of(frozenItem(ITEM_ID, SCOPE_VERSION)),
                List.of(new BuildEvidence(SYS_A, buildId))));
        return b;
    }

    /** 建批时冻结的范围快照行（字段与 {@code buildScopeSnapshot} 一致）。 */
    private static Map<String, Object> scopeRow(long itemId, int scopeVersion) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("deliveryItemId", itemId);
        row.put("itemNo", "DI-" + itemId);
        row.put("title", "交付项" + itemId);
        row.put("scopeVersion", scopeVersion);
        row.put("acceptancePath", RdmConstants.PATH_A);
        return row;
    }

    private static RdmReleaseDeployment deployment(String buildId) {
        RdmReleaseDeployment d = new RdmReleaseDeployment();
        d.setId(800L);
        d.setReleaseBatchId(BATCH_ID);
        d.setSystemCode(SYS_A);
        d.setSystemName("系统A");
        d.setBuildId(buildId);
        d.setDeployStatus(RdmConstants.DEPLOY_SUCCESS);
        d.setVerifyStatus(RdmConstants.VERIFY_PASSED);
        d.setOpenStatus(RdmConstants.OPEN_STATUS_OPENED);
        return d;
    }

    /** 冻结证据哈希并写入批次（模拟 applyRelease 已完成的现场）。 */
    private static void freezeEvidence(RdmReleaseGateService gate, RdmReleaseBatch batch,
                                       List<RdmReleaseDeployment> deployments) {
        Evidence evidence = gate.collectEvidence(batch, deployments);
        batch.setApplicationSnapshotJson(evidence.snapshotJson(batch));
        batch.setEvidenceHash(evidence.hash());
    }

    /* ==================== 五类闸门 ==================== */

    @Test
    @DisplayName("全部就绪时硬门禁无阻断项")
    void hardGatePassesWhenEverythingReady() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        for (Stage stage : Stage.values()) {
            assertTrue(gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), stage).isEmpty(),
                    "阶段应无阻断项: " + stage);
        }
    }

    @Test
    @DisplayName("闸门1 测试未通过即阻断（所有阶段一视同仁）")
    void testFailureBlocks() {
        doReturn(false).when(testBatchService).isTestPassed(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        for (Stage stage : Stage.values()) {
            List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), stage);
            assertTrue(failures.stream().anyMatch(f -> f.contains("測試未通過")), stage + ": " + failures);
        }
    }

    @Test
    @DisplayName("闸门2 产品验收未通过且无豁免即阻断")
    void productAcceptanceMissingBlocks() {
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.APPLY);
        assertTrue(failures.stream().anyMatch(f -> f.contains("產品驗收未通過")), failures.toString());
    }

    @Test
    @DisplayName("闸门2 生效紧急豁免可覆盖缺失的产品验收（仅发布时序）")
    void effectiveExemptionWaivesMissingProductAcceptance() {
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(true).when(exemptionService)
                .isProductAcceptanceWaived(any(), any(), eq(ITEM_ID), eq(SCOPE_VERSION));
        RdmReleaseBatch batch = batch(1, BUILD_A);
        assertTrue(gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.APPLY).isEmpty(),
                "生效豁免应放行缺失的产品验收");
    }

    @Test
    @DisplayName("核心：业务验收永不可豁免——豁免生效也一律阻断（路径A）")
    void businessAcceptanceIsNeverWaivable() {
        doReturn(false).when(acceptanceRecordService).hasBizAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        // 即便产品验收也被豁免、豁免完全生效，业务验收缺失仍必须阻断
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(true).when(exemptionService).isProductAcceptanceWaived(any(), any(), anyLong(), any());
        RdmReleaseBatch batch = batch(1, BUILD_A);
        for (Stage stage : Stage.values()) {
            List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), stage);
            assertTrue(failures.stream().anyMatch(f -> f.contains("業務驗收") && f.contains("永不可豁免")),
                    stage + ": " + failures);
        }
    }

    @Test
    @DisplayName("闸门3 阻断缺陷（含延期未获批）即阻断")
    void blockingIssueBlocks() {
        doReturn(true).when(issueService).hasBlockingOpenIssue(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.DECIDE);
        assertTrue(failures.stream().anyMatch(f -> f.contains("阻斷缺陷")), failures.toString());
    }

    @Test
    @DisplayName("闸门4 依赖未就绪（交付项状态不可发布）即阻断")
    void dependencyNotReadyBlocks() {
        doReturn(item(ITEM_ID, SCOPE_VERSION, RdmConstants.PATH_A, RdmConstants.DI_DEVELOPING))
                .when(deliveryItemMapper).selectById(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.APPLY);
        assertTrue(failures.stream().anyMatch(f -> f.contains("依賴未就緒")), failures.toString());
    }

    @Test
    @DisplayName("闸门4 交付项被删除（查不到）时 fail-closed 阻断")
    void missingItemBlocks() {
        doReturn(null).when(deliveryItemMapper).selectById(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.APPLY);
        assertTrue(failures.stream().anyMatch(f -> f.contains("交付項不存在")), failures.toString());
    }

    @Test
    @DisplayName("闸门4 部署记录缺构建标识即阻断（attempt.build_id NOT NULL，无构建无法追加不可变事实）")
    void missingBuildIdBlocks() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(null)), Stage.APPLY);
        assertTrue(failures.stream().anyMatch(f -> f.contains("構建標識缺失")), failures.toString());
    }

    @Test
    @DisplayName("闸门5 范围已变更（快照 v4 → 当前 v5）即阻断")
    void scopeChangeBlocks() {
        doReturn(item(ITEM_ID, SCOPE_VERSION + 1, RdmConstants.PATH_A, RdmConstants.DI_PENDING_RELEASE))
                .when(deliveryItemMapper).selectById(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<String> failures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.APPLY);
        assertTrue(failures.stream().anyMatch(f -> f.contains("範圍已變更")), failures.toString());
    }

    @Test
    @DisplayName("核心：OPEN 阶段豁免一律失效，产品验收必须真实建立（真验收或补验完成且通过）")
    void openStageIgnoresExemption() {
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(true).when(exemptionService).isProductAcceptanceWaived(any(), any(), anyLong(), any());
        // OPEN 阶段不看 isProductAccepted，而看 isProductAcceptanceEstablished
        doReturn(false).when(exemptionService).isProductAcceptanceEstablished(ITEM_ID, SCOPE_VERSION);
        RdmReleaseBatch batch = batch(1, BUILD_A);

        List<String> openFailures = gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.OPEN);
        assertTrue(openFailures.stream().anyMatch(f -> f.contains("產品驗收未真實建立")), openFailures.toString());
        verify(exemptionService, never()).isExemptionEffective(any(), any());

        // 补验完成且通过 → 开放放行
        doReturn(true).when(exemptionService).isProductAcceptanceEstablished(ITEM_ID, SCOPE_VERSION);
        assertTrue(gate.hardGateFailures(batch, List.of(deployment(BUILD_A)), Stage.OPEN).isEmpty());
    }

    @Test
    @DisplayName("enforceHardGate 抛错信息必须标明阶段与全部阻断原因（可读、可审计）")
    void enforceHardGateReportsStageAndAllReasons() {
        doReturn(false).when(testBatchService).isTestPassed(ITEM_ID);
        doReturn(true).when(issueService).hasBlockingOpenIssue(ITEM_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.enforceHardGate(batch, List.of(deployment(BUILD_A)), Stage.DECIDE));
        assertTrue(ex.getMessage().contains(Stage.DECIDE.label()), ex.getMessage());
        assertTrue(ex.getMessage().contains("測試未通過"), ex.getMessage());
        assertTrue(ex.getMessage().contains("阻斷缺陷"), ex.getMessage());
    }

    /* ==================== 证据哈希与裁决有效期 ==================== */

    @Test
    @DisplayName("未申请发布（无申请快照）时任何发布动作都被拒：applyRelease 不可跳过")
    void evidenceUnchangedRejectsMissingSnapshot() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        batch.setApplicationSnapshotJson(null);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.enforceEvidenceUnchanged(batch, List.of(deployment(BUILD_A))));
        assertTrue(ex.getMessage().contains("尚未申請發布"), ex.getMessage());
    }

    @Test
    @DisplayName("申请后证据变动（新增阻断缺陷）即失效，必须重新申请")
    void evidenceUnchangedRejectsDriftedFacts() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseDeployment> deployments = List.of(deployment(BUILD_A));
        freezeEvidence(gate, batch, deployments);
        assertDoesNotThrow(() -> gate.enforceEvidenceUnchanged(batch, deployments));

        doReturn(true).when(issueService).hasBlockingOpenIssue(ITEM_ID);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.enforceEvidenceUnchanged(batch, deployments));
        assertTrue(ex.getMessage().contains("證據已變化"), ex.getMessage());
        assertTrue(ex.getMessage().contains("重新申請發布"), ex.getMessage());
    }

    @Test
    @DisplayName("申请后构建映射变动（部署行 buildId 被换）也算证据变化")
    void evidenceUnchangedRejectsBuildMappingDrift() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        freezeEvidence(gate, batch, List.of(deployment(BUILD_A)));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.enforceEvidenceUnchanged(batch, List.of(deployment("build-a-2"))));
        assertTrue(ex.getMessage().contains("證據已變化"), ex.getMessage());
    }

    @Test
    @DisplayName("缺少证据哈希视为快照不完整，拒绝发布动作")
    void evidenceUnchangedRejectsMissingHash() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        batch.setApplicationSnapshotJson("[]");
        batch.setEvidenceHash(null);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.enforceEvidenceUnchanged(batch, List.of(deployment(BUILD_A))));
        assertTrue(ex.getMessage().contains("缺少證據哈希"), ex.getMessage());
    }

    @Test
    @DisplayName("裁决有效期：无裁决证据 / 裁决后证据变化 / 已过期 一律拒，未过期才放行")
    void approvalValidityIsEnforced() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseDeployment> deployments = List.of(deployment(BUILD_A));
        freezeEvidence(gate, batch, deployments);

        // ① 尚未裁决
        BusinessException noDecision = assertThrows(BusinessException.class,
                () -> gate.enforceApprovalValid(batch, deployments));
        assertTrue(noDecision.getMessage().contains("尚未取得放行批准裁決"), noDecision.getMessage());

        // ② 裁决证据齐备且未过期 → 放行
        batch.setApprovalEvidenceHash(batch.getEvidenceHash());
        batch.setApprovalExpiresAt(LocalDateTime.now().plusDays(RdmConstants.RELEASE_VALID_DAYS));
        assertDoesNotThrow(() -> gate.enforceApprovalValid(batch, deployments));

        // ③ 裁决后证据变化 → 原批准失效
        doReturn(true).when(issueService).hasBlockingOpenIssue(ITEM_ID);
        BusinessException drifted = assertThrows(BusinessException.class,
                () -> gate.enforceApprovalValid(batch, deployments));
        assertTrue(drifted.getMessage().contains("證據已變化") || drifted.getMessage().contains("已失效"),
                drifted.getMessage());
        doReturn(false).when(issueService).hasBlockingOpenIssue(ITEM_ID);

        // ④ 已过期 → 必须重新过闸（不得「一次批准、无限期上线」）
        batch.setApprovalExpiresAt(LocalDateTime.now().minusMinutes(1));
        BusinessException expired = assertThrows(BusinessException.class,
                () -> gate.enforceApprovalValid(batch, deployments));
        assertTrue(expired.getMessage().contains("過期"), expired.getMessage());

        // ⑤ 缺有效期 → 视为无效
        batch.setApprovalExpiresAt(null);
        BusinessException noTtl = assertThrows(BusinessException.class,
                () -> gate.enforceApprovalValid(batch, deployments));
        assertTrue(noTtl.getMessage().contains("缺少有效期"), noTtl.getMessage());
    }

    /* ==================== 四眼与审批资格 ==================== */

    @Test
    @DisplayName("四眼：裁决人不得是申请人本人——系统管理员亦不得自批")
    void fourEyesRejectsSelfApprovalEvenForAdmin() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.requireReleaseApprover(batch, APPLICANT_ID));
        assertTrue(ex.getMessage().contains("四眼原則"), ex.getMessage());
        assertTrue(ex.getMessage().contains("系統管理員亦不得自批"), ex.getMessage());
    }

    @Test
    @DisplayName("四眼：身份为空（登录态失效）与尚未申请都 fail-closed")
    void fourEyesRejectsAnonymousAndUnapplied() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        BusinessException anonymous = assertThrows(BusinessException.class,
                () -> gate.requireReleaseApprover(batch, null));
        assertTrue(anonymous.getMessage().contains("登錄狀態失效"), anonymous.getMessage());

        batch.setApplicantUserId(null);
        BusinessException unapplied = assertThrows(BusinessException.class,
                () -> gate.requireReleaseApprover(batch, APPROVER_ID));
        assertTrue(unapplied.getMessage().contains("尚未申請發布"), unapplied.getMessage());
    }

    @Test
    @DisplayName("审批资格取「项目成员」，绝不用 canSeeAll 充当签署权（可见范围 ≠ 签署权）")
    void approvalQualificationIsProjectMembershipNotVisibility() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        assertDoesNotThrow(() -> gate.requireReleaseApprover(batch, APPROVER_ID));
        verify(accessGuard).requireProjectMember(PROJECT_ID, APPROVER_ID);
        verify(accessGuard, never()).canSeeAll(any());
    }

    @Test
    @DisplayName("非项目成员（含仅有全量可见权的管理者）被 requireProjectMember 拦下")
    void nonProjectMemberIsRejected() {
        doThrow(new BusinessException("無權操作該項目")).when(accessGuard)
                .requireProjectMember(PROJECT_ID, APPROVER_ID);
        RdmReleaseBatch batch = batch(1, BUILD_A);
        assertThrows(BusinessException.class, () -> gate.requireReleaseApprover(batch, APPROVER_ID));
    }

    /* ==================== V3 灰度 ==================== */

    @Test
    @DisplayName("灰度门禁委托 RdmFlowVersionGuard，且必须带批次所属 projectId（不带则无法定位项目开关）")
    void grayscaleGateDelegatesWithProjectId() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        gate.enforceV3ReleaseGrayscale(batch);
        verify(flowVersionGuard).ensureReleaseDisabledForV3(BATCH_ID, PROJECT_ID);

        doThrow(new BusinessException("灰度未開啟")).when(flowVersionGuard)
                .ensureReleaseDisabledForV3(BATCH_ID, PROJECT_ID);
        assertThrows(BusinessException.class, () -> gate.enforceV3ReleaseGrayscale(batch));
    }

    @Test
    @DisplayName("灰度只读投影：批次为空时 false，不抛错也不放行")
    void grayscaleProjectionIsReadOnly() {
        assertFalse(gate.isV3ReleaseEnabled(null));
        doReturn(true).when(flowVersionGuard).isV3ReleaseEnabled(PROJECT_ID);
        assertTrue(gate.isV3ReleaseEnabled(batch(1, BUILD_A)));
    }

    /* ==================== 构建不可变 ==================== */

    @Test
    @DisplayName("构建不可变：上报与批准不一致即拒（部署阶段偷换构建 = 上的不是被批准的代码）")
    void buildIdIsImmutable() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        BusinessException ex = assertThrows(BusinessException.class, () -> gate.resolveApprovedBuildId(
                batch, deployment(BUILD_A), "build-a-EVIL"));
        assertTrue(ex.getMessage().contains("不得修改已批准的構建標識"), ex.getMessage());
        assertTrue(ex.getMessage().contains(BUILD_A) && ex.getMessage().contains("build-a-EVIL"), ex.getMessage());
    }

    @Test
    @DisplayName("构建不可变：上报为空/空白时一律取申请快照冻结的批准值")
    void blankReportedBuildIdFallsBackToApproved() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        assertEquals(BUILD_A, gate.resolveApprovedBuildId(batch, deployment(BUILD_A), null));
        assertEquals(BUILD_A, gate.resolveApprovedBuildId(batch, deployment(BUILD_A), "   "));
        assertEquals(BUILD_A, gate.resolveApprovedBuildId(batch, deployment(BUILD_A), BUILD_A));
    }

    @Test
    @DisplayName("构建不可变：快照未冻结该系统的构建标识时禁止部署（fail-closed）")
    void unknownSystemCodeIsRejected() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        RdmReleaseDeployment other = deployment(BUILD_A);
        other.setSystemCode("SYS_Z");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> gate.approvedBuildId(batch, "SYS_Z"));
        assertTrue(ex.getMessage().contains("未凍結該系統的構建標識"), ex.getMessage());
        assertThrows(BusinessException.class, () -> gate.resolveApprovedBuildId(batch, other, null));
    }

    /* ==================== 五类闸门投影与豁免叠加 ==================== */

    @Test
    @DisplayName("computeChecks 返回真实结论：五类齐全，不含任何豁免粉饰")
    void computeChecksReturnsRawTruth() {
        doReturn(false).when(testBatchService).isTestPassed(ITEM_ID);
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        RdmReleaseBatch batch = batch(1, BUILD_A);

        List<RdmReleaseBatchVO.CheckResult> checks =
                gate.computeChecks(batch, List.of(deployment(BUILD_A)));
        assertEquals(5, checks.size());
        assertEquals(List.of(RdmReleaseGateService.CHECK_TEST, RdmReleaseGateService.CHECK_ACCEPTANCE,
                        RdmReleaseGateService.CHECK_DEFECT, RdmReleaseGateService.CHECK_DEPENDENCY,
                        RdmReleaseGateService.CHECK_SCOPE),
                checks.stream().map(RdmReleaseBatchVO.CheckResult::getCheckType).toList());
        assertFalse(checks.get(0).getPassed(), "测试未通过必须如实反映，豁免不得粉饰检查结论");
        assertFalse(checks.get(1).getPassed());
        assertEquals(ITEM_ID, checks.get(0).getRefId());
        assertEquals("DI-" + ITEM_ID, checks.get(0).getRefNo());
    }

    @Test
    @DisplayName("豁免叠加：仅当唯一失败项是 acceptance 且硬门禁在 APPLY 口径下无阻断时才标记为已豁免")
    void exemptionWaiverOnlyCoversAcceptance() {
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(true).when(exemptionService).isProductAcceptanceWaived(any(), any(), anyLong(), any());
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseBatchVO.CheckResult> checks =
                gate.computeChecks(batch, List.of(deployment(BUILD_A)));
        assertTrue(gate.applyExemptionWaiver(batch, List.of(deployment(BUILD_A)), checks));
        assertTrue(checks.stream().allMatch(c -> Boolean.TRUE.equals(c.getPassed())));
        assertTrue(checks.get(1).getMessage().contains("緊急豁免"), checks.get(1).getMessage());
        assertTrue(checks.get(1).getMessage().contains("業務驗收不可豁免"), checks.get(1).getMessage());
    }

    @Test
    @DisplayName("豁免叠加：任一非验收闸门失败即不叠加（豁免绝不掩盖测试/缺陷/依赖/范围问题）")
    void exemptionWaiverNeverCoversOtherGates() {
        doReturn(false).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(false).when(testBatchService).isTestPassed(ITEM_ID);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        doReturn(true).when(exemptionService).isProductAcceptanceWaived(any(), any(), anyLong(), any());
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseBatchVO.CheckResult> checks =
                gate.computeChecks(batch, List.of(deployment(BUILD_A)));
        assertFalse(gate.applyExemptionWaiver(batch, List.of(deployment(BUILD_A)), checks));
        assertFalse(checks.get(0).getPassed());
    }

    @Test
    @DisplayName("豁免叠加：业务验收缺失时即便硬门禁只看产品验收也不得放行")
    void exemptionWaiverRejectedWhenBusinessAcceptanceMissing() {
        doReturn(false).when(acceptanceRecordService).hasBizAcceptancePassed(ITEM_ID, SCOPE_VERSION);
        doReturn(true).when(exemptionService).isExemptionEffective(any(), any());
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseBatchVO.CheckResult> checks =
                gate.computeChecks(batch, List.of(deployment(BUILD_A)));
        assertFalse(gate.applyExemptionWaiver(batch, List.of(deployment(BUILD_A)), checks),
                "业务验收永不可豁免");
    }

    /* ==================== 状态聚合判定 ==================== */

    @Test
    @DisplayName("聚合判定：全部部署/全部验证/全部开放，且空集合一律 false（开放是独立事实，不由验证推导）")
    void aggregatePredicatesAreStrict() {
        RdmReleaseDeployment ok = deployment(BUILD_A);
        RdmReleaseDeployment verifiedNotOpened = deployment(BUILD_A);
        verifiedNotOpened.setId(801L);
        verifiedNotOpened.setSystemCode("SYS_B");
        verifiedNotOpened.setOpenStatus(RdmConstants.OPEN_STATUS_NOT_OPENED);

        assertTrue(gate.isAllDeployed(List.of(ok)));
        assertTrue(gate.isAllVerified(List.of(ok)));
        assertTrue(gate.isAllOpened(List.of(ok)));
        assertFalse(gate.isAllOpened(List.of(ok, verifiedNotOpened)), "验证通过绝不等于已开放");
        assertTrue(gate.isAllVerified(List.of(ok, verifiedNotOpened)));
        assertEquals(1, gate.openedCount(List.of(ok, verifiedNotOpened)));

        assertFalse(gate.isAllDeployed(null));
        assertFalse(gate.isAllVerified(new ArrayList<>()));
        // List.of 不接受 null 元素，而生产代码必须容忍列表里的 null 行（isEmpty 已做 allMatch(nonNull) 判定）
        assertFalse(gate.isAllOpened(Arrays.asList((RdmReleaseDeployment) null)));
        assertEquals(0, gate.openedCount(null));
    }

    @Test
    @DisplayName("证据采集：哈希稳定可重算，任一事实翻转都会改变哈希（申请自动失效的根基）")
    void evidenceHashIsStableAndSensitive() {
        RdmReleaseBatch batch = batch(1, BUILD_A);
        List<RdmReleaseDeployment> deployments = List.of(deployment(BUILD_A));
        String first = gate.collectEvidence(batch, deployments).hash();
        assertEquals(first, gate.collectEvidence(batch, deployments).hash());

        doReturn(false).when(testBatchService).isTestPassed(ITEM_ID);
        assertFalse(first.equals(gate.collectEvidence(batch, deployments).hash()),
                "测试结论翻转必须改变证据哈希");
        doReturn(true).when(testBatchService).isTestPassed(ITEM_ID);

        doReturn(item(ITEM_ID, SCOPE_VERSION + 1, RdmConstants.PATH_A, RdmConstants.DI_PENDING_RELEASE))
                .when(deliveryItemMapper).selectById(ITEM_ID);
        assertFalse(first.equals(gate.collectEvidence(batch, deployments).hash()),
                "范围升版必须改变证据哈希");
    }

    @Test
    @DisplayName("范围快照只读投影与 applicationVersion 绑定：申请版本变化即哈希变化")
    void applicationVersionParticipatesInHash() {
        List<RdmReleaseDeployment> deployments = List.of(deployment(BUILD_A));
        String v1 = gate.collectEvidence(batch(1, BUILD_A), deployments).hash();
        String v2 = gate.collectEvidence(batch(2, BUILD_A), deployments).hash();
        assertFalse(v1.equals(v2), "不同申请版本的证据不得同哈希");
        assertEquals(List.of(ITEM_ID), gate.scopeItemIds(batch(1, BUILD_A)));
        assertEquals(0, gate.scopeItemIds(null).size());
    }
}
