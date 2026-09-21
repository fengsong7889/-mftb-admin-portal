package com.mftb.admin.dto;

import lombok.Data;

/**
 * 报废记录查询参数
 * <p>
 * 搜索区字段：资产编号/资产名称/资产分类/资产品牌/报废时间/申请人/处置方式/状态/创建时间/最后更新人/最后更新时间
 */
@Data
public class EamScrapQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 资产编号（模糊） */
    private String assetNo;
    /** 资产名称（模糊） */
    private String assetName;
    /** 资产分类编码（精确） */
    private String assetType;
    /** 资产品牌（模糊） */
    private String brand;
    /** 报废时间范围起 yyyy-MM-dd */
    private String scrapDateStart;
    /** 报废时间范围止 yyyy-MM-dd */
    private String scrapDateEnd;
    /** 申请人（模糊） */
    private String applyBy;
    /** 处置方式：sale/donate/recycle/destroy */
    private String disposeType;
    /** 状态：pending/approved/rejected/cancelled */
    private String status;
    /** 创建时间范围起 yyyy-MM-dd */
    private String createdAtStart;
    /** 创建时间范围止 yyyy-MM-dd */
    private String createdAtEnd;
    /** 最后更新人（模糊） */
    private String updatedBy;
    /** 最后更新时间范围起 yyyy-MM-dd */
    private String updatedAtStart;
    /** 最后更新时间范围止 yyyy-MM-dd */
    private String updatedAtEnd;
}
