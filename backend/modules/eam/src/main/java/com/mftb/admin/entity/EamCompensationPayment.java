package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 赔付收款/退款流水实体
 */
@Data
@TableName("biz_eam_compensation_payment")
public class EamCompensationPayment {

    @TableId
    private Long id;

    /** 关联赔付记录 ID */
    private Long compensationId;

    /** 类型：payment/refund */
    private String type;

    /** 金额（分） */
    private Long amount;

    /** 业务日期 */
    private LocalDate paymentDate;

    /** 说明 */
    private String reason;

    /** 凭证 ID */
    private Long evidenceId;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
