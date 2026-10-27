package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.HrAuditVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 人事操作审计查询接口（方案 §5.5「新增人事操作审计」）。
 * <p>
 * 授权用独立动作 {@code auditView} 而不是复用 {@code view}：审计里含敏感字段的脱敏前后值
 * 与「谁动过谁」的关系图，能看花名册的人不该自动能看稽核史（§7.3「未显式授权默认拒绝」）。
 * <p>
 * 值在<b>写入时</b>就已脱敏（见 {@code HrAuditServiceImpl}），所以这里不需要再做二次脱敏，
 * 也不提供取原值的开关 —— 审计表本身就不该持有明文副本。
 */
@Tag(name = "人事操作审计")
@RestController
@RequestMapping("/api/hr/audit")
@RequiredArgsConstructor
public class HrAuditController {

    private final HrAuditService hrAuditService;

    @Operation(summary = "人事操作审计分页查询")
    @GetMapping
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_AUDIT_VIEW)
    public Result<PageResult<HrAuditVO>> query(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long pageSize) {
        return Result.success(hrAuditService.query(userId, action, operator, from, to, page, pageSize));
    }

    @Operation(summary = "审计动作码清单（供界面渲染下拉与文案映射）")
    @GetMapping("/actions")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_AUDIT_VIEW)
    public Result<List<String>> actions() {
        return Result.success(HrAuditAction.ALL_ACTIONS.stream().sorted().toList());
    }
}
