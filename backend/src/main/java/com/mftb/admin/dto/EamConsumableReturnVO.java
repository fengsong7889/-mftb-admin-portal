package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 退料单展示 VO */
@Data
public class EamConsumableReturnVO {
    private Long id;
    private String returnNo;
    private Long claimId;
    private Long claimItemId;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private Long locationId;
    private String locationName;
    private Integer qty;
    private BigDecimal unitCost;
    private BigDecimal amount;
    private Long applicantId;
    private String applicantName;
    private Long departmentId;
    private String department;
    private String reason;
    private String operator;
    private String createdBy;
    private String createdAt;
}
