package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材主数据查询参数
 */
@Data
public class EamConsumableItemQuery {
    private Integer page = 1;
    private Integer size = 10;
    /** 关键字（编码/名称/规格/品牌） */
    private String keyword;
    /** 分类 ID */
    private Long categoryId;
    /** 状态：enabled/disabled */
    private String status;
    /** 仅看预警（可用库存低于安全库存） */
    private Boolean alertOnly;
}
