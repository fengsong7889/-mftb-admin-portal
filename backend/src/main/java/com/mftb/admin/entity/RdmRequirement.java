package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 业务需求主表实体（需求全生命周期单据）
 */
@Data
@TableName("rdm_requirement")
public class RdmRequirement {

    @TableId
    private Long id;

    /** 需求编号 XQ+YYYYMMDD+4位 */
    private String reqNo;

    /** 需求标题 */
    private String title;

    /** 需求类型 */
    private String reqType;

    /** 优先级: P0/P1/P2/P3 */
    private String priority;

    /** 规模: SIMPLE/MEDIUM/COMPLEX/HUGE */
    private String complexity;

    /** 现状与痛点 */
    private String description;

    /** 期望结果（验收检查项来源） */
    private String expectResult;

    /** 业务价值 */
    private String businessValue;

    /** 业务期望完成日期 */
    private LocalDate expectDate;

    /** 提出人 sys_user.id */
    private Long submitterUserId;

    /** 提出人工号快照 */
    private String submitterEmpNo;

    /** 提出人姓名快照 */
    private String submitterName;

    /** 提出部门ID快照 */
    private Long submitDeptId;

    /** 提出部门名称快照 */
    private String submitDeptName;

    /** 提交时间（草稿为空） */
    private LocalDateTime submitTime;

    /** 是否需要准入审批: 1=需要 0=免审（服务端准入策略裁决结果，不取客户端参数） */
    private Integer needApproval;

    /** 关联 OA 准入流程编号（当前轮次的单号；旧轮单号留在 rdm_intake_round） */
    private String intakeFlowNo;

    /** 当前准入轮次序号（空=未发起过）；回调靠它认出「迟到的旧轮结果」 */
    private Integer intakeRoundNo;

    /** 本轮命中的准入策略ID（空=内置默认策略） */
    private Long intakePolicyId;

    /** 命中策略名称快照 */
    private String intakePolicyName;

    /** 命中策略版本快照：规则后来改了也不影响这一轮的结论 */
    private String intakePolicyVersion;

    /** 本轮准入裁决: FORCE_APPROVE/APPROVE/EXEMPT */
    private String intakeMode;

    /** 命中链路说明（为什么免审/为什么要审，事后审计用） */
    private String intakeExplain;

    /** 分发人（技术负责人）ID */
    private Long dispatcherUserId;

    /** 分发人姓名 */
    private String dispatcherName;

    /** 分配时间 */
    private LocalDateTime distributeTime;

    /** 产品经理 sys_user.id */
    private Long assigneePmUserId;

    /** 产品经理工号快照 */
    private String assigneePmEmpNo;

    /** 产品经理姓名快照 */
    private String assigneePmName;

    /** 提交时指定的产品经理ID（意向）：需审批时先存意向，审批通过后再生效为受理人 */
    private Long intentPmUserId;

    /** 指定产品经理姓名快照 */
    private String intentPmName;

    /** 产品受理时间 */
    private LocalDateTime acceptTime;

    /** 承诺出 PRD 日期 */
    private LocalDate promisedPrdDate;

    /** 研发负责人ID */
    private Long devOwnerUserId;

    /** 研发负责人姓名 */
    private String devOwnerName;

    /** 迭代/版本排期标识 */
    private String iterationCode;

    /** 计划开发完成日期 */
    private LocalDate planDevDate;

    /** 计划上线日期 */
    private LocalDate planReleaseDate;

    /** 实际上线日期 */
    private LocalDate actualReleaseDate;

    /** 关联发布版本号 sys_version_history.version_no */
    private String versionNo;

    /** 当前状态 */
    private String status;

    /** 进入当前状态时间 */
    private LocalDateTime statusEnterTime;

    /** 研发进度百分比 */
    private Integer progress;

    /** 是否阻塞: 1=阻塞 */
    private Integer blockedFlag;

    /** 阻塞原因 */
    private String blockedReason;

    /** 是否逾期 */
    private Integer overdueFlag;

    /**
     * 流程版本（阶段 4）：1=历史记录（五节点计划/PRD 定稿快照/工时明细之前建的），2=新链路。
     * <p>存在理由：拿新口径去卡存量需求，会把历史记录全算成「未做验收准备」，
     * 与真实质量无关；发布闸门的检查项必须按版本区分要求。
     */
    private Integer flowVersion;

    /** 挂起复审日期 */
    private LocalDate onHoldUntil;

    /** 最近一次驳回理由 */
    private String rejectReason;

    /** 累计驳回次数 */
    private Integer rejectCount;

    /** 重开次数 */
    private Integer reopenCount;

    /** 验收退回返工次数 */
    private Integer reworkCount;

    /** 需求变更次数 */
    private Integer changeCount;

    /** 业务验收人ID */
    private Long acceptorUserId;

    /** 业务验收人姓名 */
    private String acceptorName;

    /** 验收结论: pass/conditional/fail */
    private String acceptanceResult;

    /** 交付满意度 1-5 */
    private Integer acceptanceScore;

    /** 验收时间 */
    private LocalDateTime acceptanceTime;

    /** 当前处理人（列表/待办展示冗余） */
    private String currentHandlerName;

    /** 来源渠道: WEB/MOBILE/DINGTALK/AI */
    private String sourceChannel;

    /**
     * 衍生来源需求ID（M3：验收有条件通过时自动转出的后续需求）。
     * <p>不复用 sourceChannel：那列表达「从哪个端提交」，与「由哪条需求衍生」是两回事。
     */
    private Long parentReqId;

    /** 衍生来源需求编号快照 */
    private String parentReqNo;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
