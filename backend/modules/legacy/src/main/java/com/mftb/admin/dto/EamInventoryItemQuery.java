package com.mftb.admin.dto;

import lombok.Data;

/** 盘点明细查询参数（详情页分页/筛选） */
@Data
public class EamInventoryItemQuery {

    /** 资产编号/名称关键字 */
    private String keyword;

    /** 核对进度：checked(已核对)/unchecked(未核对)/recheck(待复核) */
    private String checkProgress;

    /** 异常类型：missing/damaged/location_diff/holder_diff */
    private String anomaly;

    /** 存放仓库 ID */
    private Long locationId;

    private Integer page = 1;
    private Integer size = 20;
}
