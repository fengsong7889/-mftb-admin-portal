package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.McpExecRequest;
import com.mftb.admin.service.McpExecService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * MCP 外部工具统一执行网关
 * 安全加固: 需 ai-mcp-service 菜单权限方可调用（R-24 安全审计修复）
 * 高风险执行由前端人工确认（AI 操作授权 L3）+ 服务端校验 installed/source + 日志留痕兜底
 */
@RestController
@RequestMapping("/api/mcp")
@RequiredArgsConstructor
public class McpExecController {

    private final McpExecService mcpExecService;

    @PostMapping("/exec")
    @RequirePermission(menu = "ai-mcp-service")
    @Operation(summary = "外部工具統一執行（需 ai-mcp-service 權限）")
    public Result<String> exec(@RequestBody McpExecRequest request) {
        return Result.success(mcpExecService.execute(request.getToolKey(), request.getArgs()));
    }
}
