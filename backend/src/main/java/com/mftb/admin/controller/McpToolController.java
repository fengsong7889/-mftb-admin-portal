package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.service.McpToolService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * MCP 工具控制器
 * 廣場管「接入」：工具列表、安裝/卸載、已安裝 manifest 下發（AI 助手動態拉取）
 */
@RestController
@RequestMapping("/api/mcp/tools")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - MCP 服務", description = "MCP 工具廣場：接入層的安裝與卸載管理")
public class McpToolController {

    private static final String MENU = "ai-mcp-service";

    private final McpToolService mcpToolService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @Operation(summary = "廣場列表（全部上架工具含安裝狀態）")
    @RequirePermission(menu = MENU)
    public Result<List<McpTool>> listTools() {
        return Result.success(mcpToolService.listTools());
    }

    @GetMapping("/installed")
    @Operation(summary = "已安裝工具 manifest（AI 助手動態拉取，登錄即可）")
    public Result<List<McpTool>> listInstalled() {
        return Result.success(mcpToolService.listInstalled());
    }

    @PostMapping("/{toolKey}/install")
    @Operation(summary = "安裝工具（冪等，AI 助手即刻具備該能力）")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> install(@PathVariable String toolKey) {
        String operator = operatorResolver.currentOperatorName();
        mcpToolService.install(toolKey, operator);
        return Result.success(true);
    }

    @DeleteMapping("/{toolKey}/install")
    @Operation(summary = "卸載工具（冪等，AI 助手即刻失去該能力）")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> uninstall(@PathVariable String toolKey) {
        mcpToolService.uninstall(toolKey);
        return Result.success(true);
    }
}
