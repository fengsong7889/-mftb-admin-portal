package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiConfigAuditService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * AI 配置变更审计：只读。
 *
 * <p>审计页只展示记录，不提供“从审计回滚”：回滚属于各配置页的写权限，
 * 否则一个只读审计角色可以借审计页间接改配置。
 */
@RestController
@RequestMapping("/api/ai/prompt-config")
@RequiredArgsConstructor
public class AiConfigAuditController {

    private final AiConfigAuditService auditService;

    @GetMapping("/changes")
    @RequirePermission(menu = "ai-assistant-audit", action = "view")
    @Operation(summary = "配置變更審計列表")
    public Result<Map<String, Object>> changes(
            @RequestParam(required = false) String configType,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(auditService.page(configType, action, operator, keyword, from, to, page, size));
    }
}
