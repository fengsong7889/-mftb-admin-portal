package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.McpExecRequest;
import com.mftb.admin.service.McpExecService;
import com.mftb.admin.service.impl.McpExecServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * MCP 外部工具统一执行网关
 * V0 §B.2：需 ai-mcp-service 菜单权限 + ai_tool_policy 前置拦截（默认拒绝/启停/审批凭证），执行写审计日志
 */
@RestController
@RequestMapping("/api/mcp")
@RequiredArgsConstructor
public class McpExecController {

    private final McpExecService mcpExecService;

    @PostMapping("/exec")
    @RequirePermission(menu = "ai-mcp-service")
    @Operation(summary = "外部工具統一執行（需 ai-mcp-service 權限 + 工具级授权）")
    public Result<String> exec(@RequestBody McpExecRequest request) {
        if (mcpExecService instanceof McpExecServiceImpl impl) {
            return Result.success(impl.execute(
                    request.getToolKey(), request.getArgs(),
                    request.getApprovalToken(), request.getConversationId(), request.getConversationPk()));
        }
        return Result.success(mcpExecService.execute(request.getToolKey(), request.getArgs()));
    }
}
