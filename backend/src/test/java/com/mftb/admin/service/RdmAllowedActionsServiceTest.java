package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.service.RdmAllowedActionsService.AllowedAction;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 任务31：{@link RdmAllowedActionsService#computeReleaseBatchActions} 发布动作码下发口径（纯 Mockito 离线）。
 *
 * <p>锁死前后端共用契约的三条维度：<b>状态机 × 角色资格 × V3 灰度</b>：
 * <ol>
 *   <li>灰度关闭时推进型动作（apply/decide/deploy/verify/open/exemption 类/supplementary_complete）一律不下发，
 *       但 <b>rollback 作为止损动作</b>只要状态机允许（deploying/verifying/released）仍下发；</li>
 *   <li>灰度开启 + 合格角色 + 对应状态 → 下发相应码；</li>
 *   <li>四眼：申请人本人不下发 decide/exemption_decide；<b>管理员不因 canSeeAll 获得 decide</b>；</li>
 *   <li>view 可见即下发；add_item 保持既有（仅 PLANNING、发布负责人）。</li>
 * </ol>
 *
 * <p>本方法仅供 UI 展示，不弱化任何写接口的 @RequirePermission 与服务层四眼/状态机/硬门禁。
 */
class RdmAllowedActionsServiceTest {

    private static final long BATCH_ID = 900L;
    private static final long PROJECT_ID = 77L;
    /** 发布负责人 */
    private static final long OWNER_ID = 40L;
    /** 申请人（apply 冻结的 applicantUserId） */
    private static final long APPLICANT_ID = 11L;
    /** 项目成员且非申请人（合格裁决人） */
    private static final long MEMBER_ID = 22L;
    /** 系统管理员（canSeeAll，但非项目成员） */
    private static final long ADMIN_ID = 99L;

    private RdmReleaseBatchMapper releaseBatchMapper;
    private RdmProjectMemberMapper memberMapper;
    private OperatorResolver operatorResolver;
    private RdmFlowVersionGuard flowVersionGuard;
    private RdmReleaseExemptionService exemptionService;
    private RdmAllowedActionsService service;

    @BeforeEach
    void setUp() {
        releaseBatchMapper = mock(RdmReleaseBatchMapper.class);
        memberMapper = mock(RdmProjectMemberMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        flowVersionGuard = mock(RdmFlowVersionGuard.class);
        exemptionService = mock(RdmReleaseExemptionService.class);
        // 默认：非项目成员、非管理员、灰度关闭、无豁免/补验
        when(memberMapper.selectCount(any())).thenReturn(0L);
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(operatorResolver.currentUser()).thenReturn(null);
        when(flowVersionGuard.isV3ReleaseEnabled(any())).thenReturn(false);
        when(exemptionService.latestExemption(any())).thenReturn(null);
        when(exemptionService.listDecisions(any())).thenReturn(List.of());
        when(exemptionService.listSupplementaries(any())).thenReturn(List.of());

        service = new RdmAllowedActionsService(
                mock(RdmProjectMapper.class),
                memberMapper,
                mock(RdmDeliveryItemMapper.class),
                mock(RdmRequirementMapper.class),
                mock(RdmTestBatchMapper.class),
                mock(RdmIssueMapper.class),
                releaseBatchMapper,
                operatorResolver,
                flowVersionGuard,
                exemptionService);
    }

    /* ==================== 辅助 ==================== */

    private static SysUser user(long id) {
        SysUser u = new SysUser();
        u.setId(id);
        return u;
    }

    private RdmReleaseBatch batch(String status, Long releaseOwner, Long applicant) {
        RdmReleaseBatch b = new RdmReleaseBatch();
        b.setId(BATCH_ID);
        b.setProjectId(PROJECT_ID);
        b.setStatus(status);
        b.setReleaseOwnerUserId(releaseOwner);
        b.setApplicantUserId(applicant);
        return b;
    }

    private void givenBatch(RdmReleaseBatch b) {
        when(releaseBatchMapper.selectById(BATCH_ID)).thenReturn(b);
    }

    private void givenGrayscale(boolean enabled) {
        when(flowVersionGuard.isV3ReleaseEnabled(PROJECT_ID)).thenReturn(enabled);
    }

    private void givenProjectMember(long userId) {
        // isProjectMember 只按 projectId+userId+leaveTime IS NULL 计数，测试用统一桩即可
        when(memberMapper.selectCount(any())).thenReturn(1L);
    }

    private void givenAdmin(long adminId) {
        when(operatorResolver.currentUser()).thenReturn(user(adminId));
        when(operatorResolver.isAdmin(any())).thenReturn(true);
    }

    private Set<String> codes(long userId) {
        return service.computeReleaseBatchActions(BATCH_ID, userId).stream()
                .map(AllowedAction::getCode)
                .collect(Collectors.toSet());
    }

    /* ==================== view / 空批次 ==================== */

    @Test
    @DisplayName("批次不存在 → 空列表（连 view 都不下发）")
    void batchNotFound_returnsEmpty() {
        when(releaseBatchMapper.selectById(BATCH_ID)).thenReturn(null);
        assertTrue(service.computeReleaseBatchActions(BATCH_ID, OWNER_ID).isEmpty());
    }

    @Test
    @DisplayName("view 可见即下发（与灰度/角色无关）")
    void view_alwaysPresent() {
        givenBatch(batch(RdmConstants.RB_PLANNING, OWNER_ID, null));
        assertTrue(codes(OWNER_ID).contains("view"));
        // 非负责人、灰度关闭也仍有 view
        assertTrue(codes(MEMBER_ID).contains("view"));
    }

    /* ==================== add_item（既有行为不回归） ==================== */

    @Test
    @DisplayName("add_item 仅 PLANNING + 发布负责人，且不受灰度门控")
    void addItem_onlyPlanningOwner() {
        givenBatch(batch(RdmConstants.RB_PLANNING, OWNER_ID, null));
        givenGrayscale(false);
        assertTrue(codes(OWNER_ID).contains("add_item"));
        // 非负责人不下发
        assertFalse(codes(MEMBER_ID).contains("add_item"));
        // 非 PLANNING 不下发
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        assertFalse(codes(OWNER_ID).contains("add_item"));
    }

    /* ==================== 灰度门控 ==================== */

    @Test
    @DisplayName("灰度关闭：checking 不下发 apply/decide")
    void grayscaleOff_noApplyDecide() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(false);
        givenProjectMember(MEMBER_ID);
        Set<String> owner = codes(OWNER_ID);
        assertFalse(owner.contains("apply"));
        Set<String> member = codes(MEMBER_ID);
        assertFalse(member.contains("decide"));
    }

    @Test
    @DisplayName("灰度关闭：deploying/verifying 不下发推进码，但 rollback 仍下发（止损例外）")
    void grayscaleOff_rollbackStillPresent() {
        givenBatch(batch(RdmConstants.RB_DEPLOYING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(false);
        Set<String> owner = codes(OWNER_ID);
        assertFalse(owner.contains("deploy"));
        assertFalse(owner.contains("apply"));
        assertTrue(owner.contains("rollback"));

        givenBatch(batch(RdmConstants.RB_VERIFYING, OWNER_ID, APPLICANT_ID));
        Set<String> verifying = codes(OWNER_ID);
        assertFalse(verifying.contains("verify"));
        assertFalse(verifying.contains("open"));
        assertTrue(verifying.contains("rollback"));

        givenBatch(batch(RdmConstants.RB_RELEASED, OWNER_ID, APPLICANT_ID));
        Set<String> released = codes(OWNER_ID);
        assertTrue(released.contains("rollback"));
        assertFalse(released.contains("open"));
    }

    @Test
    @DisplayName("灰度关闭：非可回滚状态（planning/checking/cancelled/rolled_back）不下发 rollback")
    void grayscaleOff_noRollbackOnNonRollbackable() {
        for (String st : List.of(RdmConstants.RB_PLANNING, RdmConstants.RB_CHECKING,
                RdmConstants.RB_CANCELLED, RdmConstants.RB_ROLLED_BACK)) {
            givenBatch(batch(st, OWNER_ID, APPLICANT_ID));
            assertFalse(codes(OWNER_ID).contains("rollback"), "状态不应可回滚: " + st);
        }
    }

    /* ==================== 灰度开启 × 状态机 × 角色 ==================== */

    @Test
    @DisplayName("灰度开启 + checking + 发布负责人 → apply")
    void apply_onCheckingOwner() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        assertTrue(codes(OWNER_ID).contains("apply"));
        // 非负责人不下发 apply
        assertFalse(codes(MEMBER_ID).contains("apply"));
    }

    @Test
    @DisplayName("灰度开启 + checking + 项目成员且非申请人 → decide（四眼）")
    void decide_onCheckingQualifiedApprover() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenProjectMember(MEMBER_ID);
        assertTrue(codes(MEMBER_ID).contains("decide"));
    }

    @Test
    @DisplayName("四眼：申请人本人即便灰度开启+checking 也不下发 decide")
    void decide_notForApplicant() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenProjectMember(APPLICANT_ID);
        assertFalse(codes(APPLICANT_ID).contains("decide"));
    }

    @Test
    @DisplayName("管理员不因 canSeeAll 获得 decide（非项目成员的管理员无审批资格）")
    void decide_notForAdminViaCanSeeAll() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenAdmin(ADMIN_ID);
        // memberMapper.selectCount 默认 0 → 管理员非项目成员
        Set<String> admin = codes(ADMIN_ID);
        assertFalse(admin.contains("decide"));
        // 管理员作为发布负责人管理岗仍可 apply（apply 走发布负责人资格）
        assertTrue(admin.contains("apply"));
    }

    @Test
    @DisplayName("灰度开启 + deploying + 发布负责人 → deploy")
    void deploy_onDeployingOwner() {
        givenBatch(batch(RdmConstants.RB_DEPLOYING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        Set<String> owner = codes(OWNER_ID);
        assertTrue(owner.contains("deploy"));
        assertTrue(owner.contains("rollback"));
        assertFalse(owner.contains("apply"));
    }

    @Test
    @DisplayName("灰度开启 + verifying + 发布负责人 → verify + open")
    void verifyOpen_onVerifyingOwner() {
        givenBatch(batch(RdmConstants.RB_VERIFYING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        Set<String> owner = codes(OWNER_ID);
        assertTrue(owner.contains("verify"));
        assertTrue(owner.contains("open"));
        assertFalse(owner.contains("deploy"));
    }

    @Test
    @DisplayName("灰度开启 + active 状态 + 发布负责人 → exemption_apply")
    void exemptionApply_onActiveOwner() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        assertTrue(codes(OWNER_ID).contains("exemption_apply"));
        // 已结束批次不下发
        givenBatch(batch(RdmConstants.RB_RELEASED, OWNER_ID, APPLICANT_ID));
        assertFalse(codes(OWNER_ID).contains("exemption_apply"));
    }

    @Test
    @DisplayName("灰度开启 + 在途豁免 + 项目成员非豁免申请人 → exemption_decide")
    void exemptionDecide_forQualifiedSigner() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenProjectMember(MEMBER_ID);
        RdmReleaseExemption ex = new RdmReleaseExemption();
        ex.setId(5001L);
        ex.setReleaseBatchId(BATCH_ID);
        ex.setApplicantUserId(OWNER_ID); // 豁免申请人 = 发布负责人
        when(exemptionService.latestExemption(BATCH_ID)).thenReturn(ex);
        when(exemptionService.listDecisions(5001L)).thenReturn(List.of());
        assertTrue(codes(MEMBER_ID).contains("exemption_decide"));
    }

    @Test
    @DisplayName("四眼：豁免申请人本人不下发 exemption_decide")
    void exemptionDecide_notForExemptionApplicant() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenProjectMember(OWNER_ID);
        RdmReleaseExemption ex = new RdmReleaseExemption();
        ex.setId(5001L);
        ex.setApplicantUserId(OWNER_ID);
        when(exemptionService.latestExemption(BATCH_ID)).thenReturn(ex);
        when(exemptionService.listDecisions(5001L)).thenReturn(List.of());
        assertFalse(codes(OWNER_ID).contains("exemption_decide"));
    }

    @Test
    @DisplayName("两类裁决齐备 → 不再下发 exemption_decide")
    void exemptionDecide_absentWhenBothDecided() {
        givenBatch(batch(RdmConstants.RB_CHECKING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        givenProjectMember(MEMBER_ID);
        RdmReleaseExemption ex = new RdmReleaseExemption();
        ex.setId(5001L);
        ex.setApplicantUserId(OWNER_ID);
        when(exemptionService.latestExemption(BATCH_ID)).thenReturn(ex);
        RdmReleaseExemptionDecision d1 = new RdmReleaseExemptionDecision();
        d1.setDecisionType(RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK);
        RdmReleaseExemptionDecision d2 = new RdmReleaseExemptionDecision();
        d2.setDecisionType(RdmConstants.EXEMPTION_DECISION_RELEASE);
        when(exemptionService.listDecisions(5001L)).thenReturn(List.of(d1, d2));
        assertFalse(codes(MEMBER_ID).contains("exemption_decide"));
    }

    @Test
    @DisplayName("灰度开启 + 本人待补验单(pending) → supplementary_complete；非本人/已结束不下发")
    void supplementaryComplete_forDesignatedVerifier() {
        givenBatch(batch(RdmConstants.RB_VERIFYING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(true);
        RdmSupplementaryVerification sv = new RdmSupplementaryVerification();
        sv.setId(6001L);
        sv.setReleaseBatchId(BATCH_ID);
        sv.setStatus(RdmConstants.SUPPLEMENTARY_STATUS_PENDING);
        sv.setVerifierUserId(MEMBER_ID);
        when(exemptionService.listSupplementaries(BATCH_ID)).thenReturn(List.of(sv));
        assertTrue(codes(MEMBER_ID).contains("supplementary_complete"));
        // 非指定补验人不下发
        assertFalse(codes(OWNER_ID).contains("supplementary_complete"));
        // 已完成的补验单不下发
        sv.setStatus(RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED);
        assertFalse(codes(MEMBER_ID).contains("supplementary_complete"));
    }

    @Test
    @DisplayName("灰度关闭时 supplementary_complete / exemption_apply / exemption_decide 均不下发")
    void grayscaleOff_noExemptionOrSupplementary() {
        givenBatch(batch(RdmConstants.RB_VERIFYING, OWNER_ID, APPLICANT_ID));
        givenGrayscale(false);
        givenProjectMember(MEMBER_ID);
        RdmReleaseExemption ex = new RdmReleaseExemption();
        ex.setId(5001L);
        ex.setApplicantUserId(OWNER_ID);
        when(exemptionService.latestExemption(BATCH_ID)).thenReturn(ex);
        RdmSupplementaryVerification sv = new RdmSupplementaryVerification();
        sv.setStatus(RdmConstants.SUPPLEMENTARY_STATUS_PENDING);
        sv.setVerifierUserId(MEMBER_ID);
        when(exemptionService.listSupplementaries(BATCH_ID)).thenReturn(List.of(sv));

        Set<String> owner = codes(OWNER_ID);
        assertFalse(owner.contains("exemption_apply"));
        Set<String> member = codes(MEMBER_ID);
        assertFalse(member.contains("exemption_decide"));
        assertFalse(member.contains("supplementary_complete"));
    }
}
