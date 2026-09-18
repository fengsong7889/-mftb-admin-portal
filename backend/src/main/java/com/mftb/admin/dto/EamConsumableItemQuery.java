package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材主数据查询参数
 */
@Data
public class EamConsumableItemQuery {
    private Integer page = 1;
    private Integer size = 10;
    /** 关键字（编码/名称/规格/品牌，保留兼容） */
    private String keyword;
    /** 耗材编码（模糊） */
    private String itemCode;
    /** 耗材名称（模糊） */
    private String name;
    /** 分类 ID */
    private Long categoryId;
    /** 品牌（模糊） */
    private String brand;
    /** 计量单位（精确） */
    private String unit;
    /** 状态：enabled/disabled */
    private String status;
    /** 最后更新人（模糊） */
    private String updatedBy;
    /** 更新时间范围起（yyyy-MM-dd，含当天 00:00:00） */
    private String updateTimeStart;
    /** 更新时间范围止（yyyy-MM-dd，含当天 23:59:59） */
    private String updateTimeEnd;
    /** 仅看预警（可用库存低于安全库存） */
    private Boolean alertOnly;
}
