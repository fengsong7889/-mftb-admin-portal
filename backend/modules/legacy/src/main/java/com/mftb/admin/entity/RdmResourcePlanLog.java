package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 个人计划调整/改派审计实体（阶段 B-2.5：负载分派的结构化不可变审计）。
 *
 * <p>只追加、不更新、不软删：分派与剩余工时调整是可追溯承诺，必须留下
 * 「谁在什么时候把谁的哪条计划从什么改到什么、原因是什么」；普通业务不得修改或删除审计行。
 *
 * <p>只存摘要（{@code oldValue}/{@code newValue}：工时/剩余/负责人），不存敏感业务正文。
 *
 * <p>与 v3.8 {@code rdm_task_plan_log} 的分工：那张表记「甘特拖拽改任务起止日期」的排期审计（日期语义）；
 * 本表记「个人工作计划的创建/改派/剩余工时调整」审计（负载分派语义），二者不重叠。
 */
@Data
@TableName("rdm_resource_plan_log")
public class RdmResourcePlanLog {

    @TableId
    private Long id;

    /** 关联 rdm_resource_plan.id（建计划动作时可为空） */
    private Long planId;

    /** 被计划承担人 sys_user.id */
    private Long userId;

    /** 来源类型 */
    private String sourceType;

    /** 来源单据主键 */
    private Long sourceId;

    /** 动作：create/update/reassign/dispatch/cancel */
    private String action;

    /** 操作人 sys_user.id */
    private Long operatorId;

    /** 操作人姓名快照 */
    private String operatorName;

    /** 变更前摘要（工时/剩余/负责人），不存敏感业务正文 */
    private String oldValue;

    /** 变更后摘要 */
    private String newValue;

    /** 改派/调整原因 */
    private String reason;

    /** 幂等请求 ID（与 rdm_idempotent_log 对账） */
    private String clientRequestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
