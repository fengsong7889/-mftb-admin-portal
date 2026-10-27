package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材消耗统计报表服务接口
 */
public interface EamConsumableReportService {

    /** 顶部汇总指标 */
    EamConsumableReportSummaryVO summary(EamConsumableReportQuery query);

    /** 按公司（品牌+购买公司）统计 */
    List<EamConsumableCompanyStatVO> statsByCompany(EamConsumableReportQuery query);

    /** 按部门统计消耗 */
    List<EamConsumableDeptStatVO> statsByDept(EamConsumableReportQuery query);

    /** 按员工统计消耗 */
    List<EamConsumableApplicantStatVO> statsByApplicant(EamConsumableReportQuery query);

    /** 按耗材统计入库与消耗 */
    List<EamConsumableItemStatVO> statsByItem(EamConsumableReportQuery query);
}
