package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材品牌 VO
 */
@Data
public class ConsumableBrandVO {
    private Long id;
    private String name;
    private String nameEn;
    /** ASSET / CONSUMABLE / BOTH */
    private String categoryType;
    private String logo;
    private String status;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private String updatedAt;
}
