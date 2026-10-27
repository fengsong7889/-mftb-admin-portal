package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 领用操作事件流水实体
 */
@Data
@TableName("biz_eam_claim_event")
public class EamClaimEvent {

    @TableId
    private Long id;

    /** 关联领用 ID */
    private Long claimId;

    /** 事件类型：created / signed / proxy_signed / returned / cancelled / supplementary */
    private String eventType;

    /** 操作人姓名 */
    private String operatorName;

    /** 事件备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
