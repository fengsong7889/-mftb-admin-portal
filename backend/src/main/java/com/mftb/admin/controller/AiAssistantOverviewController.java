package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiAssistantOverviewService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** AI 助手概览：只返回当前用户有权限的模块计数。 */
@RestController
@RequestMapping("/api/ai/prompt-config")
@RequiredArgsConstructor
public class AiAssistantOverviewController {

    private final AiAssistantOverviewService overviewService;

    @GetMapping("/overview")
    @RequirePermission(menu = "ai-assistant-overview", action = "view")
    @Operation(summary = "AI 助手概覽（按權限收斂）")
    public Result<Map<String, Object>> overview() {
        return Result.success(overviewService.overview());
    }
}
