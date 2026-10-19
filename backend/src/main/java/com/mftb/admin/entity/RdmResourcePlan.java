package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 个人工作计划实体（阶段 B-2.5：跨来源负载工时载体）。
 *
 * <p>为什么需要计划层：B-1 团队负载里产品需求、测试批次「只有件数、无个人工时」被如实标为
 * data_incomplete，无法参与参考负载率；研发/设计任务虽有计划工时，但「负责人确认的剩余工时」
 * 无处沉淀。本表提供「个人 × 来源 × 岗位阶段」的计划/剩余工时载体。
 *
 * <p>避免双真值：来源为 {@code rdm_work_task} 时，负责人/计划工时/起止日期以原任务为唯一真值，
 * 本表仅补 {@code remainingHours}，且 {@code workTaskId} 设 UNIQUE（一份任务最多一条计划、不重复计时）；
 * 来源为需求/批次/协调（无原任务工时）时，本表才承载 planHours/日期。
 *
 * <p>{@code version} 为乐观锁版本，供计划服务后续维护剩余工时/排期时的并发保护使用。
 */
@Data
@TableName("rdm_resource_plan")
public class RdmResourcePlan {

    @TableId
    private Long id;

    /** 承担人 sys_user.id */
    private Long userId;

    /** 来源类型：work_task/requirement/test_batch/project/coordination */
    private String sourceType;

    /** 来源单据主键 */
    private Long sourceId;

    /** 来源为执行任务时的 rdm_work_task.id；UNIQUE 防一份任务被重复计时（非任务来源为空） */
    private Long workTaskId;

    /** 岗位/阶段：product/dev/designer/qa/coord */
    private String roleCode;

    /** 计划工时（来源为任务时取原任务，不在本表重复存） */
    private BigDecimal planHours;

    /** 负责人确认的剩余工时；新计划初值 = 计划工时 */
    private BigDecimal remainingHours;

    /** 计划开始 */
    private LocalDate planStartDate;

    /** 计划完成 */
    private LocalDate planEndDate;

    /** 状态：active/done/cancelled */
    private String status;

    /** 剩余工时确认人快照 */
    private String confirmedBy;

    /** 剩余工时确认时间 */
    private LocalDateTime confirmedAt;

    /** 乐观锁版本 */
    private Integer version;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
