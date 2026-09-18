package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产品牌新增/更新请求（更新时字段为 null 表示不修改）
 */
@Data
public class EamBrandSaveDTO {

    /** 品牌编码（AB 前缀） */
    private String code;

    /** 所属分类编码 */
    private String categoryCode;

    /** 品牌中文名 */
    private String brandZh;

    /** 品牌英文名 */
    private String brandEn;

    /** 品牌 Logo 地址 */
    private String brandLogo;
}
