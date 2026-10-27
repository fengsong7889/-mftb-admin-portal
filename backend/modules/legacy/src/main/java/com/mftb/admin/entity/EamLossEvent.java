package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产遗失事件日志实体
 */
@Data
@TableName("biz_eam_loss_event")
public class EamLossEvent {

    @TableId
    private Long id;

    /** 关联遗失单 ID */
    private Long lossId;

    /** 事件类型：create/edit/recover/inspect/write_off/follow_up/compensation_linked */
    private String eventType;

    /** 事件描述 */
    private String eventDesc;

    /** 变更前值（JSON） */
    private String beforeValue;

    /** 变更后值（JSON） */
    private String afterValue;

    /** 变更原因（编辑时必填） */
    private String changeReason;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 关联凭证 ID */
    private Long evidenceId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
