/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.service.cpm.CpmWorklogReportService;
import com.mftb.admin.service.cpm.CpmWorklogService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 工作台账接口：台账读写、工时口径日历、汇报聚合、本地台账一次性导入。
 *
 * <p>控制器只做「菜单入口 + 动作」门禁，归属与取值校验全在服务层：
 * 台账正文是本人工作内容，读走 cpm-my:view、写走 cpm-my:edit；
 * 日历改的是全局工时口径，单独挂在 cpm-holiday 菜单上，能与记录权限分开收回。
 *
 * <p>响应统一 no-store：台账与汇报正文是个人工作事实，不能被共享缓存或代理留副本。
 */
@RestController
@RequestMapping("/api/cpm/worklog")
@RequiredArgsConstructor
public class CpmWorklogController {

    private static final String MY = CpmConstants.MENU_MY;
    private static final String HOLIDAY = CpmConstants.MENU_HOLIDAY;
    private static final String REPORT = CpmConstants.MENU_REPORT;
    private static final String VIEW = CpmConstants.ACTION_VIEW;
    private static final String EDIT = CpmConstants.ACTION_EDIT;

    private final CpmWorklogService worklogService;
    private final CpmWorklogReportService reportService;

    /* ==================== 台账 ==================== */

    @GetMapping("/ledger")
    @RequirePermission(menu = MY, action = VIEW)
    public Result<CpmWorklogDto.LedgerVO> ledger(@RequestParam(required = false) String start,
                                                 @RequestParam(required = false) String end,
                                                 HttpServletResponse response) {
        noStore(response);
        return Result.success(worklogService.ledger(start, end));
    }

    @PostMapping("/groups")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.GroupVO> createGroup(@RequestBody @Valid CpmWorklogDto.GroupForm form,
                                                     HttpServletResponse response) {
        noStore(response);
        return Result.success("已新增", worklogService.createGroup(form));
    }

    @PutMapping("/groups/{id}")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.GroupVO> updateGroup(@PathVariable("id") long id,
                                                     @RequestBody @Valid CpmWorklogDto.GroupForm form,
                                                     HttpServletResponse response) {
        noStore(response);
        return Result.success("已更新", worklogService.updateGroup(id, form));
    }

    @DeleteMapping("/groups/{id}")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<Void> deleteGroup(@PathVariable("id") long id) {
        worklogService.deleteGroup(id);
        return Result.success("已刪除工作項", null);
    }

    @PostMapping("/groups/{id}/restore")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<Void> restoreGroup(@PathVariable("id") long id) {
        worklogService.restoreGroup(id);
        return Result.success("已恢復", null);
    }

    /** 行序落库：前端拖拽得到的顺序就是事实，一次批量写回，避免逐行 N 次请求 */
    @PutMapping("/groups/order")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<Void> reorderGroups(@RequestBody List<Long> ids) {
        worklogService.reorderGroups(ids);
        return Result.success("已排序", null);
    }

    @PostMapping("/tasks")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.TaskVO> createTask(@RequestBody @Valid CpmWorklogDto.TaskForm form,
                                                   HttpServletResponse response) {
        noStore(response);
        return Result.success("已記錄", worklogService.createTask(form));
    }

    @PutMapping("/tasks/{id}")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.TaskVO> updateTask(@PathVariable("id") long id,
                                                   @RequestBody @Valid CpmWorklogDto.TaskForm form,
                                                   HttpServletResponse response) {
        noStore(response);
        return Result.success("已更新", worklogService.updateTask(id, form));
    }

    @DeleteMapping("/tasks/{id}")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<Void> deleteTask(@PathVariable("id") long id) {
        worklogService.deleteTask(id);
        return Result.success("已刪除子任務", null);
    }

    @PostMapping("/tasks/{id}/restore")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<Void> restoreTask(@PathVariable("id") long id) {
        worklogService.restoreTask(id);
        return Result.success("已恢復", null);
    }

    /** 恢复取消态：与软删 restore 分开，清 cancelled/cancel_reason，status 按进度重算。 */
    @PostMapping("/tasks/{id}/restore-state")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.TaskVO> restoreState(@PathVariable("id") long id,
                                                     HttpServletResponse response) {
        noStore(response);
        return Result.success("已恢復", worklogService.restoreState(id));
    }

    /* ==================== 工时口径日历 ==================== */

    @GetMapping("/calendar")
    @RequirePermission(menu = HOLIDAY, action = VIEW)
    public Result<CpmWorklogDto.LedgerVO> calendar(@RequestParam String start, @RequestParam String end,
                                                   HttpServletResponse response) {
        noStore(response);
        // 日历与台账共用一次读取：单独开一个只回日历的接口，就会有两处「今天的口径」各说一套
        return Result.success(worklogService.ledger(start, end));
    }

    @PutMapping("/calendar")
    @RequirePermission(menu = HOLIDAY, action = EDIT)
    public Result<Void> setCalendar(@RequestBody @Valid CpmWorklogDto.CalendarForm form) {
        worklogService.setCalendar(form);
        return Result.success("已更新口径", null);
    }

    /** 清空本人某年口径（全局法定名单不动） */
    @DeleteMapping("/calendar/year")
    @RequirePermission(menu = HOLIDAY, action = EDIT)
    public Result<Integer> clearCalendarYear(@RequestParam int year) {
        return Result.success("已清空", worklogService.clearCalendarYear(year));
    }

    /* ==================== 汇报聚合 ==================== */

    @GetMapping("/report")
    @RequirePermission(menu = REPORT, action = VIEW)
    public Result<CpmWorklogDto.ReportVO> report(@RequestParam(defaultValue = CpmConstants.PERIOD_WEEK) String periodType,
                                                 @RequestParam(required = false) String start,
                                                 HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.report(periodType, start));
    }

    /* ==================== 本地台账一次性导入 ==================== */

    @PostMapping("/import-local")
    @RequirePermission(menu = MY, action = EDIT)
    public Result<CpmWorklogDto.ImportResultVO> importLocal(@RequestBody @Valid CpmWorklogDto.ImportForm form,
                                                            HttpServletResponse response) {
        noStore(response);
        return Result.success("已導入", worklogService.importLocal(form));
    }

    private void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
    }
}
