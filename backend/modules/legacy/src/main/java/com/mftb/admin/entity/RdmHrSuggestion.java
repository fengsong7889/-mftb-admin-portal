package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * RDM HR 绩效建议实体（阶段 6：积分到考核之间的人工复核环节）。
 * <p>状态只单向流转 draft → confirmed → pushed，pushed 之后只能 withdraw；
 * 已推送的建议不允许原地改分，那等于绕过 HR 校准通道改考核。
 */
@Data
@TableName("rdm_hr_suggestion")
public class RdmHrSuggestion {

    /** 待复核 */
    public static final String STATUS_DRAFT = "draft";
    /** 已确认（可推送） */
    public static final String STATUS_CONFIRMED = "confirmed";
    /** 已推送到考核单 */
    public static final String STATUS_PUSHED = "pushed";
    /** 已撤回（清空考核单建议值） */
    public static final String STATUS_WITHDRAWN = "withdrawn";

    @TableId
    private Long id;

    /** 绩效周期编码 */
    private String periodCode;

    /** 被建议人 */
    private Long userId;

    /** 工号快照（HR 按工号匹配，改不了历史） */
    private String empNo;

    /** 姓名快照 */
    private String userName;

    /** 部门ID快照 */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 本周期贡献分合计 */
    private BigDecimal totalScore;

    /** 依据的积分流水条数（0 说明没有可追溯明细） */
    private Integer recordCount;

    /** 交付需求数 */
    private Integer deliveredCount;

    /** 上线后业务验收平均分 */
    private BigDecimal avgAcceptanceScore;

    /** 一次通过的需求数 */
    private Integer firstPassCount;

    /** 所属部门预算占用百分比 */
    private BigDecimal budgetUsedRatio;

    /** 是否超出预算（1=超出，需 PMO 复核说明） */
    private Integer overBudget;

    /** 分项依据快照（供申诉复算） */
    private String breakdownJson;

    /** 出分时生效的规则版本 */
    private Integer ruleVersion;

    /** draft/confirmed/pushed/withdrawn */
    private String status = STATUS_DRAFT;

    /** 复核人 */
    private Long reviewerUserId;

    /** 复核人姓名快照 */
    private String reviewerName;

    /** 复核时间 */
    private LocalDateTime reviewTime;

    /** 复核意见（驳回或超限说明必填） */
    private String reviewRemark;

    /** 推送建议值到绩效的时间 */
    private LocalDateTime pushedAt;

    /** 本次聚合时间 */
    private LocalDateTime generatedAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
