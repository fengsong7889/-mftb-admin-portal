package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 赔付找回复核记录实体
 */
@Data
@TableName("biz_eam_compensation_review")
public class EamCompensationReview {

    @TableId
    private Long id;

    /** 关联赔付记录 ID */
    private Long compensationId;

    /** 复核日期 */
    private LocalDate reviewDate;

    /** 原应赔金额（分） */
    private Long beforeAmount;

    /** 复核后应赔金额（分） */
    private Long afterAmount;

    /** 调整理由 */
    private String reason;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
