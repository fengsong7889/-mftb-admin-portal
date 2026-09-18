package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材品牌保存参数
 */
@Data
public class ConsumableBrandSaveDTO {
    private String code;
    private String name;
    private String nameEn;
    /** ASSET / CONSUMABLE / BOTH */
    private String categoryType;
    private String logo;
    private String status;
    private String remark;
}
