package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 任务进度变更审计（甘特图拖拽 / 交付工作台上报）。
 * <p>只追加、不更新、不软删：进度是绩效与验收的原始事实，必须能回答
 * 「谁在什么时候把哪条任务从多少改到多少、为什么」。审计行不得被业务修改或删除。
 *
 * <p>与 {@code rdm_task_plan_log} 的分工：那张表记「计划起止日期」的排期语义；
 * 本表记「进度/状态」的事实语义，混表会让排期追溯被进度噪音淹没。
 */
@Data
@TableName("rdm_task_progress_log")
public class RdmTaskProgressLog {

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

    private Integer oldProgress;
    private Integer newProgress;
    private String oldStatus;
    private String newStatus;

    /** 说明：进度备注或完成任务的交付说明 */
    private String remark;

    /** 客户端请求标识（便于对账重试） */
    private String clientRequestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
