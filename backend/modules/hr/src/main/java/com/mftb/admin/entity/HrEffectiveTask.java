package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 待生效任务（轻量 outbox）：审批通过后到生效日之间的那段时间的执行凭据。
 * <p>
 * 方案 §7.2「批准后、到生效日前为待生效；到期才写入当前状态」与 §7.4「状态改变与待执行联动
 * 任务在同一事务写入数据库」。没有这张表就只有两种错选择：审批通过时立刻改写任职投影
 * （未来离职提前生效），或靠定时任务全表扫单据猜「哪些该生效了」。
 * <p>
 * 一条单据最多一个任务（{@code uk_effective_request}），因此重跑与重复回调都不会长出第二份待办；
 * 失败保留 {@code last_error} 与 {@code attempts}，由 HR 在单据页显式重试，不静默吞掉。
 * <p>
 * 本表不设逻辑删除列：它是执行留痕，删一行就再也回答不了「这张单子为什么到今天还没生效」；
 * 且带 deleted 的唯一键需额外生成列才能防重复，收益只有「能删」，不值得。
 */
@Data
@TableName("hr_effective_task")
public class HrEffectiveTask {

    /** 待执行（未到生效日，或执行失败等待重试） */
    public static final String STATUS_PENDING = "PENDING";
    /** 已执行完成 */
    public static final String STATUS_DONE = "DONE";
    /** 执行失败（保留在 PENDING 之外的终态，供界面显示与重试） */
    public static final String STATUS_FAILED = "FAILED";
    /** 已撤销（单据被撤回/驳回，不再执行） */
    public static final String STATUS_CANCELLED = "CANCELLED";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 hr_lifecycle_request.id（一条单据一个任务） */
    private Long requestId;

    /** 单据编号（日志与界面回显用，不参与判定） */
    private String reqNo;

    /** 单据类型（onboard/regular/transfer/dimission/renew...） */
    private String requestType;

    /** 目标员工；入职单在办理前没有 userId，故可空 */
    private Long userId;

    /** 生效日：到这天才算「到期」 */
    private LocalDate effectiveDate;

    /** PENDING/DONE/FAILED/CANCELLED */
    private String status;

    /** 已尝试次数（每次失败 +1，用于界面提示与排查，不做自动放弃） */
    private Integer attempts;

    /** 最近一次失败原因 */
    private String lastError;

    /** 实际执行完成时间 */
    private LocalDateTime executedAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
