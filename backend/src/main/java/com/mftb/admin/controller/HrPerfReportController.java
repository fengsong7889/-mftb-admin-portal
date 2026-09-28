package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAppealVO;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCalibrationLogVO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrPerfReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

/**
 * 績效台账接口（M2：结果报表 / 改判留痕 / 强制分布 / 申诉处理）。
 * <p>
 * 与绩效执行接口分开是本域菜单分开的对应物：报表与留痕的受众是 HR/分析岗，
 * 评分与校准的受众是评估人与人事经办，混在一张菜单上就没法只给分析岗开台账。
 */
@RestController
@RequestMapping("/api/hr/perf")
@RequiredArgsConstructor
public class HrPerfReportController {

    private final HrPerfReportService hrPerfReportService;

    // ==================== 结果台账 ====================

    @GetMapping("/report")
    @RequirePermission(menu = HrPerfConstants.MENU_LEDGER)
    public Result<HrPerfReportVO> report(
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) Long planId) {
        return Result.success(hrPerfReportService.report(cycleId, planId));
    }

    /** 台账明细分页（导出与钻取共用，只含已确认结果） */
    @GetMapping("/report/rows")
    @RequirePermission(menu = HrPerfConstants.MENU_LEDGER)
    public Result<PageResult<HrPerfAssessmentVO>> reportRows(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) String deptName,
            @RequestParam(required = false) String grade,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfReportService.pageReportRows(page, size, cycleId, planId, deptName, grade, keyword));
    }

    /** 已确认结果条数：导出按钮的前置提示，避免 HR 点下去才知道是空集 */
    @GetMapping("/report/count")
    @RequirePermission(menu = HrPerfConstants.MENU_LEDGER)
    public Result<Long> reportCount(
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) Long planId) {
        return Result.success(hrPerfReportService.countReportRows(cycleId, planId));
    }

    /** 台账可选部门（避免前端拿全量员工列表去凑下拉） */
    @GetMapping("/report/departments")
    @RequirePermission(menu = HrPerfConstants.MENU_LEDGER)
    public Result<List<String>> reportDepartments(
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) Long planId) {
        return Result.success(hrPerfReportService.reportDepartments(cycleId, planId));
    }

    // ==================== 强制分布与改判留痕 ====================

    /** 建议占比缺口预览：校准台提交前先看超编情况，别等报错才知道 */
    @GetMapping("/plans/{id}/distribution-gap")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, anyOf = {HrPerfConstants.MENU_LEDGER, HrPerfConstants.MENU_ADMIN})
    public Result<List<HrPerfReportVO.GradeCount>> distributionGap(@PathVariable Long id) {
        return Result.success(hrPerfReportService.distributionGap(id));
    }

    @GetMapping("/calibration-logs")
    @RequirePermission(menu = HrPerfConstants.MENU_AUDIT,
            anyOf = {HrPerfConstants.MENU_LEDGER, HrPerfConstants.MENU_CALIBRATION})
    public Result<PageResult<HrPerfCalibrationLogVO>> calibrationLogs(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) Long assessmentId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfReportService.pageLogs(page, size, planId, assessmentId, action, keyword));
    }

    /** 单张考核单的改判时间线（仅 HR 侧菜单，员工侧不从这里取数） */
    @GetMapping("/assessments/{id}/calibration-logs")
    @RequirePermission(menu = HrPerfConstants.MENU_AUDIT,
            anyOf = {HrPerfConstants.MENU_LEDGER, HrPerfConstants.MENU_CALIBRATION, HrPerfConstants.MENU_ADMIN})
    public Result<List<HrPerfCalibrationLogVO>> assessmentLogs(@PathVariable Long id) {
        return Result.success(hrPerfReportService.logsOfAssessment(id));
    }

    // ==================== 申诉处理（HR 侧） ====================

    @GetMapping("/appeals")
    @RequirePermission(menu = HrPerfConstants.MENU_APPEAL)
    public Result<PageResult<HrPerfAppealVO>> appeals(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfReportService.pageAppeals(page, size, planId, status, keyword));
    }

    @GetMapping("/appeals/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_APPEAL, anyOf = HrPerfConstants.MENU_SELF)
    public Result<HrPerfAppealVO> appeal(@PathVariable Long id) {
        return Result.success(hrPerfReportService.getAppeal(id));
    }

    /** 受理/办结/驳回：终态（已办结、已驳回）必须填处理结论 */
    @PostMapping("/appeals/{id}/handle")
    @RequirePermission(menu = HrPerfConstants.MENU_APPEAL, action = "edit")
    public Result<HrPerfAppealVO> handleAppeal(@PathVariable Long id,
                                               @RequestParam String status,
                                               @RequestParam(required = false) String conclusion) {
        return Result.success("申訴狀態已更新", hrPerfReportService.handleAppeal(id, status, conclusion));
    }

    /** 受理后直接修订已下发结果（带留痕，申诉自动置为已办结） */
    @PostMapping("/appeals/{id}/revise")
    @RequirePermission(menu = HrPerfConstants.MENU_APPEAL, action = "edit")
    public Result<HrPerfAppealVO> reviseAppeal(@PathVariable Long id,
                                               @RequestParam(required = false) BigDecimal score,
                                               @RequestParam(required = false) String grade,
                                               @RequestParam String reason) {
        return Result.success("結果已修訂並留痕", hrPerfReportService.reviseFromAppeal(id, score, grade, reason));
    }
}
