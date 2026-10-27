package com.mftb.admin.dto;

import lombok.Data;

/** 消耗统计报表查询参数 */
@Data
public class EamConsumableReportQuery {
    /** 统计起始日期 yyyy-MM-dd（按业务记账日期） */
    private String startDate;
    /** 统计截止日期 yyyy-MM-dd */
    private String endDate;
    /** 所属品牌 ID（可选过滤） */
    private Long companyBrand;
    /** 购买公司 ID（可选过滤） */
    private Long purchaseCompanyId;
}
