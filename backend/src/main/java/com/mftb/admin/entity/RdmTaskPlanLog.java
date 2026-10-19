package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 任务排期变更审计（阶段二：甘特图调期留痕）。
 * <p>只追加、不更新、不软删：排期是被多人协调的承诺，改期必须可追溯「谁在什么时候
 * 把哪条任务从什么时间改到什么时间」；普通业务不得修改或删除审计行。
 */
@Data
@TableName("rdm_task_plan_log")
public class RdmTaskPlanLog {

    @TableId
    private Long id;

    /** 任务ID */
    private Long taskId;

    /** 任务编号快照 */
    private String taskNo;

    /** 需求ID（冗余，便于按需求追溯） */
    private Long reqId;

    /** 操作人 */
    private Long userId;

    /** 操作人姓名快照 */
    private String userName;

    private LocalDate oldStartDate;
    private LocalDate oldFinishDate;
    private LocalDate newStartDate;
    private LocalDate newFinishDate;

    /** 变更前/后乐观锁版本 */
    private Integer oldVersion;
    private Integer newVersion;

    /** 幂等请求标识（与 rdm_idempotent_log 对应，便于对账重试） */
    private String clientRequestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
