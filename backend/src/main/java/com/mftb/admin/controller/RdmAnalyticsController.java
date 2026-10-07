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
import org.springframework.web.bind.annotation.PostMapping;
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

    /** 快照重算（运维入口：口径修复后把历史刷回一致） */
    private final com.mftb.admin.config.RdmMetricSnapshotInitializer metricSnapshotInitializer;

    /**
     * 指标字典：每个看板的数都应当能回答「它是怎么算的、能不能回算、哪里会误读」。
     * <p>这份清单是口径的唯一出处（constant/RdmMetricCatalog），
     * 三处各写一句解释的结局必然是它们互相矛盾。
     */
    @GetMapping("/metrics")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_BOARD, anyOf = {"rdm-workbench", "rdm-requirement", "rdm-intake", "rdm-acceptance", "rdm-dashboard-risk", "rdm-efficiency-output", "rdm-dashboard-score"})
    public Result<java.util.List<com.mftb.admin.constant.RdmMetricCatalog.Definition>> metrics() {
        return Result.success(com.mftb.admin.constant.RdmMetricCatalog.all());
    }

    /**
     * 重算指定区间的效能量快照。
     * <p>快照是看板与绩效建议的数据源，谁都能改等于口径可以被静默改写，所以只给配置权；
     * 命名锁与定时作业共用，不会两边互踩。
     */
    @PostMapping("/snapshot/recompute")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, action = "edit", anyOf = {"rdm-dashboard-score"})
    public Result<Integer> recomputeSnapshot(@RequestParam String from, @RequestParam String to) {
        int days = metricSnapshotInitializer.recompute(
                java.time.LocalDate.parse(from.trim()), java.time.LocalDate.parse(to.trim()));
        return Result.success("已重算 " + days + " 天的快照", days);
    }

    /** 全局看板：结果指标 + 结构分布 + 阶段负载 + 趋势 + 风险清单 */
    @GetMapping("/overview")
    // rdm-dashboard-risk / rdm-efficiency-output 也要能读：风险明细与部门人员产出已拆成独立页，
    // 它们与总看板共用同一份取数（不能再为每个页各写一份 SQL）
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_BOARD, anyOf = {"rdm-workbench", "rdm-requirement", "rdm-intake", "rdm-acceptance", "rdm-dashboard-risk", "rdm-efficiency-output"})
    public Result<RdmDashboardVO> overview(@RequestParam(required = false, defaultValue = "month") String period) {
        return Result.success(analyticsService.overview(period));
    }

    /** 质量口径：验收一次通过率 / 返工 / 缺陷 / 满意度 */
    @GetMapping("/quality")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_QUALITY, anyOf = {"rdm-dashboard-board", "rdm-dashboard-report", "rdm-acceptance", "rdm-requirement"})
    public Result<RdmQualityVO> quality() {
        return Result.success(analyticsService.quality());
    }

    /** 版本 → 需求（一个版本带了哪些需求） */
    @GetMapping("/version-trace")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_VERSION, anyOf = {"rdm-dashboard-board", "rdm-requirement", "rdm-acceptance"})
    public Result<RdmVersionTraceVO> versionTrace(@RequestParam String versionNo) {
        return Result.success(analyticsService.versionTraceByVersion(versionNo));
    }

    /** 需求 → 版本（上了哪个版本、同版本还有谁） */
    @GetMapping("/version-trace/requirement/{reqId}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_VERSION, anyOf = {"rdm-dashboard-board", "rdm-requirement", "rdm-acceptance", "rdm-workbench"})
    public Result<RdmVersionTraceVO> requirementTrace(@PathVariable Long reqId) {
        return Result.success(analyticsService.versionTraceByRequirement(reqId));
    }

    /** 交付周报（区间/迭代维度的结果、效率、风险与下周计划） */
    @GetMapping("/weekly-report")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_REPORT, anyOf = {"rdm-dashboard-board", "rdm-dashboard-quality", "rdm-intake"})
    public Result<RdmWeeklyReportVO> weeklyReport(@RequestParam(required = false) String startDate,
                                                  @RequestParam(required = false) String endDate,
                                                  @RequestParam(required = false) String iterationCode) {
        return Result.success(analyticsService.weeklyReport(startDate, endDate, iterationCode));
    }
}
