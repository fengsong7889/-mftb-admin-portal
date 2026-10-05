package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamConsumableReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 耗材消耗统计报表接口（公司 / 部门 / 员工 / 耗材 四个维度）
 * <p>
 * 五个端点共用同一个 {@link EamConsumableReportQuery}（时间区间/公司/部门等筛选），
 * 前端切维度时只需换请求路径，保证四个表格与顶部概览的口径始终一致。
 */
@RestController
@RequestMapping("/api/eam/consumables/report")
@RequiredArgsConstructor
public class EamConsumableReportController {

    private final EamConsumableReportService reportService;

    /** 报表顶部概览指标（同一查询条件下的汇总值） */
    @GetMapping("/summary")
    @RequirePermission(menu = "consumable-report")
    public Result<EamConsumableReportSummaryVO> summary(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.summary(query));
    }

    /** 按公司维度统计消耗 */
    @GetMapping("/by-company")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableCompanyStatVO>> byCompany(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByCompany(query));
    }

    /** 按部门维度统计消耗 */
    @GetMapping("/by-dept")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableDeptStatVO>> byDept(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByDept(query));
    }

    /** 按领用人（申请人）维度统计消耗 */
    @GetMapping("/by-applicant")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableApplicantStatVO>> byApplicant(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByApplicant(query));
    }

    /** 按耗材品类维度统计消耗 */
    @GetMapping("/by-item")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableItemStatVO>> byItem(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByItem(query));
    }
}
