package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmAcceptance;
import com.mftb.admin.entity.RdmAttachment;
import com.mftb.admin.entity.RdmComment;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmRequirementTarget;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 需求视图对象（列表行 + 详情共用一套字段，列表不填充子集合）
 */
@Data
public class RdmRequirementVO {

    private Long id;
    /**
     * 需求编号，<b>允许为 null</b>（需求提交/需求管理拆分 · 批次1）。
     * <p>只在首次准入成功（审批全部通过或服务端免审批命中）时生成；草稿/待审批/审批驳回
     * 阶段的列表行与详情均为 null，前端必须渲染「尚未生成」而不是空字符串或 0。
     * <p>治理侧（scope=all/todo 等已准入口径）的每一行都保证有号；提交侧不保证。
     */
    private String reqNo;
    private String title;
    private String reqType;
    private String priority;
    private String complexity;
    private String status;

    /** 所属阶段（前端进度条折叠依据，来自 rdm_status_def.stage） */
    private String stage;

    /* ── 提出人 ── */
    private Long submitterUserId;
    private String submitterName;
    private String submitterEmpNo;
    private Long submitDeptId;
    private String submitDeptName;
    private String submitTime;

    /* ── 流转责任链 ── */
    private String intakeFlowNo;
    private Integer needApproval;
    /** 当前准入轮次（与 rdm_intake_round.round_no 对齐） */
    private Integer intakeRoundNo;
    /** 本轮准入裁决模式: FORCE_APPROVE/APPROVE/EXEMPT */
    private String intakeMode;
    /** 命中策略名称与版本（免审也要能解释「凭什么是免审」） */
    private String intakePolicyName;
    private String intakePolicyVersion;
    /** 命中链路（逐行展示，配置页与详情页共用） */
    private java.util.List<String> intakeExplain;
    private String dispatcherName;
    private String distributeTime;
    private Long assigneePmUserId;
    private String pmName;
    private String pmEmpNo;
    private String acceptTime;
    private String promisedPrdDate;
    private String devOwnerName;
    private String iterationCode;
    /**
     * 所属迭代名称（列表/详情统一由服务端联表 rdm_iteration 回填）。
     * <p>只有编码时前端只能靠迭代下拉字典拼名称，而字典受 200 条上限约束，
     * 历史迭代会退化成裸编码；名称必须由服务端给出。
     */
    private String iterationName;
    private String planDevDate;
    private String planReleaseDate;
    private String actualReleaseDate;
    private String versionNo;
    private String currentHandler;

    /**
     * 當前處理人聚合：該需求下未完成任務（todo/doing/blocked）的負責人，按 user 去重。
     * <p>多人並行時全部返回，列表自行折疊；無未完成任務時為空，前端回退展示 {@link #currentHandler} 的流程推演值。
     */
    private java.util.List<HandlerPerson> handlers;

    /* ── 状态与风险 ── */
    private Integer progress;
    private Boolean blockedFlag;
    private String blockedReason;
    private Boolean overdueFlag;
    private String onHoldUntil;
    private String rejectReason;
    private Integer rejectCount;
    private Integer reopenCount;
    private Integer reworkCount;
    private Integer changeCount;

    /** 衍生来源需求编号（M3：验收遗留事项自动转出的后续需求，详情页要能看到从哪来） */
    private String parentReqNo;

    /** 当前状态已停留小时数（由 status_enter_time 实时计算） */
    private Long stayHours;

    /* ── 验收 ── */
    private Long acceptorUserId;
    private String acceptorName;
    private String acceptanceResult;
    private Integer acceptanceScore;
    private String acceptanceTime;

    /**
     * 提交时指定的意向产品经理 ID。
     * <p>必须随详情下发：草稿续编要把「指定产品经理」回填到表单，
     * 只回姓名不回 id 的话，用户保存草稿时会被 update 逻辑当成「改回统一分配」而清掉意向人。
     */
    private Long intentPmUserId;

    /**
     * 流程版本（阶段 4）：1=历史记录（无五节点/定稿快照/工时明细），2=新链路。
     * <p>界面靠它区分“真的没做”与“那个年代还没这个要求”，避免把存量需求误判为不合格。
     */
    private Integer flowVersion;

