package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmAcceptance;
import com.mftb.admin.entity.RdmAttachment;
import com.mftb.admin.entity.RdmComment;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmRequirementTarget;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 需求视图对象（列表行 + 详情共用一套字段，列表不填充子集合）
 */
@Data
public class RdmRequirementVO {

    private Long id;
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
    private String dispatcherName;
    private String distributeTime;
    private Long assigneePmUserId;
    private String pmName;
    private String pmEmpNo;
    private String acceptTime;
    private String promisedPrdDate;
    private String devOwnerName;
    private String iterationCode;
    private String planDevDate;
    private String planReleaseDate;
    private String actualReleaseDate;
    private String versionNo;
    private String currentHandler;

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
    private String acceptorName;
    private String acceptanceResult;
    private Integer acceptanceScore;
    private String acceptanceTime;

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
        vo.setAcceptorName(r.getAcceptorName());
        vo.setAcceptanceResult(r.getAcceptanceResult());
        vo.setAcceptanceScore(r.getAcceptanceScore());
        vo.setAcceptanceTime(DateTimeUtils.format(r.getAcceptanceTime()));
        vo.setUpdatedAt(DateTimeUtils.format(r.getUpdatedAt()));
        if (r.getStatusEnterTime() != null) {
            vo.setStayHours(Duration.between(r.getStatusEnterTime(), LocalDateTime.now()).toHours());
        }
        return vo;
    }
}
