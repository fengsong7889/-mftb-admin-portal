package com.mftb.admin.dto;

import lombok.Data;

/**
 * 赔付收款/退款请求 DTO
 */
@Data
public class EamCompensationPaymentDTO {
    /** 赔付记录 ID */
    private Long compensationId;
    /** 类型：payment/refund */
    private String type;
    /** 金额（分） */
    private Long amount;
    /** 业务日期 yyyy-MM-dd */
    private String paymentDate;
    /** 说明 */
    private String reason;
    /** 凭证 Data URL */
    private String evidenceDataUrl;
    /** 凭证文件名 */
    private String evidenceFileName;
}
