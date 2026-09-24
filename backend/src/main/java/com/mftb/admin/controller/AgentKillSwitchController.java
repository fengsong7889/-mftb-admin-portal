package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.service.agent.AiKillSwitchService.Status;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * V0 §八 V0-7 紧急停止入口（管理端）。
 * <p>熔断期间：{@code /api/agent/chat/completions} 返回 503；{@code /api/mcp/exec} 拒绝执行；
 * 5 秒内跨实例收敛；对话历史与配置不受影响，恢复后立即可用。
 */
@RestController
@RequestMapping("/api/agent/kill-switch")
@RequiredArgsConstructor
public class AgentKillSwitchController {

    private final AiKillSwitchService killSwitchService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "查询当前熔断状态")
    public Result<Status> current() {
        return Result.success(killSwitchService.current());
    }

    @PostMapping
    @RequirePermission(menu = "ai-operation-auth", action = "edit")
    @Operation(summary = "切换熔断开关")
    public Result<Status> toggle(@RequestBody ToggleRequest body) {
        killSwitchService.toggle(
                Boolean.TRUE.equals(body.getEngaged()),
                operatorResolver.currentOperatorName(),
                body.getReason());
        return Result.success(killSwitchService.current());
    }

    @Data
    public static class ToggleRequest {
        private Boolean engaged;
        private String reason;
    }
}
