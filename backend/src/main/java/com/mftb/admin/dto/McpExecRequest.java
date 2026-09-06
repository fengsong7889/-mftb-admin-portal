package com.mftb.admin.dto;

import lombok.Data;

import java.util.Map;

/** MCP 外部工具統一執行請求（前端人工確認後轉發） */
@Data
public class McpExecRequest {

    /** 外部服務標識（mcp_tool.tool_key） */
    private String toolKey;

    /** 工具參數（模型生成的 arguments） */
    private Map<String, Object> args;
}
