package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDashboardVO;
import com.mftb.admin.dto.RdmQualityVO;
import com.mftb.admin.dto.RdmVersionTraceVO;
import com.mftb.admin.dto.RdmWeeklyReportVO;
import com.mftb.admin.service.RdmAnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 產研協同（RDM）需求看板接口。
 * <p>只读统计，入口菜单为看板分组下的四个二级菜单；需求相关角色均可查看，
 * 因为「我的需求进展」与「部门/个人产出」在同一个页面承载。
 */
@RestController
@RequestMapping("/api/rdm/analytics")
@RequiredArgsConstructor
public class RdmAnalyticsController {

    private final RdmAnalyticsService analyticsService;

    /** 全局看板：结果指标 + 结构分布 + 阶段瓶颈 + 趋势 + 风险雷达 */
    @GetMapping("/overview")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_BOARD, anyOf = {
            "rdm-workbench", "rdm-requirement", "rdm-intake", "rdm-product", "rdm-acceptance"})
    public Result<RdmDashboardVO> overview(@RequestParam(required = false, defaultValue = "month") String period) {
        return Result.success(analyticsService.overview(period));
    }

    /** 质量口径：验收一次通过率 / 返工 / 缺陷 / 满意度 */
    @GetMapping("/quality")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_QUALITY, anyOf = {
            "rdm-dashboard-board", "rdm-dashboard-report", "rdm-acceptance", "rdm-requirement"})
    public Result<RdmQualityVO> quality() {
        return Result.success(analyticsService.quality());
    }

    /** 版本 → 需求（一个版本带了哪些需求） */
    @GetMapping("/version-trace")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_VERSION, anyOf = {
            "rdm-dashboard-board", "rdm-requirement", "rdm-acceptance", "rdm-delivery-req"})
    public Result<RdmVersionTraceVO> versionTrace(@RequestParam String versionNo) {
        return Result.success(analyticsService.versionTraceByVersion(versionNo));
    }

    /** 需求 → 版本（上了哪个版本、同版本还有谁） */
    @GetMapping("/version-trace/requirement/{reqId}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_VERSION, anyOf = {
            "rdm-dashboard-board", "rdm-requirement", "rdm-acceptance", "rdm-workbench", "rdm-submit"})
    public Result<RdmVersionTraceVO> requirementTrace(@PathVariable Long reqId) {
        return Result.success(analyticsService.versionTraceByRequirement(reqId));
    }

    /** 交付周报（区间/迭代维度的结果、效率、风险与下周计划） */
    @GetMapping("/weekly-report")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_REPORT, anyOf = {
            "rdm-dashboard-board", "rdm-dashboard-quality", "rdm-intake", "rdm-product"})
    public Result<RdmWeeklyReportVO> weeklyReport(@RequestParam(required = false) String startDate,
                                                  @RequestParam(required = false) String endDate,
                                                  @RequestParam(required = false) String iterationCode) {
        return Result.success(analyticsService.weeklyReport(startDate, endDate, iterationCode));
    }
}
