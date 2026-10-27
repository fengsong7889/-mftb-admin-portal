package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 资产型号新增/更新请求（更新时字段为 null 表示不修改）
 */
@Data
public class EamModelSaveDTO {

    /** 所属分类编码 */
    private String categoryCode;

    /** 品牌ID */
    private Long brandId;

    /** 品牌中文名快照 */
    private String brandZh;

    /** 品牌英文名快照 */
    private String brandEn;

    /** 品牌 Logo 快照 */
    private String brandLogo;

    /** 产品编码（后端自动生成，前端可传空） */
    private String code;

    /** 型号编号 */
    private String modelNo;

    /** 型号名称 */
    private String name;

    /** 计量单位 */
    private String unit;

    /** 参考单价 */
    private BigDecimal refPrice;
}
