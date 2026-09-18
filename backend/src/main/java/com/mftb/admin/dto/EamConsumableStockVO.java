package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材库存视图对象（库存行 + 耗材信息）
 */
@Data
public class EamConsumableStockVO {
    private Long id;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    private String categoryName;
    private Long locationId;
    private String locationName;
    private Integer qty;
    private Integer lockedQty;
    private Integer availableQty;
    private Integer safetyStock;
    /** 是否低于安全库存 */
    private Boolean alert;
    /** 最后更新人（来自耗材主数据） */
    private String updatedBy;
    /** 最后更新时间（来自耗材主数据） */
    private String updatedAt;
}
