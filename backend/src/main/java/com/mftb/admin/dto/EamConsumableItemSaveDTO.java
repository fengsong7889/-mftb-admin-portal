package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材主数据保存参数（新增/编辑共用，id 为空表示新增）
 */
@Data
public class EamConsumableItemSaveDTO {
    private Long id;
    private String name;
    private Long categoryId;
    private Long consumableCategoryId;
    private Long brandId;
    private String brand;
    /** 所属品牌 ID（sys_company_brand） */
    private Long companyBrand;
    /** 购买公司 ID（sys_purchase_company） */
    private Long purchaseCompanyId;
    private String spec;
    private String unit;
    private BigDecimal refPrice;
    private String image;
    private Integer safetyStock;
    private Integer maxStock;
    private Integer perClaimLimit;
    private String status;
    private String remark;
}
