package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * V0 §B.2 AI 操作授权（工具执行策略 + 审计日志）。
 * 菜单 ai-operation-auth 的 view 权限管读取，edit 权限管保存。
 */
@RestController
@RequestMapping("/api/ai/tool-policy")
@RequiredArgsConstructor
public class AiToolPolicyController {

    private final AiToolPolicyService policyService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "工具执行策略列表")
    public Result<List<AiToolPolicy>> list() {
        return Result.success(policyService.listAll());
    }

    @GetMapping("/{toolKey}")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "工具执行策略详情")
    public Result<AiToolPolicy> detail(@PathVariable String toolKey) {
        return Result.success(policyService.find(toolKey));
    }

    @PutMapping("/{toolKey}")
    @RequirePermission(menu = "ai-operation-auth", action = "edit")
    @Operation(summary = "更新或创建工具执行策略")
    public Result<AiToolPolicy> save(@PathVariable String toolKey, @RequestBody AiToolPolicy body) {
        body.setToolKey(toolKey);
        return Result.success(policyService.save(body, operatorResolver.currentOperatorName()));
    }

    @PatchMapping("/{toolKey}/toggle")
    @RequirePermission(menu = "ai-operation-auth", action = "edit")
    @Operation(summary = "启用/停用工具（网关侧 5s 内生效）")
    public Result<AiToolPolicy> toggle(@PathVariable String toolKey, @RequestParam int enabled) {
        AiToolPolicy current = policyService.find(toolKey);
        if (current == null) {
            current = new AiToolPolicy();
            current.setToolKey(toolKey);
            current.setEnabled(enabled);
            current.setRiskLevel("low");
            current.setRequireApproval(0);
        } else {
            current.setEnabled(enabled);
        }
        return Result.success(policyService.save(current, operatorResolver.currentOperatorName()));
    }

    @GetMapping("/exec-logs")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "分页查询工具执行审计日志")
    public Result<Map<String, Object>> execLogs(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String toolKey,
            @RequestParam(required = false) String caller) {
        return Result.success(policyService.queryExecLogs(page, size, toolKey, caller));
    }
}
