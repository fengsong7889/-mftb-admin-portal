package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材出入库流水视图对象
 */
@Data
public class EamConsumableTxnVO {
    private Long id;
    private String txnNo;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private Long locationId;
    private String locationName;
    private String txnType;
    private Integer qty;
    private Integer beforeQty;
    private Integer afterQty;
    private BigDecimal unitCost;
    private String refType;
    private Long refId;
    private String operator;
    private String remark;
    private String createdAt;
}