    /* ── V3 分层链路（Batch 2 / Phase 2） ── */
    /** 所属项目ID */
    private Long projectId;
    /** 所属项目名称（详情联表 rdm_project 取；归属体系改造后项目是一等属性，不再只回 id 让前端拼「項目 #id」） */
    private String projectName;
    /** 需求种类：aggregate（聚合）/ execution（执行） */
    private String requirementKind;
    /** 结构父需求ID（主子关系） */
    private Long structureParentReqId;
    /** 结构子需求（仅聚合需求详情填充；执行需求为空列表） */
    private List<RdmRequirementStructureService.RequirementTreeNode> structureChildren = new ArrayList<>();
    /** 结构父需求信息（有结构父时填充，供详情页展示祖先） */
    private RdmRequirementStructureService.RequirementTreeNode structureParent;

    /* ── V3 交付進度投影（只讀） ── */
    /**
     * 由交付項事實推導的階段，取值與前端九段階段條同詞彙：
     * design / review / dev / test / uat / release。
     * <p><b>只讀投影</b>：不寫 rdm_requirement.status、不參與 allowedActions。
     * V3 需求受理後狀態按設計停住，進度只能看交付項，故另發一組展示字段。
     */
    private String deliveryStage;
    /** 交付項總數（V3 詳情填充） */
    private Integer deliveryItemCount;
    /** 已完成交付項數（status=done） */
    private Integer deliveryDoneCount;
    /** 各交付項狀態分佈（status → 件數），供詳情展開核對 */
    private Map<String, Integer> deliveryItemStatusCounts;
    /**
     * 需求管理类可执行动作（来自 {@link RdmAllowedActionsService#computeRequirementActions}）。
     * <p>与 {@link #allowedActions}（基于流转规则表的流转动作）互补：前者是「按角色可发起的管理操作」，
     * 后者是「当前状态配置允许的流转」。命名区分避免与既有流转动作字段冲突。
     */
    private List<RdmAllowedActionsService.AllowedAction> requirementActions = new ArrayList<>();

    private String updatedAt;

    /* ── 详情字段 ── */
    private String description;
    private String expectResult;
    private String businessValue;
    private String sourceChannel;
    private List<TargetRef> targets = new ArrayList<>();
    private List<RoleMember> roles = new ArrayList<>();
    private List<TimelineNode> timeline = new ArrayList<>();
    private List<CommentItem> comments = new ArrayList<>();
    private List<AttachmentItem> attachments = new ArrayList<>();
    private List<ApprovalNode> approvalNodes = new ArrayList<>();
    private AcceptanceInfo acceptance;
    private SlaInfo sla;

    /** 当前登录人在本需求上的角色编码（驱动详情页操作区，多个用首个） */
    private String myRole;

    /** 当前登录人可执行的流转动作 */
    private List<AllowedAction> allowedActions = new ArrayList<>();

    /** 處理中人員：一份未完成任務的負責人快照（帶工號，供列表展示與按人篩選） */
    @Data
    public static class HandlerPerson {
        private Long userId;
        private String name;
        private String empNo;
    }

    /** 需求关联对象 */
    @Data
    public static class TargetRef {
        private String anchorType;
        private String systemCode;
        private String systemName;
        private String menuKey;
        private String menuName;
        private String pagePath;
        private String anchorName;
        private String anchorDesc;
        private String screenshotUrl;

        public static TargetRef from(RdmRequirementTarget t) {
            TargetRef ref = new TargetRef();
            ref.setAnchorType(t.getAnchorType());
            ref.setSystemCode(t.getSystemCode());
            ref.setSystemName(t.getSystemName());
            ref.setMenuKey(t.getMenuKey());
            ref.setMenuName(t.getMenuName());
            ref.setPagePath(t.getPagePath());
            ref.setAnchorName(t.getAnchorName());
            ref.setAnchorDesc(t.getAnchorDesc());
            ref.setScreenshotUrl(t.getScreenshotPath());
            return ref;
        }
    }

    /** 参与角色 */
    @Data
    public static class RoleMember {
        private Long userId;
        private String empNo;
        private String name;
        private String roleCode;
        private String joinTime;

        public static RoleMember from(RdmRequirementRole r) {
            RoleMember m = new RoleMember();
            m.setUserId(r.getUserId());
            m.setEmpNo(r.getEmpNo());
            m.setName(r.getEmpName());
            m.setRoleCode(r.getRoleCode());
            m.setJoinTime(DateTimeUtils.format(r.getJoinTime()));
            return m;
        }
    }

    /** 时间轴节点 */
    @Data
    public static class TimelineNode {
        private Long id;
        private String status;
        private String statusLabel;
        private String actionCode;
        private String operatorName;
        private String operatorRole;
        private String time;
        private String remark;
        /** 该状态停留小时数（离开时回填的 duration_seconds 换算） */
        private Long durationHours;

