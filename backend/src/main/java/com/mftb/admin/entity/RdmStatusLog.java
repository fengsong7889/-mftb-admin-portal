package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 状态流转流水实体。
 * <p>需求交付周期、阶段瓶颈、逾期判定的唯一真值来源：
 * 每条记录在状态离开时回填 {@code leaveTime} 与 {@code durationSeconds}，禁止事后补算。
 */
@Data
@TableName("rdm_status_log")
public class RdmStatusLog {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 变更前状态 */
    private String fromStatus;

    /** 变更后状态 */
    private String toStatus;

    /** 触发动作 */
    private String actionCode;

    /** 操作人ID */
    private Long operatorUserId;

    /** 操作人姓名快照 */
    private String operatorName;

    /** 操作人当时角色 */
    private String operatorRole;

    /** 说明/理由 */
    private String remark;

    /** 进入 to_status 时间 */
    private LocalDateTime enterTime;

    /** 离开 to_status 时间 */
    private LocalDateTime leaveTime;

    /** 在 to_status 停留秒数 */
    private Long durationSeconds;

    /** 该状态是否逾期离开 */
    private Integer isOverdue;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
