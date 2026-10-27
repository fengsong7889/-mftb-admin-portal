package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材库存查询参数
 */
@Data
public class EamConsumableStockQuery {
    /** 耗材编码（模糊） */
    private String itemCode;
    /** 耗材名称（模糊） */
    private String itemName;
    /** 仓库 ID（精确） */
    private Long locationId;
    /** 最后更新人（模糊） */
    private String updatedBy;
    /** 更新时间范围起（yyyy-MM-dd） */
    private String updateTimeStart;
    /** 更新时间范围止（yyyy-MM-dd） */
    private String updateTimeEnd;
}
