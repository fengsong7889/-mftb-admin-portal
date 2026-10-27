package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceScheduleSaveRequest;
import com.mftb.admin.dto.AttendanceScheduleVO;
import com.mftb.admin.service.AttendanceScheduleService;
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
 * 排班接口（员工 × 日期 × 班次）。
 */
@RestController
@RequestMapping("/api/attendance/schedules")
@RequiredArgsConstructor
public class AttendanceScheduleController {

    private final AttendanceScheduleService scheduleService;

    /** 周矩阵视图 */
    @GetMapping("/week")
    @RequirePermission(menu = AttendanceConstants.MENU_SCHEDULE)
    public Result<AttendanceScheduleVO> week(
            @RequestParam Long groupId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return Result.success(scheduleService.week(groupId, weekStart));
    }

    /** 周排班覆盖统计（指标卡口径） */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_SCHEDULE)
    public Result<Map<String, Object>> stats(
            @RequestParam Long groupId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return Result.success(scheduleService.stats(groupId, weekStart));
    }

    /** 批量保存排班（按条目 upsert，未提交的格子不动） */
    @PostMapping
    @RequirePermission(menu = AttendanceConstants.MENU_SCHEDULE, action = "edit")
    public Result<Map<String, Object>> save(@RequestBody AttendanceScheduleSaveRequest request) {
        return Result.success("排班已保存", scheduleService.save(request));
    }

    /** 复制整周排班 */
    @PostMapping("/copy")
    @RequirePermission(menu = AttendanceConstants.MENU_SCHEDULE, action = "edit")
    public Result<Map<String, Object>> copy(
            @RequestParam Long groupId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate sourceWeekStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate targetWeekStart) {
        return Result.success("已複製排班", scheduleService.copyWeek(groupId, sourceWeekStart, targetWeekStart));
    }
}
