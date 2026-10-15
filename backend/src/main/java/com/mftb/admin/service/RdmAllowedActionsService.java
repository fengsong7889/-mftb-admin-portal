package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * RDM 可执行动作计算服务（Batch 2 / Phase 1B）。
 *
 * <p>「一处计算、多处消费」的动作权限口径：前端详情页/列表行的按钮不再各自拼 {@code if status==... && role==...}，
 * 而是统一向本服务要一份 {@link AllowedAction} 列表，按 tone 渲染按钮。这样做的价值：
 * <ul>
 *   <li><b>单一真相源</b>：状态机 + 角色矩阵集中在此，改一处即全局生效，避免前后端各判一套导致
 *       "按钮能点但接口 403"或"接口允许但按钮不显示"的错位；</li>
 *   <li><b>只描述可执行性，不执行</b>：本服务不做任何写操作，真正的权限强校验仍由各写接口的
 *       {@link RdmAccessGuard} 兜底，前端隐藏按钮只是体验优化，不是安全边界。</li>
 * </ul>
 *
 * <p>角色口径：项目协调人 = 项目经理（pm_user_id）或成员角色含 pm/pmo；系统管理员放行全部动作。
 * 交付项/测试批次/问题/发布批次各有其负责人字段，按对象归属判定。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmAllowedActionsService {

    /** 项目协调人角色码（rdm_project_member.role_code 口径，小写） */
    private static final Set<String> COORDINATOR_ROLES = Set.of("pm", "pmo");

    /** 按钮语义色 */
    private static final String TONE_DEFAULT = "default";
    private static final String TONE_PRIMARY = "primary";
    private static final String TONE_SUCCESS = "success";
    private static final String TONE_WARNING = "warning";
    private static final String TONE_DANGER = "danger";

    private final RdmProjectMapper projectMapper;
    private final RdmProjectMemberMapper memberMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmReleaseBatchMapper releaseBatchMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 项目 ==================== */

    /**
     * 计算项目可执行动作。
     * <p>查看对所有人开放；写动作仅协调人（或管理员）在项目处于对应状态时可见。
     */
    public List<AllowedAction> computeProjectActions(Long projectId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmProject project = projectId == null ? null : projectMapper.selectById(projectId);
        if (project == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));

        boolean coordinator = isProjectCoordinator(project, userId);
        if (!coordinator) {
            return actions;
        }
        String status = project.getStatus();
        if (RdmConstants.PROJECT_PREPARING.equals(status) || isInProgress(status)) {
            actions.add(new AllowedAction("edit", "編輯項目", TONE_PRIMARY));
            actions.add(new AllowedAction("add_delivery_item", "新增交付項", TONE_PRIMARY));
        }
        if (RdmConstants.PROJECT_PREPARING.equals(status)) {
            actions.add(new AllowedAction("activate", "啟動項目", TONE_SUCCESS));
        }
        if (isInProgress(status)) {
            actions.add(new AllowedAction("pause", "暫停項目", TONE_WARNING));
            actions.add(new AllowedAction("complete", "完成項目", TONE_SUCCESS));
        }
        if (Integer.valueOf(1).equals(project.getPausedFlag())) {
            actions.add(new AllowedAction("resume", "恢復項目", TONE_SUCCESS));
        }
        if (!RdmConstants.PROJECT_CLOSED.equals(status)) {
            actions.add(new AllowedAction("close", "關閉項目", TONE_DANGER));
        }
        return actions;
    }

    /* ==================== 交付项 ==================== */

    /**
     * 计算交付项可执行动作。
     * <p>协调人（或管理员）可编辑、冻结范围、开新版本、派工、提测；范围已冻结后编辑受限，
     * 只能走"新范围版本"，防止冻结后被悄悄改口径。
     */
    public List<AllowedAction> computeDeliveryItemActions(Long itemId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmDeliveryItem item = itemId == null ? null : deliveryItemMapper.selectById(itemId);
        if (item == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));
        if (!isDeliveryCoordinator(item, userId)) {
            return actions;
        }
        String status = item.getStatus();
        boolean frozen = item.getScopeFrozenAt() != null;
        boolean done = RdmConstants.DI_DONE.equals(status);

        if (!done) {
            // 冻结后基础编辑收口，范围类改动必须开新版本留痕
            if (!frozen) {
                actions.add(new AllowedAction("edit", "編輯交付項", TONE_PRIMARY));
                actions.add(new AllowedAction("freeze_scope", "凍結範圍", TONE_SUCCESS));
            } else {
                actions.add(new AllowedAction("new_scope_version", "新範圍版本", TONE_WARNING));
            }
            actions.add(new AllowedAction("assign_task", "派发任務", TONE_PRIMARY));
        }
        // 开发中/测试前可提测；已进入验收及以后不再重复提测
        if (RdmConstants.DI_DEVELOPING.equals(status) || RdmConstants.DI_TESTING.equals(status)) {
            actions.add(new AllowedAction("submit_test", "提交提測", TONE_SUCCESS));
        }
        return actions;
    }

    /* ==================== 测试批次 ==================== */

    /**
     * 计算测试批次可执行动作。
     * <p>测试负责人（或管理员）主导受理/退回/录入/重测；申请人可撤回待受理的批次。
     */
    public List<AllowedAction> computeTestBatchActions(Long batchId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmTestBatch batch = batchId == null ? null : testBatchMapper.selectById(batchId);
        if (batch == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));
        boolean testLead = isAdmin(userId) || eq(batch.getTestLeadUserId(), userId);
        String status = batch.getStatus();

        if (testLead) {
            if (RdmConstants.TB_PENDING.equals(status)) {
                actions.add(new AllowedAction("accept", "受理提測", TONE_SUCCESS));
                actions.add(new AllowedAction("return", "退回提測", TONE_DANGER));
            }
            if (RdmConstants.TB_ACCEPTED.equals(status) || RdmConstants.TB_EXECUTING.equals(status)) {
                actions.add(new AllowedAction("submit_execution", "錄入測試結果", TONE_PRIMARY));
            }
            if (RdmConstants.TB_FAILED.equals(status)) {
                actions.add(new AllowedAction("retest", "發起重測", TONE_WARNING));
            }
        }
        // 申请人可在批次尚未受理前重测（补充构建/范围）
        if (eq(batch.getApplicantUserId(), userId) && RdmConstants.TB_RETURNED.equals(status)) {
            actions.add(new AllowedAction("retest", "重新提測", TONE_PRIMARY));
        }
        return actions;
    }

    /* ==================== 问题 ==================== */

    /**
     * 计算问题可执行动作。
     * <p>负责人可编辑/申请延期/关闭；产品与业务决策、绑定后续需求按延期单状态开放给对应角色。
     */
    public List<AllowedAction> computeIssueActions(Long issueId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmIssue issue = issueId == null ? null : issueMapper.selectById(issueId);
        if (issue == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));
        boolean owner = isAdmin(userId) || eq(issue.getOwnerUserId(), userId)
                || eq(issue.getReporterUserId(), userId);
        String status = issue.getStatus();
        boolean open = RdmConstants.ISSUE_OPEN_STATUSES.contains(status);

        if (owner && open) {
            actions.add(new AllowedAction("edit", "編輯問題", TONE_PRIMARY));
            actions.add(new AllowedAction("apply_defer", "申請延期", TONE_WARNING));
        }
        // 产品/业务决策与绑定后续：面向管理岗，未决问题即可发起
        if (isAdmin(userId) && open) {
            actions.add(new AllowedAction("product_decide", "產品裁決", TONE_PRIMARY));
            actions.add(new AllowedAction("biz_decide", "業務裁決", TONE_PRIMARY));
            actions.add(new AllowedAction("bind_followup", "綁定後續需求", TONE_DEFAULT));
        }
        if (owner && (RdmConstants.ISSUE_PROCESSING.equals(status)
                || RdmConstants.ISSUE_PENDING_VERIFY.equals(status))) {
            actions.add(new AllowedAction("close", "關閉問題", TONE_SUCCESS));
        }
        return actions;
    }

    /* ==================== 发布批次 ==================== */

    /**
     * 计算发布批次可执行动作。
     * <p>第二批阶段 V3 实际发布能力未开放：所有写动作（申请发布/部署/验证/开放）一律不下发，
     * 仅保留查看与加入交付项等准备动作，避免前端渲染出点了必失败的按钮。
     */
    public List<AllowedAction> computeReleaseBatchActions(Long batchId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmReleaseBatch batch = batchId == null ? null : releaseBatchMapper.selectById(batchId);
        if (batch == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));
        boolean releaseOwner = isAdmin(userId) || eq(batch.getReleaseOwnerUserId(), userId);
        if (!releaseOwner) {
            return actions;
        }
        String status = batch.getStatus();
        if (RdmConstants.RB_PLANNING.equals(status)) {
            actions.add(new AllowedAction("add_item", "加入交付項", TONE_PRIMARY));
        }
        // 发布/部署/验证/开放属于第三批能力，第二批不下发这些动作（详见 RdmFlowVersionGuard）
        return actions;
    }

    /* ==================== 需求 ==================== */

    /**
     * 计算需求可执行动作（粗粒度口径，供 V3 需求详情的按钮渲染）。
     * <p>与 {@code RdmRequirementServiceImpl} 内基于流转规则表（config-driven）的 {@code allowedActions}
     * 分工不同：那份描述「当前状态下配置允许哪些流转动作」，本方法描述「按角色与生命周期阶段可发起哪些
     * 管理类操作」，二者互补，前端可合并渲染。写动作的真实强校验仍由各写接口的 {@link RdmAccessGuard} 兜底。
     * <ul>
     *   <li>查看：对所有人开放；</li>
     *   <li>编辑/提交：草稿或被准入驳回态，且当前人为提出人或管理员；</li>
     *   <li>结构管理（挂/摘执行子需求）：仅 V3 聚合需求，且当前人为产品经理/研发负责人/管理员；</li>
     *   <li>建交付项：需求已受理进入执行链路后，产品经理/研发负责人/管理员可发起。</li>
     * </ul>
     */
    public List<AllowedAction> computeRequirementActions(Long reqId, Long userId) {
        List<AllowedAction> actions = new ArrayList<>();
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            return actions;
        }
        actions.add(new AllowedAction("view", "查看詳情", TONE_DEFAULT));

        String status = req.getStatus();
        boolean admin = isAdmin(userId);
        boolean submitter = eq(req.getSubmitterUserId(), userId);
        boolean manager = admin || eq(req.getAssigneePmUserId(), userId) || eq(req.getDevOwnerUserId(), userId);

        // 草稿/准入驳回：提出人可继续编辑并重新提交
        if ((RdmConstants.STATUS_DRAFT.equals(status) || RdmConstants.STATUS_INTAKE_REJECTED.equals(status))
                && (admin || submitter)) {
            actions.add(new AllowedAction("edit", "編輯需求", TONE_PRIMARY));
            actions.add(new AllowedAction("submit", "提交需求", TONE_SUCCESS));
        }

        // V3 聚合需求：可维护结构主子关系（挂/摘执行子需求）
        boolean v3 = req.getFlowVersion() != null && req.getFlowVersion() == RdmConstants.FLOW_VERSION_3;
        if (v3 && RdmConstants.KIND_AGGREGATE.equals(req.getRequirementKind()) && manager) {
            actions.add(new AllowedAction("manage_structure", "維護結構子需求", TONE_PRIMARY));
        }

        // 已受理进入执行链路：可发起交付项拆分
        if (manager && isRequirementExecutable(status)) {
            actions.add(new AllowedAction("create_delivery_item", "新增交付項", TONE_PRIMARY));
        }
        return actions;
    }

    /* ==================== 角色判定辅助 ==================== */

    /** 项目协调人：项目经理本人、成员角色含 pm/pmo，或系统管理员 */
    private boolean isProjectCoordinator(RdmProject project, Long userId) {
        if (isAdmin(userId)) {
            return true;
        }
        if (userId == null) {
            return false;
        }
        if (userId.equals(project.getPmUserId())) {
            return true;
        }
        return memberMapper.selectCount(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, project.getId())
                .eq(RdmProjectMember::getUserId, userId)
                .in(RdmProjectMember::getRoleCode, COORDINATOR_ROLES)
                .isNull(RdmProjectMember::getLeaveTime)) > 0;
    }

    /** 交付项协调人：交付项协调人本人、所属项目协调人，或系统管理员 */
    private boolean isDeliveryCoordinator(RdmDeliveryItem item, Long userId) {
        if (isAdmin(userId)) {
            return true;
        }
        if (userId == null) {
            return false;
        }
        if (userId.equals(item.getCoordinatorUserId())) {
            return true;
        }
        if (item.getProjectId() != null) {
            RdmProject project = projectMapper.selectById(item.getProjectId());
            if (project != null && isProjectCoordinator(project, userId)) {
                return true;
            }
        }
        return false;
    }

    /** 当前登录用户是否为系统管理员（仅当 userId 与登录人一致时才认，避免越权代判） */
    private boolean isAdmin(Long userId) {
        if (userId == null) {
            return false;
        }
        SysUser current = operatorResolver.currentUser();
        return current != null && current.getId() != null
                && current.getId().equals(userId) && operatorResolver.isAdmin(current);
    }

    private boolean isInProgress(String status) {
        return RdmConstants.PROJECT_IN_PROGRESS.equals(status)
                || RdmConstants.PROJECT_PARTIAL_DELIVERED.equals(status)
                || RdmConstants.PROJECT_ALL_DELIVERED.equals(status);
    }

    /** 需求是否已进入可拆分交付项的执行链路（受理后、关闭前） */
    private boolean isRequirementExecutable(String status) {
        if (status == null) {
            return false;
        }
        return RdmConstants.STATUS_ACCEPTED.equals(status)
                || RdmConstants.STATUS_PRD_DESIGNING.equals(status)
                || RdmConstants.STATUS_REVIEWING.equals(status)
                || RdmConstants.STATUS_REVIEW_PASSED.equals(status)
                || RdmConstants.STATUS_SCHEDULED.equals(status)
                || RdmConstants.STATUS_DESIGNING.equals(status)
                || RdmConstants.STATUS_DEVELOPING.equals(status)
                || RdmConstants.STATUS_INTEGRATION.equals(status)
                || RdmConstants.STATUS_TESTING.equals(status)
                || RdmConstants.STATUS_TEST_PASSED.equals(status)
                || RdmConstants.STATUS_UAT_PENDING.equals(status);
    }

    private static boolean eq(Long a, Long b) {
        return a != null && a.equals(b);
    }

    /* ==================== DTO ==================== */

    /**
     * 一个可执行动作。
     * <p>{@code code} 为动作标识（前端据此绑定处理器）；{@code label} 为繁中显示文案；
     * {@code tone} 为按钮语义色（default/primary/success/warning/danger），前端映射到设计令牌，
     * 不在服务端写死颜色值。
     */
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class AllowedAction {
        private String code;
        private String label;
        private String tone;
    }
}
