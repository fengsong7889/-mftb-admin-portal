package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * V0 §八 V0-6：AI 通知投递日志查询接口（复用 ai-operation-auth 菜单权限）。
 */
@RestController
@RequestMapping("/api/agent/delivery-log")
@RequiredArgsConstructor
public class AiDeliveryLogController {

    private final AiDeliveryLogService deliveryLogService;

    @GetMapping
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "分页查询 AI 通知投递日志")
    public Result<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String toolKey,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String caller) {
        return Result.success(deliveryLogService.query(page, size, toolKey, status, caller));
    }
}
