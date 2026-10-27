package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 库存调整单展示 VO */
@Data
public class EamConsumableAdjustVO {
    private Long id;
    private String adjustNo;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private Long locationId;
    private String locationName;
    private String direction;
    private Integer qty;
    private BigDecimal unitCost;
    private BigDecimal amount;
    private String reason;
    private String operator;
    private String createdBy;
    private String createdAt;
}
