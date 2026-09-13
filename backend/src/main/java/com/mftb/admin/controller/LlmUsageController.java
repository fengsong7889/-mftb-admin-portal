package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.dto.LlmUsageRecordVO;
import com.mftb.admin.dto.LlmUsageSummaryVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.LlmUsageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
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

/**
 * AI 助手使用统计接口
 * - 记录接口供开发环境 LLM 代理回传（账号取自 JWT，防止冒用他人身份记账）
 * - 汇总/明细涉及全员消耗数据，仅管理员或获授「使用统计」菜单权限的账号可访问（与前端可见性一致）
 */
@RestController
@RequestMapping("/api/llm-usage")
@RequiredArgsConstructor
public class LlmUsageController {

    private final LlmUsageService llmUsageService;

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
    @RequirePermission(menu = "ai_usage_stats", action = "view")
    public Result<LlmUsageSummaryVO> summary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String username) {
        return Result.success(llmUsageService.summary(startDate, endDate, username));
    }

    /** 分页查询用量明细 */
    @GetMapping("/records")
    @RequirePermission(menu = "ai_usage_stats", action = "view")
    public Result<PageResult<LlmUsageRecordVO>> records(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") @Max(200) long size,
            @RequestParam(required = false) String username,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return Result.success(llmUsageService.records(page, size, username, startDate, endDate));
    }

    /** 当前登录账号（JWT 认证后由过滤器写入 SecurityContext） */
    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
    }

}