        public static TimelineNode from(RdmStatusLog log) {
            TimelineNode node = new TimelineNode();
            node.setId(log.getId());
            node.setStatus(log.getToStatus());
            node.setActionCode(log.getActionCode());
            node.setOperatorName(log.getOperatorName());
            node.setOperatorRole(log.getOperatorRole());
            node.setTime(DateTimeUtils.format(log.getEnterTime()));
            node.setRemark(log.getRemark());
            if (log.getDurationSeconds() != null) {
                node.setDurationHours(Duration.ofSeconds(log.getDurationSeconds()).toHours());
            } else if (log.getEnterTime() != null) {
                node.setDurationHours(Duration.between(log.getEnterTime(), LocalDateTime.now()).toHours());
            }
            return node;
        }
    }

    /** 沟通记录 */
    @Data
    public static class CommentItem {
        private Long id;
        private String content;
        private String authorName;
        private String authorRole;
        private String createdAt;
        private Boolean internal;

        public static CommentItem from(RdmComment c, String operatorName) {
            CommentItem item = new CommentItem();
            item.setId(c.getId());
            item.setContent(c.getContent());
            item.setAuthorName(c.getCreatedBy() != null ? c.getCreatedBy() : operatorName);
            item.setCreatedAt(DateTimeUtils.format(c.getCreatedAt()));
            item.setInternal(c.getInternalFlag() != null && c.getInternalFlag() == 1);
            return item;
        }
    }

    /** 附件 */
    @Data
    public static class AttachmentItem {
        private Long id;
        private String fileName;
        private String fileUrl;
        private String fileType;
        private Long fileSize;
        private String uploaderName;
        private String createdAt;

        public static AttachmentItem from(RdmAttachment a) {
            AttachmentItem item = new AttachmentItem();
            item.setId(a.getId());
            item.setFileName(a.getFileName());
            item.setFileUrl(a.getStoragePath());
            item.setFileType(a.getFileType());
            item.setFileSize(a.getFileSize());
            item.setUploaderName(a.getUploaderName());
            item.setCreatedAt(DateTimeUtils.format(a.getCreatedAt()));
            return item;
        }
    }

    /** 准入审批节点（来源 OA 引擎） */
    @Data
    public static class ApprovalNode {
        private String nodeName;
        private String approverName;
        private String status;
        private String time;
        private String comment;
    }

    /** 验收信息 */
    @Data
    public static class AcceptanceInfo {
        private String acceptNo;
        private String result;
        private Integer score;
        private Integer caseTotal;
        private Integer casePass;
        private String issues;
        private String acceptorName;
        private String acceptTime;
        private String opinion;

        public static AcceptanceInfo from(RdmAcceptance a) {
            if (a == null) {
                return null;
            }
            AcceptanceInfo info = new AcceptanceInfo();
            info.setAcceptNo(a.getAcceptNo());
            info.setResult(a.getResult());
            info.setScore(a.getScore());
            info.setCaseTotal(a.getCaseTotal());
            info.setCasePass(a.getCasePass());
            info.setIssues(a.getIssues());
            info.setAcceptorName(a.getAcceptorName());
            info.setOpinion(a.getOpinion());
            info.setAcceptTime(DateTimeUtils.format(a.getAcceptTime()));
            return info;
        }
    }

    /** SLA 时效 */
    @Data
    public static class SlaInfo {
        private String statusCode;
        private Integer slaHours;
        private Integer warnHours;
        /** 剩余小时数，负值表示已逾期 */
        private Long remainHours;
        private Boolean overdue;
        private String escalateRole;
    }

    /** 可执行流转动作 */
    @Data
    public static class AllowedAction {
        private String actionCode;
        private String actionName;
        private String toStatus;
        private List<String> requiredFields = new ArrayList<>();
    }

