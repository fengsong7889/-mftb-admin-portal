package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.service.AttendanceWorkbenchService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

/**
 * 假勤工作台接口（只读）。
 * <p>
 * 工作台不承载任何审批动作：待办一律跳转流程中心/流程事项，因此这里只有查询端点，
 * 避免同一件事在两个系统各有一个入口而状态不同步。
 */
@RestController
@RequestMapping("/api/attendance/workbench")
@RequiredArgsConstructor
public class AttendanceWorkbenchController {

    private final AttendanceWorkbenchService workbenchService;

    /** 总览：当日出勤指标 + 区间异常计数 + 结构化预警 + 考勤组概况 */
    @GetMapping("/overview")
    @RequirePermission(menu = AttendanceConstants.MENU_WORKBENCH)
    public Result<Map<String, Object>> overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate rangeFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate rangeTo) {
        return Result.success(workbenchService.overview(date, rangeFrom, rangeTo));
    }
}
