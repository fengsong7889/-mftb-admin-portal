package com.mftb.admin.dto;

import lombok.Data;

import java.util.Map;

/** MCP 外部工具统一执行请求（前端人工确认后转发） */
@Data
public class McpExecRequest {

    /** 外部服务标识（mcp_tool.tool_key） */
    private String toolKey;

    /** 工具参数（模型生成的 arguments） */
    private Map<String, Object> args;
}
