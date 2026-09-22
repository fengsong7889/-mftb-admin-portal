package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 入库单明细展示 VO */
@Data
public class EamConsumableInboundItemVO {
    private Long id;
    private Long inboundId;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private Long locationId;
    private String locationName;
    private Integer qty;
    private BigDecimal unitPrice;
    private BigDecimal amount;
}
