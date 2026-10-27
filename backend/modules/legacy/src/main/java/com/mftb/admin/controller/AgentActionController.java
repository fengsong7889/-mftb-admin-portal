package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.agent.AgentActionResult;
import com.mftb.admin.dto.agent.AgentPendingAction;
import com.mftb.admin.service.agent.AgentActionService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 助手待确认动作：确认发送 / 取消 / 查询状态。
 *
 * <p>确认接口绑定「項目總覽 > 推送」动作：前端确认按钮不是安全边界，
 * 服务端仍会再次校验 owner、过期、项目可见性与渠道配置。
 */
@RestController
@RequestMapping("/api/agent/actions")
@RequiredArgsConstructor
public class AgentActionController {

    private final AgentActionService actionService;

    @PostMapping("/{id}/confirm")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = RdmConstants.ACTION_NOTIFY)
    @Operation(summary = "確認並發送 AI 助手待確認動作")
    public Result<AgentActionResult> confirm(@PathVariable Long id) {
        return Result.success(actionService.confirm(id));
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "取消 AI 助手待確認動作")
    public Result<AgentPendingAction> cancel(@PathVariable Long id) {
        return Result.success(actionService.cancel(id));
    }

    @GetMapping("/{id}")
    @Operation(summary = "查詢 AI 助手待確認動作狀態")
    public Result<AgentPendingAction> get(@PathVariable Long id) {
        return Result.success(actionService.get(id));
    }
}
