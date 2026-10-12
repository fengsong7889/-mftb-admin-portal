package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceDailyVO;
import com.mftb.admin.dto.AttendanceMonthlyActionRequest;
import com.mftb.admin.dto.AttendanceMonthlyVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AttendanceSummaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

/**
 * 考勤汇总接口：日报（计算结论，只读 + 重算）与月度汇总（薪酬取数出口）。
 * <p>
 * 没有任何「修改汇总数值」的端点——汇总是算出来的，改数只能改上游（补卡/请假/排班）后重算，
 * 否则日报与薪酬引用值会分叉。
 */
@RestController
@RequestMapping("/api/attendance/summaries")
@RequiredArgsConstructor
public class AttendanceSummaryController {

    private final AttendanceSummaryService summaryService;

    /* ==================== 日报 ==================== */

    /** 日报分页 */
    @GetMapping("/daily")
    @RequirePermission(menu = AttendanceConstants.MENU_DAILY)
    public Result<PageResult<AttendanceDailyVO>> dailyPage(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId) {
        return Result.success(summaryService.dailyPage(page, size, from, to, groupId, deptId));
    }

    /** 日报统计（与列表同口径） */
    @GetMapping("/daily/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_DAILY)
    public Result<Map<String, Object>> dailyStats(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId) {
        return Result.success(summaryService.dailyStats(from, to, groupId, deptId));
    }

    /**
     * 重算区间日报（含异常生成与打卡判定回写）。
     * <p>已冻结月份由服务层整体跳过并在返回值里给出 {@code skippedFrozen}，
     * 界面上必须把这个数字显示出来，否则管理员会以为整段都重算过了。
     */
    @PostMapping("/daily/recalculate")
    @RequirePermission(menu = AttendanceConstants.MENU_DAILY, action = "edit")
    public Result<Map<String, Object>> recalculate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId) {
        return Result.success("重算完成", summaryService.recalculateDaily(from, to, groupId));
    }

    /* ==================== 月度汇总 ==================== */

    /** 生成/刷新月度汇总：只重建 draft 行，已冻结与已同步不动 */
    @PostMapping("/monthly/generate")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY, action = "edit")
    public Result<Map<String, Object>> generateMonthly(@RequestParam String month,
                                                       @RequestParam(required = false) Long groupId) {
        return Result.success("月度匯總已生成", summaryService.generateMonthly(month, groupId));
    }

    /** 月报分页 */
    @GetMapping("/monthly")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY)
    public Result<PageResult<AttendanceMonthlyVO>> monthlyPage(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        return Result.success(summaryService.monthlyPage(page, size, month, groupId, deptId, keyword, status));
    }

    /** 月报统计（与列表同口径） */
    @GetMapping("/monthly/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY)
    public Result<Map<String, Object>> monthlyStats(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        return Result.success(summaryService.monthlyStats(month, groupId, deptId, keyword, status));
    }

    /** 某月是否已冻结：日报页重算前的前置提示，避免用户点了才知道整段被跳过 */
    @GetMapping("/monthly/frozen")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY)
    public Result<Boolean> isMonthFrozen(@RequestParam String month) {
        return Result.success(summaryService.isMonthFrozen(month));
    }

    /** 冻结：draft → frozen，生成批次号供薪酬对账 */
    @PostMapping("/monthly/freeze")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY, action = "edit")
    public Result<Map<String, Object>> freeze(@RequestBody AttendanceMonthlyActionRequest request) {
        return Result.success("已凍結", summaryService.freeze(request.getIds()));
    }

    /** 同步薪酬：frozen → synced */
    @PostMapping("/monthly/sync-payroll")
    @RequirePermission(menu = AttendanceConstants.MENU_MONTHLY, action = "edit")
    public Result<Map<String, Object>> syncToPayroll(@RequestBody AttendanceMonthlyActionRequest request) {
        return Result.success("已標記同步薪酬", summaryService.syncToPayroll(request.getIds()));
    }
}
