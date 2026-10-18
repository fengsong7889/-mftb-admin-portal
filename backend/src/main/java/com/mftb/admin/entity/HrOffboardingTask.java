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
 * 离职联动任务（跨模块协作的轻量 outbox，方案 §7.4）。
 * <p>
 * 离职办理本身只做三件人事事实：写离职任职记录、停账号、登记联动任务。资产归还和 OA 待办
 * 改派都发生在别的模块的业务动作里，不能被离职事务同步完成（接收人可能还没定、EAM 可能拒绝），
 * 所以先落库成可追踪的任务，再由执行器/人工重试推进 —— 「状态改变与待执行联动任务在同一事务写入」。
 * <p>
 * 与 {@link HrEffectiveTask} 的分工：那张表回答「这张单据到生效日了没」，本表回答
 * 「离职后还有哪些跨模块动作没做完」。两者不能合成一张：一个离职单会产生多个不同类型的联动任务，
 * 而生效任务必须是一单一行。
 * <p>
 * 不带 deleted 列（同 {@code hr_effective_task}）：它是执行留痕，软删只会让「这个动作到底做没做」失去答案。
 */
@Data
@TableName("hr_offboarding_task")
public class HrOffboardingTask {

    // ==================== 任务类型 ====================

    /** EAM 资产交接：把离职人名下在册资产挂到接收人的交接单 */
    public static final String TYPE_ASSET_HANDOVER = "EAM_ASSET_HANDOVER";
    /** OA 待办改派：把离职人尚未处理的待审批节点转交给接收人 */
    public static final String TYPE_OA_TODO_TRANSFER = "OA_TODO_TRANSFER";

    /** 全部任务类型；落库 CHECK 与本集合同源 */
    public static final java.util.Set<String> ALL_TYPES = java.util.Set.of(TYPE_ASSET_HANDOVER, TYPE_OA_TODO_TRANSFER);

    // ==================== 执行状态 ====================

    /** 待执行（含「等待接收人被指定」） */
    public static final String STATUS_PENDING = "PENDING";
    /** 执行中 */
    public static final String STATUS_RUNNING = "RUNNING";
    /** 已完成 */
    public static final String STATUS_DONE = "DONE";
    /** 无需执行（例如本人名下没有在册资产）：终态，与失败区分开，避免被当成待办反复重试 */
    public static final String STATUS_SKIPPED = "SKIPPED";
    /** 执行失败：可人工重试 */
    public static final String STATUS_FAILED = "FAILED";

    /** 全部状态；落库 CHECK 与本集合同源 */
    public static final java.util.Set<String> ALL_STATUSES = java.util.Set.of(
            STATUS_PENDING, STATUS_RUNNING, STATUS_DONE, STATUS_SKIPPED, STATUS_FAILED);

    /** 终态：不再被定时任务拾取 */
    public static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of(STATUS_DONE, STATUS_SKIPPED);

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联离职单据 */
    private Long requestId;

    /** 单据编号快照（审计与界面跳转用） */
    private String reqNo;

    /** 离职员工 id */
    private Long userId;

    /** 离职员工工号快照 */
    private String empNo;

    /** 任务类型 */
    private String taskType;

    /** 执行状态 */
    private String status;

    /** 已尝试次数 */
    private Integer attempts;

    /** 最近一次失败原因（含「还没指定交接接收人」这类等待态的可读说明） */
    private String lastError;

    /** 执行结果摘要（交接了多少项资产 / 改派了几个待办节点） */
    private String resultSummary;

    /** 跨模块产物引用：EAM 交接单号，或 OA 被改派的任务 id 列表 */
    private String targetRef;

    /** 计划执行日（离职生效日）；早于/等于今天才到期 */
    private LocalDate effectiveDate;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
