package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务查询参数 */
@Data
public class EamInventoryQuery {

    /** 任务名称（模糊匹配） */
    private String keyword;

    /** 状态过滤：in_progress/completed/cancelled */
    private String status;

    /** 页码（从 1 开始） */
    private Integer page = 1;

    /** 每页条数 */
    private Integer size = 10;
}
