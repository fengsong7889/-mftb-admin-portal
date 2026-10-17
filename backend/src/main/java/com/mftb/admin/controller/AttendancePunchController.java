package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendancePunchImportRow;
import com.mftb.admin.dto.AttendancePunchVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSyncService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 打卡记录接口。
 * <p>
 * 只有查询、导入与同步三类动作，没有任何修改/删除端点：原始打卡是账本，
 * 修正必须走异常处理发起流程，由重算回写判定结果。
 */
@RestController
@RequestMapping("/api/attendance/punches")
@RequiredArgsConstructor
public class AttendancePunchController {

    private final AttendancePunchService punchService;
    private final AttendanceSyncService syncService;

    /** 分页列表 */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_PUNCH)
    public Result<PageResult<AttendancePunchVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) Integer source,
            @RequestParam(required = false) Integer result,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortOrder) {
        return Result.success(punchService.page(page, size, from, to, keyword, groupId, deptId, source, result, sortField, sortOrder));
    }

    /** 与列表同口径的统计 */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_PUNCH)
    public Result<Map<String, Object>> stats(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) Integer source,
            @RequestParam(required = false) Integer result) {
        return Result.success(punchService.stats(from, to, keyword, groupId, deptId, source, result));
    }

    /** 手工导入打卡（前端解析文件后提交结构化行） */
    @PostMapping("/import")
    @RequirePermission(menu = AttendanceConstants.MENU_PUNCH, action = "import")
    public Result<Map<String, Object>> importRows(@RequestBody List<AttendancePunchImportRow> rows) {
        return Result.success("導入完成", punchService.importRows(rows));
    }

    /** 手动触发一次钉钉同步（定时任务之外的补数入口） */
    @PostMapping("/sync")
    @RequirePermission(menu = AttendanceConstants.MENU_PUNCH, action = "import")
    public Result<Map<String, Object>> sync(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long groupId) {
        return Result.success("同步完成", syncService.sync(from, to, groupId));
    }
}
