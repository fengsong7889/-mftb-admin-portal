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
 */
@RestController
@RequestMapping("/api/eam/consumables/report")
@RequiredArgsConstructor
public class EamConsumableReportController {

    private final EamConsumableReportService reportService;

    @GetMapping("/summary")
    @RequirePermission(menu = "consumable-report")
    public Result<EamConsumableReportSummaryVO> summary(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.summary(query));
    }

    @GetMapping("/by-company")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableCompanyStatVO>> byCompany(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByCompany(query));
    }

    @GetMapping("/by-dept")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableDeptStatVO>> byDept(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByDept(query));
    }

    @GetMapping("/by-applicant")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableApplicantStatVO>> byApplicant(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByApplicant(query));
    }

    @GetMapping("/by-item")
    @RequirePermission(menu = "consumable-report")
    public Result<List<EamConsumableItemStatVO>> byItem(@ModelAttribute EamConsumableReportQuery query) {
        return Result.success(reportService.statsByItem(query));
    }
}
