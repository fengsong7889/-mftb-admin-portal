package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmReleaseApproval;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.service.RdmReleaseFactService.AttemptDraft;
import com.mftb.admin.service.RdmReleaseGateService.Evidence;
import com.mftb.admin.service.RdmReleaseGateService.Stage;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 任务27 发布批次<b>编排层</b>纯 Mockito 离线单测。
 *
 * <p>本测试聚焦「编排口径」：门禁/事实/豁免三类协作服务全部 mock，
 * 只验证 {@link RdmReleaseBatchService} 是否<b>在正确的时机、以正确的阶段</b>调用它们，
 * 以及状态机与追加事实的写入是否符合封死后的口径。锁死下列九条：
 * <ol>
 *   <li><b>发布旁路已封死</b>：decide 必须重验硬门禁（Stage.DECIDE）+ 证据未变 + 四眼 + 灰度；
 *       {@code applyRelease} 不可跳过（无申请快照即无法推进）；</li>
 *   <li><b>check 失败不得掩盖</b>：不通过时绝不置 checking；已是 checking 则回退 planning；</li>
 *   <li><b>审批快照与版本锁</b>：apply 冻结 applicationSnapshotJson/applicationVersion/submittedAt/evidenceHash
 *       并<b>作废上一轮裁决</b>；decide 冻结 approvalSnapshotJson/approvalEvidenceHash/approvalExpiresAt；</li>
 *   <li><b>部署不得偷换构建</b>：写入的 buildId 一律取申请快照批准值，而非客户端上报值；</li>
 *   <li><b>验证通过绝不置 released</b>，也绝不推进交付项状态；released 只能由 open 建立；</li>
 *   <li><b>开放是独立事实</b>：必须全量验证通过之后；全量 opened 才 released 并推进交付项；
 *       OPEN 阶段用 {@link Stage#OPEN}（豁免失效）；</li>
 *   <li><b>回滚撤销开放事实</b>：追加 rollback 事实 + openStatus 置 not_opened + 批次 rolled_back，
 *       使 {@code isOpenFactEstablished} 回 false；</li>
 *   <li><b>止损与推进分治</b>：失败类上报/回滚不重验硬门禁（否则事故现场无法收敛），
 *       推进型动作一律过灰度 + 裁决有效性 + 硬门禁；</li>
 *   <li><b>全部写操作走 executeOnce 幂等</b>，且派生 clientRequestId 必须适配
 *       {@code rdm_idempotent_log.client_request_id VARCHAR(64) ascii} 列宽。</li>
 * </ol>
 *
 * <p><b>边界声明</b>：mock 驱动只证明「分支走向」，不等价于真实事务/并发/唯一约束证明
 * （幂等唯一键与 {@code uk_rdm_attempt} 的真实行为须在任务24 集成测试验证）。
 */
class RdmReleaseBatchServiceTest {

    private static final long BATCH_ID = 900L;
    private static final long PROJECT_ID = 77L;
    private static final long ITEM_ID = 500L;
    private static final long DEPLOYMENT_ID = 800L;
    private static final long OWNER_ID = 11L;
    private static final long APPROVER_ID = 22L;
    private static final long APPROVAL_ID = 555L;
    private static final String SYS_A = "SYS_A";
    private static final String APPROVED_BUILD = "build-approved-1";
    private static final String EVIL_BUILD = "build-evil-9";
    private static final int SCOPE_VERSION = 4;
    private static final int BATCH_VERSION = 3;
    private static final String ACTOR_NAME = "负责人";

    private RdmReleaseBatchMapper batchMapper;
    private RdmReleaseDeploymentMapper deploymentMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmAccessGuard accessGuard;
    private RdmReleaseGateService gateService;
    private RdmReleaseFactService factService;
    private RdmReleaseExemptionService exemptionService;
    private RdmIdempotentService idempotentService;
    private RdmReleaseBatchService service;

    private RdmReleaseBatch batch;
    private RdmReleaseDeployment deployment;
    private List<RdmReleaseDeployment> deployments;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        batchMapper = mock(RdmReleaseBatchMapper.class);
        deploymentMapper = mock(RdmReleaseDeploymentMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        RdmProjectMapper projectMapper = mock(RdmProjectMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        RdmFlowVersionGuard flowVersionGuard = mock(RdmFlowVersionGuard.class);
        gateService = mock(RdmReleaseGateService.class);
        factService = mock(RdmReleaseFactService.class);
        exemptionService = mock(RdmReleaseExemptionService.class);
        idempotentService = mock(RdmIdempotentService.class);

        // 幂等入口在单测里直通业务体（真实 executeOnce 的原子占位由 RdmIdempotentServiceTest 覆盖）
        doAnswer(inv -> ((Supplier<Object>) inv.getArgument(1)).get())
                .when(idempotentService).executeOnce(any(), any(), any());
        doReturn("stub-hash").when(idempotentService).stableRequestHash(any());

        batch = batch(RdmConstants.RB_CHECKING);
        deployment = deployment(RdmConstants.DEPLOY_SUCCESS, RdmConstants.VERIFY_PASSED,
                RdmConstants.OPEN_STATUS_NOT_OPENED, APPROVED_BUILD);
        deployments = new ArrayList<>(List.of(deployment));

        doReturn(batch).when(batchMapper).selectById(BATCH_ID);
        doReturn(deployments).when(deploymentMapper).selectList(any());
        doReturn(deployment).when(deploymentMapper).selectOne(any());
        // 发布负责人校验：非全量可见者必须是本批次负责人（管理岗口径，与四眼签署权正交）
        doReturn(false).when(accessGuard).canSeeAll(any());

        // 门禁协作服务：默认「全部放行」，各用例按需注入失败
        doReturn(new Evidence(List.of(), List.of(), 1)).when(gateService).collectEvidence(any(), any());
        doReturn(APPROVED_BUILD).when(gateService).approvedBuildId(any(), any());
        doReturn(APPROVED_BUILD).when(gateService).resolveApprovedBuildId(any(), any(), any());
        doReturn(true).when(gateService).isAllDeployed(any());
        doReturn(true).when(gateService).isAllVerified(any());
        doReturn(true).when(gateService).isAllOpened(any());
        doReturn(1).when(gateService).openedCount(any());
        doReturn(new ArrayList<RdmReleaseBatchVO.CheckResult>()).when(gateService).computeChecks(any(), any());
        doReturn(true).when(gateService).applyExemptionWaiver(any(), any(), any());

        doReturn(approval(APPROVAL_ID, RdmConstants.APPROVAL_ACTION_DECIDE))
                .when(factService).requireApprovedDecision(BATCH_ID);
        doReturn(approval(APPROVAL_ID, RdmConstants.APPROVAL_ACTION_DECIDE))
                .when(factService).latestApproval(eq(BATCH_ID), any());
        doReturn(new ArrayList<RdmReleaseApproval>()).when(factService).listApprovals(anyLong());
        doReturn(new ArrayList<RdmReleaseAttempt>()).when(factService).listAttempts(anyLong());

        service = new RdmReleaseBatchService(batchMapper, deploymentMapper, deliveryItemMapper, projectMapper,
                accessGuard, bizSeqService, operatorResolver, flowVersionGuard, gateService, factService,
                exemptionService, idempotentService);
    }

    /* ==================== 夹具 ==================== */

    private static RdmReleaseBatch batch(String status) {
        RdmReleaseBatch b = new RdmReleaseBatch();
        b.setId(BATCH_ID);
        b.setBatchNo("RB20261015001");
        b.setVersionTag("v1.0.0");
        b.setProjectId(PROJECT_ID);
        b.setStatus(status);
        b.setReleaseOwnerUserId(OWNER_ID);
        b.setReleaseOwnerUserName(ACTOR_NAME);
        b.setApplicantUserId(OWNER_ID);
        b.setVersion(BATCH_VERSION);
        b.setApplicationVersion(1);
        // 范围快照：行数组格式（建批时冻结）
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("deliveryItemId", ITEM_ID);
        row.put("itemNo", "DI-" + ITEM_ID);
        row.put("title", "交付项" + ITEM_ID);
        row.put("scopeVersion", SCOPE_VERSION);
        row.put("acceptancePath", RdmConstants.PATH_A);
        b.setScopeSnapshotJson(JsonUtils.toJson(List.of(row)));
        return b;
    }

    private static RdmReleaseDeployment deployment(String deployStatus, String verifyStatus,
                                                   String openStatus, String buildId) {
        RdmReleaseDeployment d = new RdmReleaseDeployment();
        d.setId(DEPLOYMENT_ID);
        d.setReleaseBatchId(BATCH_ID);
        d.setSystemCode(SYS_A);
        d.setSystemName("系统A");
        d.setBuildId(buildId);
        d.setDeployStatus(deployStatus);
        d.setVerifyStatus(verifyStatus);
        d.setOpenStatus(openStatus);
        d.setDeployOrder(1);
        d.setAttemptNo(0);
        return d;
    }

    private static RdmReleaseApproval approval(Long id, String action) {
        RdmReleaseApproval a = new RdmReleaseApproval();
        a.setId(id);
        a.setReleaseBatchId(BATCH_ID);
        a.setApplicationVersion(1);
        a.setAction(action);
        a.setDecision(RdmConstants.APPROVAL_ACTION_DECIDE.equals(action)
                ? RdmConstants.DECISION_APPROVED : null);
        return a;
    }

    private static RdmReleaseBatchDTO.Decide decide(String decision) {
        RdmReleaseBatchDTO.Decide dto = new RdmReleaseBatchDTO.Decide();
        dto.setDecision(decision);
        dto.setReason("裁决理由");
        dto.setExpectedVersion(BATCH_VERSION);
        return dto;
    }

    private static RdmReleaseBatchDTO.Deploy deploy(String status, String buildId) {
        RdmReleaseBatchDTO.Deploy dto = new RdmReleaseBatchDTO.Deploy();
        dto.setSystemCode(SYS_A);
        dto.setDeployStatus(status);
        dto.setBuildId(buildId);
        dto.setExpectedVersion(BATCH_VERSION);
        return dto;
    }

    private static RdmReleaseBatchDTO.Verify verifyDto(String status) {
        RdmReleaseBatchDTO.Verify dto = new RdmReleaseBatchDTO.Verify();
        dto.setSystemCode(SYS_A);
        dto.setVerifyStatus(status);
        dto.setExpectedVersion(BATCH_VERSION);
        return dto;
    }

    private static RdmReleaseBatchDTO.Open openDto(String openStatus) {
        RdmReleaseBatchDTO.Open dto = new RdmReleaseBatchDTO.Open();
        dto.setOpenStatus(openStatus);
        dto.setExpectedVersion(BATCH_VERSION);
        return dto;
    }

    private static RdmReleaseBatchDTO.Rollback rollbackDto(String reason) {
        RdmReleaseBatchDTO.Rollback dto = new RdmReleaseBatchDTO.Rollback();
        dto.setReason(reason);
        dto.setExpectedVersion(BATCH_VERSION);
        return dto;
    }

    private AttemptDraft capturedAttempt() {
        ArgumentCaptor<AttemptDraft> captor = ArgumentCaptor.forClass(AttemptDraft.class);
        verify(factService, atLeast(1)).appendAttempt(captor.capture());
        return captor.getValue();
    }

    /* ==================== 1. 封死发布旁路 ==================== */

    @Test
    @DisplayName("封旁路：decide 必须重验硬门禁 + 证据未变 + 四眼 + 灰度，不得只判状态与申请人")
    void decideReleaseRevalidatesHardGate() {
        batch.setStatus(RdmConstants.RB_CHECKING);
        service.decideRelease(BATCH_ID, decide(RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人");

        verify(gateService).requireReleaseApprover(batch, APPROVER_ID);
        verify(gateService).enforceV3ReleaseGrayscale(batch);
        verify(gateService).enforceEvidenceUnchanged(eq(batch), any());
        verify(gateService).enforceHardGate(eq(batch), any(), eq(Stage.DECIDE));
        assertEquals(RdmConstants.RB_DEPLOYING, batch.getStatus());
    }

    @Test
    @DisplayName("封旁路：批准后硬门禁失败（例如新增阻断缺陷）即拒绝裁决，状态原地不动")
    void decideReleaseRejectedWhenHardGateFails() {
        batch.setStatus(RdmConstants.RB_CHECKING);
        doThrow(new BusinessException("放行裁決被硬門禁阻斷：存在阻斷缺陷")).when(gateService)
                .enforceHardGate(eq(batch), any(), eq(Stage.DECIDE));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.decideRelease(
                BATCH_ID, decide(RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人"));
        assertTrue(ex.getMessage().contains("硬門禁"), ex.getMessage());
        assertEquals(RdmConstants.RB_CHECKING, batch.getStatus(), "门禁失败绝不得推进状态");
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
        verify(factService, never()).appendApproval(anyLong(), any(), any(), any(), any(), any(), any(),
                anyLong(), any());
    }

    @Test
    @DisplayName("封旁路：证据已变化（申请后范围/测试/验收/缺陷变动）时裁决被拒，必须重新申请")
    void decideReleaseRejectedWhenEvidenceDrifted() {
        batch.setStatus(RdmConstants.RB_CHECKING);
        doThrow(new BusinessException("證據已變化，本次放行申請已失效")).when(gateService)
                .enforceEvidenceUnchanged(eq(batch), any());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.decideRelease(
                BATCH_ID, decide(RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人"));
        assertTrue(ex.getMessage().contains("證據已變化"), ex.getMessage());
        verify(gateService, never()).enforceHardGate(any(), any(), any());
        assertEquals(RdmConstants.RB_CHECKING, batch.getStatus());
    }

    @Test
    @DisplayName("封旁路：applyRelease 不可跳过——只有 checking 状态（检查全过）才允许申请发布")
    void applyReleaseRequiresCheckingState() {
        batch.setStatus(RdmConstants.RB_PLANNING);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyRelease(BATCH_ID, OWNER_ID, ACTOR_NAME));
        assertTrue(ex.getMessage().contains("請先執行放行檢查"), ex.getMessage());
        verify(gateService, never()).collectEvidence(any(), any());
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
    }

    @Test
    @DisplayName("封旁路：check 未通过时绝不置 checking 掩盖失败；已是 checking 则回退 planning")
    void runCheckNeverMasksFailure() {
        batch.setStatus(RdmConstants.RB_PLANNING);
        doReturn(false).when(gateService).applyExemptionWaiver(any(), any(), any());
        service.runCheck(BATCH_ID, OWNER_ID);
        assertEquals(RdmConstants.RB_PLANNING, batch.getStatus(), "检查不通过绝不置 checking");
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));

        // 证据退化：原本 checking 的批次必须被打回 planning，杜绝 decide 有机可乘
        batch.setStatus(RdmConstants.RB_CHECKING);
        service.runCheck(BATCH_ID, OWNER_ID);
        assertEquals(RdmConstants.RB_PLANNING, batch.getStatus());
        verify(batchMapper).updateById(batch);
    }

    @Test
    @DisplayName("check 全过（含生效豁免叠加）才允许进入 checking")
    void runCheckAdvancesOnlyWhenAllPassed() {
        batch.setStatus(RdmConstants.RB_PLANNING);
        doReturn(true).when(gateService).applyExemptionWaiver(any(), any(), any());
        assertDoesNotThrow(() -> service.runCheck(BATCH_ID, OWNER_ID));
        assertEquals(RdmConstants.RB_CHECKING, batch.getStatus());
        // 读路径顺带刷新补验逾期（不依赖 cron）
        verify(exemptionService).refreshOverdue(BATCH_ID);
    }

    /* ==================== 2. 审批快照与版本锁 ==================== */

    @Test
    @DisplayName("apply 冻结申请快照/申请版本/提交时间/证据哈希，并作废上一轮裁决证据")
    void applyReleaseFreezesSnapshotAndInvalidatesPreviousApproval() {
        batch.setStatus(RdmConstants.RB_CHECKING);
        batch.setApprovalSnapshotJson("{\"stale\":true}");
        batch.setApprovalEvidenceHash("stale-hash");
        batch.setApprovalExpiresAt(LocalDateTime.now().plusDays(3));

        service.applyRelease(BATCH_ID, OWNER_ID, ACTOR_NAME);

        assertNotNull(batch.getApplicationSnapshotJson(), "申请快照必须被冻结");
        assertNotNull(batch.getEvidenceHash(), "证据哈希必须被冻结");
        // nextApplicationVersion = max(version=3, applicationVersion=1) + 1
        assertEquals(4, batch.getApplicationVersion());
        assertNotNull(batch.getSubmittedAt());
        assertNull(batch.getApprovalSnapshotJson(), "上一轮裁决快照必须作废");
        assertNull(batch.getApprovalEvidenceHash(), "上一轮裁决证据哈希必须作废");
        assertNull(batch.getApprovalExpiresAt(), "上一轮裁决有效期必须作废");
        assertEquals(OWNER_ID, batch.getApplicantUserId());
        verify(batchMapper).updateById(batch);
        // apply 留痕（uk(batch, applicationVersion, action) 保证同版本只能申请一次）
        verify(factService).appendApproval(eq(BATCH_ID), eq(4), eq(RdmConstants.APPROVAL_ACTION_APPLY),
                eq(null), any(), any(), any(), eq(OWNER_ID), any());
        verify(gateService).enforceHardGate(eq(batch), any(), eq(Stage.APPLY));
        verify(gateService).enforceV3ReleaseGrayscale(batch);
    }

    @Test
    @DisplayName("decide 批准冻结裁决快照/裁决证据哈希/有效期（RELEASE_VALID_DAYS），拒绝则置 cancelled")
    void decideReleaseFreezesApprovalSnapshotAndExpiry() {
        batch.setStatus(RdmConstants.RB_CHECKING);
        service.decideRelease(BATCH_ID, decide(RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人");
        assertNotNull(batch.getApprovalSnapshotJson());
        assertNotNull(batch.getApprovalEvidenceHash());
        assertNotNull(batch.getApprovalExpiresAt());
        assertTrue(batch.getApprovalExpiresAt().isAfter(LocalDateTime.now()
                        .plusDays(RdmConstants.RELEASE_VALID_DAYS - 1L)),
                "裁决有效期不得短于 RELEASE_VALID_DAYS");
        assertEquals(APPROVER_ID, batch.getApprovalUserId());

        // 驳回：置 cancelled，且不得写任何裁决快照（没有批准就没有可依赖的证据）
        RdmReleaseBatch rejected = batch(RdmConstants.RB_CHECKING);
        doReturn(rejected).when(batchMapper).selectById(BATCH_ID);
        service.decideRelease(BATCH_ID, decide(RdmConstants.DECISION_REJECTED), APPROVER_ID, "审批人");
        assertEquals(RdmConstants.RB_CANCELLED, rejected.getStatus());
        assertNull(rejected.getApprovalSnapshotJson());
        assertNull(rejected.getApprovalExpiresAt());
        verify(gateService, never()).enforceHardGate(eq(rejected), any(), any());
    }

    @Test
    @DisplayName("版本锁：expectedVersion 与批次当前 version 不一致即拒（所有推进型写操作一视同仁）")
    void staleExpectedVersionIsRejected() {
        RdmReleaseBatchDTO.Decide staleDecide = decide(RdmConstants.DECISION_APPROVED);
        staleDecide.setExpectedVersion(BATCH_VERSION + 1);
        assertThrows(BusinessException.class,
                () -> service.decideRelease(BATCH_ID, staleDecide, APPROVER_ID, "审批人"));

        batch.setStatus(RdmConstants.RB_DEPLOYING);
        RdmReleaseBatchDTO.Deploy staleDeploy = deploy(RdmConstants.DEPLOY_SUCCESS, APPROVED_BUILD);
        staleDeploy.setExpectedVersion(BATCH_VERSION - 1);
        assertThrows(BusinessException.class,
                () -> service.submitDeployment(BATCH_ID, staleDeploy, OWNER_ID, ACTOR_NAME));

        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
        verify(deploymentMapper, never()).updateById(any(RdmReleaseDeployment.class));
    }

    /* ==================== 3. 构建不可变 + 追加事实 ==================== */

    @Test
    @DisplayName("构建不可变：部署写入的 buildId 一律取申请快照批准值，客户端上报的构建不得落库")
    void deploymentCannotSwapBuildId() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        // 门禁层已把「上报 != 批准」判为拒绝，这里验证编排层落库的是批准值
        doReturn(APPROVED_BUILD).when(gateService).resolveApprovedBuildId(batch, deployment, EVIL_BUILD);

        service.submitDeployment(BATCH_ID, deploy(RdmConstants.DEPLOY_SUCCESS, EVIL_BUILD), OWNER_ID, ACTOR_NAME);

        assertEquals(APPROVED_BUILD, deployment.getBuildId(), "绝不能把客户端上报的构建写入部署记录");
        verify(gateService).resolveApprovedBuildId(batch, deployment, EVIL_BUILD);
        verify(gateService).enforceApprovalValid(eq(batch), any());
        verify(gateService).enforceHardGate(eq(batch), any(), eq(Stage.DEPLOY));

        AttemptDraft draft = capturedAttempt();
        assertEquals(RdmConstants.ATTEMPT_ACTION_DEPLOY, draft.getAction());
        assertEquals(RdmConstants.ATTEMPT_RESULT_SUCCESS, draft.getResult());
        assertEquals(APPROVED_BUILD, draft.getBuildId(), "追加事实记录的必须是批准构建");
        assertEquals(APPROVAL_ID, draft.getApprovalId(), "无批准不得有事实（approval_id NOT NULL 外键）");
        assertEquals(OWNER_ID, draft.getOperatorUserId());
        assertEquals(1, deployment.getAttemptNo());
    }

    @Test
    @DisplayName("推进型部署上报：全部系统部署成功后批次才进入 verifying")
    void deploymentSuccessAdvancesToVerifying() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        doReturn(true).when(gateService).isAllDeployed(any());
        service.submitDeployment(BATCH_ID, deploy(RdmConstants.DEPLOY_SUCCESS, APPROVED_BUILD),
                OWNER_ID, ACTOR_NAME);
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus());
        verify(batchMapper).updateById(batch);
    }

    @Test
    @DisplayName("止损分治：部署失败/已回滚不重验硬门禁与裁决有效性（否则事故现场无法收敛），但仍追加事实")
    void failedDeploymentIsLossMitigationWithoutHardGate() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        service.submitDeployment(BATCH_ID, deploy(RdmConstants.DEPLOY_FAILED, APPROVED_BUILD),
                OWNER_ID, ACTOR_NAME);

        verify(gateService, never()).enforceHardGate(any(), any(), any());
        verify(gateService, never()).enforceApprovalValid(any(), any());
        verify(gateService, never()).enforceV3ReleaseGrayscale(any());
        assertEquals(RdmConstants.DEPLOY_FAILED, deployment.getDeployStatus());
        assertEquals(RdmConstants.OPEN_STATUS_NOT_OPENED, deployment.getOpenStatus(),
                "部署失败必须撤销开放事实");
        assertEquals(RdmConstants.VERIFY_FAILED, deployment.getVerifyStatus());
        assertEquals(RdmConstants.ATTEMPT_RESULT_FAILED, capturedAttempt().getResult());
        assertEquals(RdmConstants.RB_DEPLOYING, batch.getStatus(), "止损动作不得推进批次状态");
    }

    @Test
    @DisplayName("止损路径无放行留痕时 fail-closed（不得为满足 NOT NULL 外键而编造 approvalId）")
    void lossMitigationFailsClosedWithoutApprovalTrail() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        doReturn(null).when(factService).latestApproval(eq(BATCH_ID), any());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitDeployment(
                BATCH_ID, deploy(RdmConstants.DEPLOY_FAILED, APPROVED_BUILD), OWNER_ID, ACTOR_NAME));
        assertTrue(ex.getMessage().contains("無任何放行留痕"), ex.getMessage());
        verify(factService, never()).appendAttempt(any());
    }

    /* ==================== 4. 验证通过绝不 released ==================== */

    @Test
    @DisplayName("核心：验证通过只置「验证通过」，绝不 released，也绝不推进交付项状态")
    void verificationPassedNeverMarksReleased() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        service.submitVerification(BATCH_ID, verifyDto(RdmConstants.VERIFY_PASSED), OWNER_ID, ACTOR_NAME);

        assertEquals(RdmConstants.VERIFY_PASSED, deployment.getVerifyStatus());
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus(),
                "released 只能由独立的开放动作建立，验证通过绝不等于已发布");
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
        verify(deliveryItemMapper, never()).updateById(any(RdmDeliveryItem.class));
        verify(gateService).enforceHardGate(eq(batch), any(), eq(Stage.VERIFY));

        AttemptDraft draft = capturedAttempt();
        assertEquals(RdmConstants.ATTEMPT_ACTION_VERIFY, draft.getAction());
        assertEquals(RdmConstants.ATTEMPT_RESULT_PASSED, draft.getResult());
        assertEquals(APPROVED_BUILD, draft.getBuildId());
    }

    @Test
    @DisplayName("验证失败属止损：不重验硬门禁，且必须撤销开放事实（路径B 业务验收重新被门禁）")
    void verificationFailedIsLossMitigationAndRevokesOpenFact() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        deployment.setOpenStatus(RdmConstants.OPEN_STATUS_OPENED);
        service.submitVerification(BATCH_ID, verifyDto(RdmConstants.VERIFY_FAILED), OWNER_ID, ACTOR_NAME);

        verify(gateService, never()).enforceHardGate(any(), any(), any());
        verify(gateService, never()).enforceApprovalValid(any(), any());
        assertEquals(RdmConstants.OPEN_STATUS_NOT_OPENED, deployment.getOpenStatus());
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus());
        assertEquals(RdmConstants.ATTEMPT_RESULT_FAILED, capturedAttempt().getResult());
    }

    @Test
    @DisplayName("非法验证状态一律拒（只支持 passed / failed）")
    void illegalVerifyStatusRejected() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        assertThrows(BusinessException.class,
                () -> service.submitVerification(BATCH_ID, verifyDto("released"), OWNER_ID, ACTOR_NAME));
        assertThrows(BusinessException.class,
                () -> service.submitVerification(BATCH_ID, verifyDto(null), OWNER_ID, ACTOR_NAME));
        verify(factService, never()).appendAttempt(any());
    }

    /* ==================== 5. 开放是独立事实 ==================== */

    @Test
    @DisplayName("核心：只有独立开放动作才置 released，并在此之后才推进交付项状态")
    void openReleaseEstablishesReleasedFact() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doReturn(item(RdmConstants.PATH_A)).when(deliveryItemMapper).selectById(ITEM_ID);

        service.openRelease(BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME);

        assertEquals(RdmConstants.OPEN_STATUS_OPENED, deployment.getOpenStatus());
        assertNotNull(deployment.getOpenTime());
        assertEquals(RdmConstants.RB_RELEASED, batch.getStatus());
        verify(gateService).enforceHardGate(eq(batch), any(), eq(Stage.OPEN));
        verify(gateService).enforceApprovalValid(eq(batch), any());
        verify(gateService).enforceV3ReleaseGrayscale(batch);

        AttemptDraft draft = capturedAttempt();
        assertEquals(RdmConstants.ATTEMPT_ACTION_OPEN, draft.getAction());
        assertEquals(RdmConstants.ATTEMPT_RESULT_OPENED, draft.getResult());
        assertEquals(APPROVED_BUILD, draft.getBuildId());

        // 路径A → 完成
        ArgumentCaptor<RdmDeliveryItem> captor = ArgumentCaptor.forClass(RdmDeliveryItem.class);
        verify(deliveryItemMapper).updateById(captor.capture());
        assertEquals(RdmConstants.DI_DONE, captor.getValue().getStatus());
    }

    @Test
    @DisplayName("路径B（先上线后验收）开放后置 released_pending，等业务验收评分，不得直接 done")
    void openReleaseKeepsPathBPendingAcceptance() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doReturn(item(RdmConstants.PATH_B)).when(deliveryItemMapper).selectById(ITEM_ID);
        service.openRelease(BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME);
        ArgumentCaptor<RdmDeliveryItem> captor = ArgumentCaptor.forClass(RdmDeliveryItem.class);
        verify(deliveryItemMapper).updateById(captor.capture());
        assertEquals(RdmConstants.DI_RELEASED_PENDING, captor.getValue().getStatus());
    }

    @Test
    @DisplayName("开放必须晚于全量验证通过：开放是独立事实，但不得提前于验证")
    void openReleaseRejectedBeforeAllVerified() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doReturn(false).when(gateService).isAllVerified(any());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.openRelease(
                BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME));
        assertTrue(ex.getMessage().contains("全部系統驗證通過"), ex.getMessage());
        verify(factService, never()).appendAttempt(any());
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus());
    }

    @Test
    @DisplayName("未达全量开放（部分系统）时只追加事实，绝不置 released")
    void partialOpenDoesNotRelease() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doReturn(false).when(gateService).isAllOpened(any());
        service.openRelease(BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME);
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus());
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
        verify(deliveryItemMapper, never()).updateById(any(RdmDeliveryItem.class));
        verify(factService).appendAttempt(any());
    }

    @Test
    @DisplayName("not_opened 属止损：不校验硬门禁与裁决有效性，但同样追加独立事实")
    void notOpenedIsLossMitigation() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        service.openRelease(BATCH_ID, openDto(RdmConstants.OPEN_STATUS_NOT_OPENED), OWNER_ID, ACTOR_NAME);
        verify(gateService, never()).enforceHardGate(any(), any(), any());
        verify(gateService, never()).enforceApprovalValid(any(), any());
        assertEquals(RdmConstants.OPEN_STATUS_NOT_OPENED, deployment.getOpenStatus());
        assertEquals(RdmConstants.ATTEMPT_RESULT_NOT_OPENED, capturedAttempt().getResult());
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus(), "未开放绝不置 released");
        verify(deliveryItemMapper, never()).updateById(any(RdmDeliveryItem.class));
    }

    @Test
    @DisplayName("开放门禁失败（产品验收未真实建立 / 灰度未开）即拒，豁免不豁免开放")
    void openReleaseRejectedWhenOpenStageGateFails() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doThrow(new BusinessException("業務開放被硬門禁阻斷：產品驗收未真實建立")).when(gateService)
                .enforceHardGate(eq(batch), any(), eq(Stage.OPEN));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.openRelease(
                BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME));
        assertTrue(ex.getMessage().contains("產品驗收未真實建立"), ex.getMessage());
        assertEquals(RdmConstants.RB_VERIFYING, batch.getStatus());
        verify(factService, never()).appendAttempt(any());
        verify(deploymentMapper, never()).updateById(any(RdmReleaseDeployment.class));
    }

    @Test
    @DisplayName("非法开放状态一律拒（只支持 opened / not_opened）")
    void illegalOpenStatusRejected() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        assertThrows(BusinessException.class,
                () -> service.openRelease(BATCH_ID, openDto("released"), OWNER_ID, ACTOR_NAME));
        verify(factService, never()).appendAttempt(any());
    }

    /* ==================== 6. 回滚撤销开放事实 ==================== */

    @Test
    @DisplayName("核心：回滚追加 rollback 事实 + openStatus 置 not_opened + 批次 rolled_back，开放事实被撤销")
    void rollbackRevokesOpenFact() {
        batch.setStatus(RdmConstants.RB_RELEASED);
        deployment.setOpenStatus(RdmConstants.OPEN_STATUS_OPENED);
        // 发布时已推进到 done 的交付项，回滚后必须退回待发布（重新走发布）
        RdmDeliveryItem done = item(RdmConstants.PATH_A);
        done.setStatus(RdmConstants.DI_DONE);
        doReturn(done).when(deliveryItemMapper).selectById(ITEM_ID);

        service.rollback(BATCH_ID, rollbackDto("生产异常，立即回滚"), OWNER_ID, ACTOR_NAME);

        assertEquals(RdmConstants.OPEN_STATUS_NOT_OPENED, deployment.getOpenStatus(),
                "回滚必须撤销开放事实，使 isOpenFactEstablished 回 false");
        assertEquals(RdmConstants.DEPLOY_ROLLED_BACK, deployment.getDeployStatus());
        assertEquals(RdmConstants.VERIFY_FAILED, deployment.getVerifyStatus());
        assertEquals("生产异常，立即回滚", deployment.getRollbackReason());
        assertEquals(RdmConstants.RB_ROLLED_BACK, batch.getStatus(),
                "批次不再是 released，开放事实在批次层也被撤销（双层保证）");

        AttemptDraft draft = capturedAttempt();
        assertEquals(RdmConstants.ATTEMPT_ACTION_ROLLBACK, draft.getAction());
        assertEquals(RdmConstants.ATTEMPT_RESULT_ROLLED_BACK, draft.getResult());
        assertEquals(APPROVAL_ID, draft.getApprovalId());
        assertEquals(APPROVED_BUILD, draft.getBuildId());

        ArgumentCaptor<RdmDeliveryItem> captor = ArgumentCaptor.forClass(RdmDeliveryItem.class);
        verify(deliveryItemMapper).updateById(captor.capture());
        assertEquals(RdmConstants.DI_PENDING_RELEASE, captor.getValue().getStatus());
    }

    @Test
    @DisplayName("回滚只退回「已发布类」交付项，不误改在途状态（developing/testing 等保持原状）")
    void rollbackDoesNotTouchInFlightItems() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        RdmDeliveryItem inFlight = item(RdmConstants.PATH_A);
        inFlight.setStatus(RdmConstants.DI_TESTING);
        doReturn(inFlight).when(deliveryItemMapper).selectById(ITEM_ID);

        service.rollback(BATCH_ID, rollbackDto("止损回滚"), OWNER_ID, ACTOR_NAME);

        assertEquals(RdmConstants.DI_TESTING, inFlight.getStatus(), "在途交付项不得被回滚误改");
        verify(deliveryItemMapper, never()).updateById(any(RdmDeliveryItem.class));

        // released_pending（路径B 已上线待验收）同样必须退回待发布
        // （上一段回滚已把部署置 rolled_back，这里重置为已部署成功以模拟另一个批次的现场）
        deployment.setDeployStatus(RdmConstants.DEPLOY_SUCCESS);
        RdmDeliveryItem releasedPending = item(RdmConstants.PATH_B);
        releasedPending.setStatus(RdmConstants.DI_RELEASED_PENDING);
        doReturn(releasedPending).when(deliveryItemMapper).selectById(ITEM_ID);
        batch.setStatus(RdmConstants.RB_RELEASED);
        service.rollback(BATCH_ID, rollbackDto("路径B 上线后发现问题"), OWNER_ID, ACTOR_NAME);
        assertEquals(RdmConstants.DI_PENDING_RELEASE, releasedPending.getStatus());
    }

    @Test
    @DisplayName("回滚属止损：不重验硬门禁、不因证据过期或灰度未开而被拒（否则事故现场无法回滚）")
    void rollbackIsLossMitigation() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        doThrow(new BusinessException("灰度未開啟")).when(gateService).enforceV3ReleaseGrayscale(any());
        doThrow(new BusinessException("證據已變化")).when(gateService).enforceApprovalValid(any(), any());
        doThrow(new BusinessException("硬門禁阻斷")).when(gateService).enforceHardGate(any(), any(), any());

        assertDoesNotThrow(() -> service.rollback(BATCH_ID, rollbackDto("止损回滚"), OWNER_ID, ACTOR_NAME));
        assertEquals(RdmConstants.RB_ROLLED_BACK, batch.getStatus());
        verify(gateService, never()).enforceHardGate(any(), any(), any());
        verify(gateService, never()).enforceApprovalValid(any(), any());
        verify(gateService, never()).enforceV3ReleaseGrayscale(any());
    }

    @Test
    @DisplayName("回滚必须填写原因；未匹配到已部署系统时不写任何事实")
    void rollbackRequiresReasonAndDeployedTarget() {
        batch.setStatus(RdmConstants.RB_DEPLOYING);
        assertThrows(BusinessException.class,
                () -> service.rollback(BATCH_ID, rollbackDto("  "), OWNER_ID, ACTOR_NAME));

        deployment.setDeployStatus(RdmConstants.DEPLOY_PENDING);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.rollback(
                BATCH_ID, rollbackDto("止损回滚"), OWNER_ID, ACTOR_NAME));
        assertTrue(ex.getMessage().contains("無需回滾"), ex.getMessage());
        verify(factService, never()).appendAttempt(any());
        assertEquals(RdmConstants.RB_DEPLOYING, batch.getStatus());
    }

    @Test
    @DisplayName("灰度未开启时全部推进型动作被拒，但止损动作（失败上报/回滚）仍可执行")
    void grayscaleDisabledBlocksAdvancingButNotLossMitigation() {
        doThrow(new BusinessException("V3 分批交付流程的發布能力尚未對本項目開放")).when(gateService)
                .enforceV3ReleaseGrayscale(any());

        batch.setStatus(RdmConstants.RB_CHECKING);
        assertThrows(BusinessException.class, () -> service.applyRelease(BATCH_ID, OWNER_ID, ACTOR_NAME));

        batch.setStatus(RdmConstants.RB_DEPLOYING);
        assertThrows(BusinessException.class, () -> service.submitDeployment(
                BATCH_ID, deploy(RdmConstants.DEPLOY_SUCCESS, APPROVED_BUILD), OWNER_ID, ACTOR_NAME));

        batch.setStatus(RdmConstants.RB_VERIFYING);
        assertThrows(BusinessException.class, () -> service.submitVerification(
                BATCH_ID, verifyDto(RdmConstants.VERIFY_PASSED), OWNER_ID, ACTOR_NAME));
        assertThrows(BusinessException.class, () -> service.openRelease(
                BATCH_ID, openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME));

        // 止损动作不受灰度影响：灰度关闭期间发生事故也必须能回滚
        assertDoesNotThrow(() -> service.rollback(BATCH_ID, rollbackDto("灰度关闭期间止损"),
                OWNER_ID, ACTOR_NAME));
        assertEquals(RdmConstants.RB_ROLLED_BACK, batch.getStatus());
    }

    /* ==================== 7. 权限与身份 ==================== */

    @Test
    @DisplayName("非发布负责人（且非全量可见）不得执行任何编排动作")
    void onlyReleaseOwnerCanOperate() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitVerification(
                BATCH_ID, verifyDto(RdmConstants.VERIFY_PASSED), 999L, "路人"));
        assertTrue(ex.getMessage().contains("發布負責人"), ex.getMessage());
        verify(factService, never()).appendAttempt(any());
    }

    @Test
    @DisplayName("登录态失效（无 userId 且解析不到认证主体）时 fail-closed，不写任何数据")
    void anonymousActorIsRejected() {
        assertThrows(BusinessException.class, () -> service.applyRelease(BATCH_ID, null, null));
        verify(idempotentService, never()).executeOnce(any(), any(), any());
        verify(batchMapper, never()).updateById(any(RdmReleaseBatch.class));
    }

    /* ==================== 8. 幂等与列宽契约 ==================== */

    @Test
    @DisplayName("全部写操作走 executeOnce 原子幂等，且派生 clientRequestId 适配 VARCHAR(64) ascii 列宽")
    void allWriteOperationsAreIdempotentAndFitClientRequestIdColumn() {
        // 幂等占位发生在业务校验之前：即便业务因状态/门禁拒绝，也必须已走过 executeOnce
        runIgnoringBusinessErrors(() -> service.runCheck(BATCH_ID, OWNER_ID));
        runIgnoringBusinessErrors(() -> service.applyRelease(BATCH_ID, OWNER_ID, ACTOR_NAME));
        runIgnoringBusinessErrors(() -> service.decideRelease(BATCH_ID,
                decide(RdmConstants.DECISION_APPROVED), APPROVER_ID, "审批人"));
        runIgnoringBusinessErrors(() -> service.submitDeployment(BATCH_ID,
                deploy(RdmConstants.DEPLOY_SUCCESS, APPROVED_BUILD), OWNER_ID, ACTOR_NAME));
        runIgnoringBusinessErrors(() -> service.submitVerification(BATCH_ID,
                verifyDto(RdmConstants.VERIFY_PASSED), OWNER_ID, ACTOR_NAME));
        runIgnoringBusinessErrors(() -> service.openRelease(BATCH_ID,
                openDto(RdmConstants.OPEN_STATUS_OPENED), OWNER_ID, ACTOR_NAME));
        runIgnoringBusinessErrors(() -> service.rollback(BATCH_ID, rollbackDto("回滚"), OWNER_ID, ACTOR_NAME));

        ArgumentCaptor<IdempotentKey> captor = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService, times(7)).executeOnce(captor.capture(), any(), any());
        Set<String> bizTypes = captor.getAllValues().stream()
                .map(IdempotentKey::getBizType).collect(Collectors.toSet());
        assertEquals(Set.of("rdm_release_check", "rdm_release_apply", "rdm_release_decide",
                "rdm_release_deploy", "rdm_release_verify", "rdm_release_open", "rdm_release_rollback"),
                bizTypes, "每个发布写操作都必须有独立的幂等业务类型");

        for (IdempotentKey key : captor.getAllValues()) {
            assertNotNull(key.getUserId(), key.getBizType() + " 幂等键必须绑定操作人");
            assertTrue(OWNER_ID == key.getUserId() || APPROVER_ID == key.getUserId(),
                    key.getBizType() + " 幂等键的操作人必须是本次真实主体: " + key.getUserId());
            assertEquals("release-batch:" + BATCH_ID, key.getResourceKey());
            assertNotNull(key.getRequestHash());
            String clientRequestId = key.getClientRequestId();
            assertNotNull(clientRequestId, key.getBizType());
            // rdm_idempotent_log.client_request_id VARCHAR(64) CHARACTER SET ascii：溢出会直接写库失败
            assertTrue(clientRequestId.length() <= 64,
                    key.getBizType() + " 的 clientRequestId 超出列宽: " + clientRequestId);
            assertTrue(clientRequestId.chars().allMatch(c -> c >= 0x20 && c <= 0x7E),
                    key.getBizType() + " 的 clientRequestId 含非 ASCII 字符: " + clientRequestId);
        }
    }

    @Test
    @DisplayName("客户端显式 requestId 优先用于幂等键（重试保持不变），且不破坏列宽约束")
    void clientRequestIdIsPreferredWhenProvided() {
        batch.setStatus(RdmConstants.RB_VERIFYING);
        RdmReleaseBatchDTO.Verify dto = verifyDto(RdmConstants.VERIFY_PASSED);
        dto.setRequestId("req-20261015-abc");
        service.submitVerification(BATCH_ID, dto, OWNER_ID, ACTOR_NAME);

        ArgumentCaptor<IdempotentKey> captor = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(captor.capture(), any(), any());
        assertEquals("verify:req-20261015-abc", captor.getValue().getClientRequestId());
    }

    @Test
    @DisplayName("豁免/裁决/补验三个新端点委派给 RdmReleaseExemptionService，编排层不重复实现门禁")
    void exemptionOperationsAreDelegated() {
        RdmReleaseBatchDTO.Exemption exemption = new RdmReleaseBatchDTO.Exemption();
        RdmReleaseBatchDTO.ExemptionDecision decision = new RdmReleaseBatchDTO.ExemptionDecision();
        RdmReleaseBatchDTO.SupplementaryComplete complete = new RdmReleaseBatchDTO.SupplementaryComplete();

        service.applyExemption(BATCH_ID, exemption, OWNER_ID, ACTOR_NAME);
        service.decideExemption(BATCH_ID, 700L, decision, APPROVER_ID, "审批人");
        service.completeSupplementary(701L, complete, OWNER_ID, ACTOR_NAME);

        verify(exemptionService).applyExemption(BATCH_ID, exemption, OWNER_ID, ACTOR_NAME);
        verify(exemptionService).decideExemption(BATCH_ID, 700L, decision, APPROVER_ID, "审批人");
        verify(exemptionService).completeSupplementary(701L, complete, OWNER_ID, ACTOR_NAME);
        // 委派动作同样必须走幂等入口（由豁免服务自身负责），编排层不得绕过
        verify(idempotentService, never()).executeOnce(any(), any(), any());
    }

    /* ==================== 辅助 ==================== */

    private static RdmDeliveryItem item(String path) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(ITEM_ID);
        it.setItemNo("DI-" + ITEM_ID);
        it.setTitle("交付项" + ITEM_ID);
        it.setScopeVersion(SCOPE_VERSION);
        it.setAcceptancePath(path);
        it.setStatus(RdmConstants.DI_PENDING_RELEASE);
        return it;
    }

    /**
     * 容忍业务异常地执行一次写入口：本用例只关心「幂等占位是否发生」，
     * 而占位在业务校验之前，因此状态/门禁导致的拒绝不影响断言。
     */
    private static void runIgnoringBusinessErrors(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException ignored) {
            // 幂等入口已被调用即达成本用例目的（BusinessException 也是 RuntimeException）
        }
    }
}
