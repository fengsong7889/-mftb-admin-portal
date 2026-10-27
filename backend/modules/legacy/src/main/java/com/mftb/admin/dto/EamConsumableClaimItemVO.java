package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材领用单明细视图对象
 */
@Data
public class EamConsumableClaimItemVO {
    private Long id;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private Integer qty;
    private Long locationId;
    private String locationName;
    private BigDecimal unitCost;
    /** 实际出库加权均价 */
    private BigDecimal actualUnitCost;
    /** 出库成本金额 */
    private BigDecimal amount;
    /** 已退料数量 */
    private Integer returnedQty;
}
