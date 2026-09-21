package com.mftb.admin.dto;

import lombok.Data;

/**
 * 借用记录查询参数
 */
@Data
public class EamBorrowQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 关键词（借用单号/资产编号/借用人） */
    private String keyword;
    /** 状态：active/overdue/returned/cancelled */
    private String status;
    /** 部门 */
    private String department;
    /** 开始日期 yyyy-MM-dd */
    private String startDate;
    /** 结束日期 yyyy-MM-dd */
    private String endDate;
    /** 所属品牌（sys_company_brand.id） */
    private Integer companyBrand;
}
