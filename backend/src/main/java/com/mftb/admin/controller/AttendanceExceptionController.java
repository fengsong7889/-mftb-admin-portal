package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceExceptionConfirmRequest;
import com.mftb.admin.dto.AttendanceExceptionLeaveRequest;
import com.mftb.admin.dto.AttendanceExceptionReissueRequest;
import com.mftb.admin.dto.AttendanceExceptionVO;
import com.mftb.admin.dto.DateTimeFormats;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AttendanceExceptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 考勤异常处理接口。
 * <p>
 * 只有「确认」与「人工补录」两类写动作，没有任何删除端点：异常是计算引擎产出的事实记录，
 * 删掉等于把审计链剪断；补卡/请假/加班申请本身走流程审批系统，不在这里开审批入口。
 */
@RestController
@RequestMapping("/api/attendance/exceptions")
@RequiredArgsConstructor
public class AttendanceExceptionController {

    private final AttendanceExceptionService exceptionService;

    /** 分页列表 */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION)
    public Result<PageResult<AttendanceExceptionVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) Integer exceptionType,
            @RequestParam(required = false) Integer status) {
        return Result.success(exceptionService.page(page, size, from, to, groupId, deptId, exceptionType, status));
    }

    /** 与列表同口径的统计（统计卡必须跟随筛选条件） */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION)
    public Result<Map<String, Object>> stats(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) Integer exceptionType,
            @RequestParam(required = false) Integer status) {
        return Result.success(exceptionService.stats(from, to, groupId, deptId, exceptionType, status));
    }

    /** 详情（处理页按 id 取数，不让前端拉列表再挑一条） */
    @GetMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION)
    public Result<AttendanceExceptionVO> detail(@PathVariable Long id) {
        return Result.success(exceptionService.detail(id));
    }

    /**
     * 可抵扣该异常的候选假单（同人 + 已核准 + 区间覆盖）。
     * <p>按异常菜单鉴权而不是請假管理菜单：抵扣一条缺卡不应该要求操作人
     * 持有全公司假单的查看权（最小权限），也不该把无关单据暴露给他。
     */
    @GetMapping("/{id}/leave-candidates")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION)
    public Result<List<Map<String, Object>>> leaveCandidates(@PathVariable Long id) {
        return Result.success(exceptionService.leaveCandidates(id));
    }

    /** 待处理异常数（假勤工作台预警用，按工作台菜单鉴权） */
    @GetMapping("/pending-count")
    @RequirePermission(menu = AttendanceConstants.MENU_WORKBENCH)
    public Result<Long> pendingCount(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return Result.success(exceptionService.pendingCount(from, to));
    }

    /** 批量确认异常无误（不抵扣）：仅待处理行生效，已处理行跳过并回报差额 */
    @PostMapping("/confirm")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION, action = "edit")
    public Result<Map<String, Object>> confirm(@RequestBody AttendanceExceptionConfirmRequest request) {
        Map<String, Object> summary = exceptionService.confirm(request.getIds(), request.getRemark());
        return Result.success("已確認異常", summary);
    }

    /** 人工补录打卡并关闭异常；已冻结月份拒绝回溯 */
    @PostMapping("/{id}/reissue")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION, action = "edit")
    public Result<AttendanceExceptionVO> reissue(@PathVariable Long id,
                                                 @RequestBody AttendanceExceptionReissueRequest request) {
        AttendanceExceptionVO vo = exceptionService.reissue(id,
                DateTimeFormats.parse(request.getOnTime()),
                DateTimeFormats.parse(request.getOffTime()),
                request.getReason());
        return Result.success("補卡完成，當日匯總已重算", vo);
    }

    /**
     * 关联已核准假单抵扣异常。
     * <p>假单的当事人/区间/审批状态全部由服务端回查校验，请求体只收 ID。
     */
    @PostMapping("/{id}/deduct-leave")
    @RequirePermission(menu = AttendanceConstants.MENU_EXCEPTION, action = "edit")
    public Result<AttendanceExceptionVO> deductByLeave(@PathVariable Long id,
                                                       @RequestBody AttendanceExceptionLeaveRequest request) {
        return Result.success("已關聯假單抵扣，當日匯總已重算",
                exceptionService.deductByLeaveRequest(id, request.getLeaveId()));
    }
}
