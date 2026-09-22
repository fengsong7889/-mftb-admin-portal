package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 按员工维度的消耗统计行 */
@Data
public class EamConsumableApplicantStatVO {
    private Long applicantId;
    private String applicantEmpId;
    private String applicantName;
    private String department;
    /** 消耗数量 */
    private Integer consumeQty = 0;
    /** 消耗金额（实际成本） */
    private BigDecimal consumeAmount = BigDecimal.ZERO;
    /** 领用单数 */
    private Integer claimCount = 0;
}
