package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiRuntimeSettingService;
import com.mftb.admin.service.agent.AiUserMemoryService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 记忆策略与统计：运营可调上限/保留期/注入条数，并看到当前记忆体量。
 *
 * <p>{@code /settings} 也会返回未落库的默认值（defaultValue），避免页面把“没配”显示成空。
 */
@RestController
@RequestMapping("/api/ai/prompt-config")
@RequiredArgsConstructor
public class AiRuntimeSettingController {

    private static final String MENU = "ai-assistant-memory";

    private final AiRuntimeSettingService settingService;
    private final AiUserMemoryService memoryService;

    @GetMapping("/settings")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "AI 運行參數（記憶策略）")
    public Result<List<Map<String, Object>>> settings() {
        return Result.success(settingService.list());
    }

    @PutMapping("/settings")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "保存 AI 運行參數")
    public Result<Void> save(@RequestBody Map<String, String> values) {
        settingService.save(values);
        return Result.success();
    }

    @GetMapping("/memory-stats")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "長期記憶統計")
    public Result<Map<String, Object>> memoryStats() {
        return Result.success(memoryService.stats());
    }
}
