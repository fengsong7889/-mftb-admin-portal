package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 库存调拨单展示 VO */
@Data
public class EamConsumableTransferVO {
    private Long id;
    private String transferNo;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private Long fromLocationId;
    private String fromLocationName;
    private Long toLocationId;
    private String toLocationName;
    private Integer qty;
    private BigDecimal unitCost;
    private BigDecimal amount;
    private String operator;
    private String createdBy;
    private String createdAt;
}
