package com.mftb.admin.controller;

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
 * MCP 外部工具統一執行網關
 * 權限模型：登錄即可（對話用戶使用「已安裝」的外部服務，安裝本身是管理員行為）；
 * 高風險執行由前端人工確認（AI 操作授權 L3）+ 服務端校驗 installed/source + 日誌留痕兜底
 */
@RestController
@RequestMapping("/api/mcp")
@RequiredArgsConstructor
public class McpExecController {

    private final McpExecService mcpExecService;

    @PostMapping("/exec")
    @Operation(summary = "外部工具統一執行（前端人工確認後轉發，登錄即可）")
    public Result<String> exec(@RequestBody McpExecRequest request) {
        return Result.success(mcpExecService.execute(request.getToolKey(), request.getArgs()));
    }
}
