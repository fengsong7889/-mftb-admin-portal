package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务查询参数（v2） */
@Data
public class EamInventoryQuery {

    /** 任务名称（模糊匹配，兼容旧版） */
    private String keyword;

    /** 任务编号（模糊匹配） */
    private String taskNo;

    /** 负责人姓名/工号（模糊匹配） */
    private String ownerKeyword;

    /** 状态过滤：in_progress/completed/partially_completed/cancelled */
    private String status;

    /** 发起日期区间 yyyy-MM-dd */
    private String dateFrom;
    private String dateTo;

    /** 操作日期区间 yyyy-MM-dd（按任务最后更新时间 updated_at 过滤，含发起后的核对/结束/取消操作） */
    private String opDateFrom;
    private String opDateTo;

    /** 页码（从 1 开始） */
    private Integer page = 1;

    /** 每页条数 */
    private Integer size = 10;
}