    /**
     * 由实体构造列表视图。
     * <p>子集合默认空列表，详情接口再单独填充。
     * <p>{@code reqNo} 原样透传，允许为 null（准入前需求没有正式编号），
     * 不得在这里填占位串或回落到内部 id / 准入单号——那会把「尚未生成」伪造成已有号。
     *
     * @param stageOf 状态→阶段映射（来自 rdm_status_def）
     */
    public static RdmRequirementVO from(RdmRequirement r, java.util.Map<String, String> stageOf) {
        RdmRequirementVO vo = new RdmRequirementVO();
        vo.setId(r.getId());
        vo.setReqNo(r.getReqNo());
        vo.setTitle(r.getTitle());
        vo.setReqType(r.getReqType());
        vo.setPriority(r.getPriority());
        vo.setComplexity(r.getComplexity());
        vo.setStatus(r.getStatus());
        if (stageOf != null) {
            vo.setStage(stageOf.get(r.getStatus()));
        }
        vo.setSubmitterUserId(r.getSubmitterUserId());
        vo.setSubmitterName(r.getSubmitterName());
        vo.setSubmitterEmpNo(r.getSubmitterEmpNo());
        vo.setSubmitDeptId(r.getSubmitDeptId());
        vo.setSubmitDeptName(r.getSubmitDeptName());
        vo.setSubmitTime(DateTimeUtils.format(r.getSubmitTime()));
        vo.setIntakeFlowNo(r.getIntakeFlowNo());
        vo.setNeedApproval(r.getNeedApproval());
        vo.setIntakeRoundNo(r.getIntakeRoundNo());
        vo.setIntakeMode(r.getIntakeMode());
        vo.setIntakePolicyName(r.getIntakePolicyName());
        vo.setIntakePolicyVersion(r.getIntakePolicyVersion());
        vo.setIntakeExplain(splitLines(r.getIntakeExplain()));
        vo.setDispatcherName(r.getDispatcherName());
        vo.setDistributeTime(DateTimeUtils.format(r.getDistributeTime()));
        vo.setAssigneePmUserId(r.getAssigneePmUserId());
        vo.setPmName(r.getAssigneePmName());
        vo.setPmEmpNo(r.getAssigneePmEmpNo());
        vo.setAcceptTime(DateTimeUtils.format(r.getAcceptTime()));
        vo.setPromisedPrdDate(DateTimeUtils.format(r.getPromisedPrdDate()));
        vo.setDevOwnerName(r.getDevOwnerName());
        vo.setIterationCode(r.getIterationCode());
        vo.setPlanDevDate(DateTimeUtils.format(r.getPlanDevDate()));
        vo.setPlanReleaseDate(DateTimeUtils.format(r.getPlanReleaseDate()));
        vo.setActualReleaseDate(DateTimeUtils.format(r.getActualReleaseDate()));
        vo.setVersionNo(r.getVersionNo());
        vo.setCurrentHandler(r.getCurrentHandlerName());
        vo.setProgress(r.getProgress());
        vo.setBlockedFlag(r.getBlockedFlag() != null && r.getBlockedFlag() == 1);
        vo.setBlockedReason(r.getBlockedReason());
        vo.setOverdueFlag(r.getOverdueFlag() != null && r.getOverdueFlag() == 1);
        vo.setOnHoldUntil(DateTimeUtils.format(r.getOnHoldUntil()));
        vo.setRejectReason(r.getRejectReason());
        vo.setRejectCount(r.getRejectCount());
        vo.setReopenCount(r.getReopenCount());
        vo.setReworkCount(r.getReworkCount());
        vo.setParentReqNo(r.getParentReqNo());
        vo.setChangeCount(r.getChangeCount());
        vo.setAcceptorUserId(r.getAcceptorUserId());
        vo.setAcceptorName(r.getAcceptorName());
        vo.setIntentPmUserId(r.getIntentPmUserId());
        vo.setAcceptanceResult(r.getAcceptanceResult());
        vo.setFlowVersion(r.getFlowVersion() == null ? 1 : r.getFlowVersion());
        vo.setProjectId(r.getProjectId());
        vo.setRequirementKind(r.getRequirementKind());
        vo.setStructureParentReqId(r.getStructureParentReqId());
        vo.setAcceptanceScore(r.getAcceptanceScore());
        vo.setAcceptanceTime(DateTimeUtils.format(r.getAcceptanceTime()));
        vo.setUpdatedAt(DateTimeUtils.format(r.getUpdatedAt()));
        if (r.getStatusEnterTime() != null) {
            vo.setStayHours(Duration.between(r.getStatusEnterTime(), LocalDateTime.now()).toHours());
        }
        return vo;
    }

    /** 将准入命中链路拆成可逐行展示的列表；空值归一为空列表，前端不用再判 null */
    private static java.util.List<String> splitLines(String text) {
        if (text == null || text.isBlank()) {
            return java.util.List.of();
        }
        return java.util.Arrays.stream(text.split("\n"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
