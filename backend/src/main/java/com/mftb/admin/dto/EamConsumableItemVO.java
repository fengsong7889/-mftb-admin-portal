package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材主数据视图对象（附带库存汇总与预警标记）
 */
@Data
public class EamConsumableItemVO {
    private Long id;
    private String itemCode;
    private String name;
    private Long categoryId;
    private String categoryCode;
    private String categoryName;
    private String brand;
    private String spec;
    private String unit;
    private BigDecimal refPrice;
    private String image;
    private Integer safetyStock;
    private Integer maxStock;
    private Integer perClaimLimit;
    private String status;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private String updatedAt;

    /** 全部仓库实际库存合计 */
    private Integer totalQty;
    /** 全部仓库审批占用合计 */
    private Integer lockedQty;
    /** 可用库存 = totalQty - lockedQty */
    private Integer availableQty;
    /** 是否触发低库存预警（safetyStock>0 且 availableQty<safetyStock） */
    private Boolean alert;
}
