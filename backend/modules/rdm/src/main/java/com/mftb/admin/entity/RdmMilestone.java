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
 * RDM 需求里程碑实体（阶段 3：五节点的计划、基线、预测与实际）。
 * <p>四套日期各自存在的理由：只有「基线」被批准后不再随改期覆盖，才能回答
 * 「按时率相对哪条承诺算」。用 forecast_date 覆盖 baseline_date 等于自己给自己改考卷。
 */
@Data
@TableName("rdm_milestone")
public class RdmMilestone {

    /** 节点：需求/PRD 评审 */
    public static final String CODE_PRD_REVIEW = "PRD_REVIEW";
    /** 节点：设计完成 */
    public static final String CODE_DESIGN_DONE = "DESIGN_DONE";
    /** 节点：研发启动 */
    public static final String CODE_DEV_START = "DEV_START";
    /** 节点：开发完成 */
    public static final String CODE_DEV_DONE = "DEV_DONE";
    /** 节点：上线交付 */
    public static final String CODE_RELEASE = "RELEASE";

    /** 状态：待办 */
    public static final String STATUS_PENDING = "pending";
    /** 状态：已完成 */
    public static final String STATUS_DONE = "done";
    /** 状态：本需求不适用（必须写原因） */
    public static final String STATUS_NOT_APPLICABLE = "not_applicable";

    @TableId
    private Long id;

    /** 业务需求ID */
    private Long reqId;

    /** 节点编码 */
    private String code;

    /** 节点名称快照 */
    private String name;

    /** 节点负责人 */
    private Long ownerUserId;

    /** 负责人姓名快照 */
    private String ownerName;

    /** 初步计划（PM 受理时填） */
    private LocalDate preliminaryDate;

    /** 已批准基线（评审/估时后冻结） */
    private LocalDate baselineDate;

    /** 当前预测（改期只动这列） */
    private LocalDate forecastDate;

    /** 实际完成 */
    private LocalDate actualDate;

    /** pending/done/not_applicable */
    private String status = STATUS_PENDING;

    /** 不适用原因 */
    private String naReason;

    /** 节点顺序 */
    private Integer sortOrder;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
