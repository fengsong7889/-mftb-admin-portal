package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.dto.LlmUsageRecordVO;
import com.mftb.admin.dto.LlmUsageSummaryVO;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.LlmUsageService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.util.JsonUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * AI 助手使用统计接口
 * - 记录接口供开发环境 LLM 代理回传（账号取自 JWT，防止冒用他人身份记账）
 * - 汇总/明细涉及全员消耗数据，仅管理员或获授「使用統計」菜单权限的账号可访问（与前端可见性一致）
 */
@RestController
@RequestMapping("/api/llm-usage")
@RequiredArgsConstructor
public class LlmUsageController {

    /** 本菜单的 menu_key（与 DataInitializer 种子、前端权限配置一致） */
    private static final String MENU_KEY_USAGE_STATS = "ai_usage_stats";

    private final LlmUsageService llmUsageService;
    private final RoleService roleService;
    private final DepartmentService departmentService;

    /** 上报一次 LLM 调用用量（任何已登录账号，仅记录自己） */
    @PostMapping
    public Result<Void> record(@Valid @RequestBody LlmUsageRecordRequest request) {
        String username = currentUsername();
        if (username == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        llmUsageService.record(username, request);
        return Result.success();
    }

    /** 查询范围内的消耗汇总（按模型/按用户聚合，金额按币种分组） */
    @GetMapping("/summary")
    public Result<LlmUsageSummaryVO> summary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String username) {
        if (!canViewStats()) {
            return Result.error(ResultCode.FORBIDDEN);
        }
        return Result.success(llmUsageService.summary(startDate, endDate, username));
    }

    /** 分页查询用量明细 */
    @GetMapping("/records")
    public Result<PageResult<LlmUsageRecordVO>> records(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String username,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        if (!canViewStats()) {
            return Result.error(ResultCode.FORBIDDEN);
        }
        return Result.success(llmUsageService.records(page, size, username, startDate, endDate));
    }

    /** 当前登录账号（JWT 认证后由过滤器写入 SecurityContext） */
    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
    }

    /**
     * 是否可查看全员消耗统计：管理员（role=admin）或被授予「使用統計」菜单权限的账号。
     * 与前端 CONTROLLED_MENU_KEYS 的可见性判定保持一致，避免看得到菜单却 403。
     */
    private boolean canViewStats() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getDetails() instanceof SysUser user)) {
            return false;
        }
        if ("admin".equals(user.getRole())) {
            return true;
        }
        List<MenuPermissionDTO> rolePerms = roleService.mergePermissions(JsonUtils.parseLongList(user.getFunctionRoles()));
        List<MenuPermissionDTO> deptPerms = departmentService.permissionsOf(user.getDepartmentId());
        return hasMenuKey(rolePerms) || hasMenuKey(deptPerms);
    }

    private boolean hasMenuKey(List<MenuPermissionDTO> permissions) {
        if (permissions == null) {
            return false;
        }
        return permissions.stream().anyMatch(p ->
                MENU_KEY_USAGE_STATS.equals(p.getMenuKey())
                        && p.getActions() != null && !p.getActions().isEmpty());
    }
}
