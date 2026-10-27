package com.mftb.admin.service;

import java.util.Map;

/** MCP 外部工具统一执行网关 */
public interface McpExecService {

    /**
     * 执行外部服务调用（前端人工确认后转发）
     *
     * @param toolKey 外部服务标识（mcp_tool.tool_key）
     * @param args    模型生成的工具参数
     * @return 执行结果文本（回传给 AI 生成最终回复）
     */
    String execute(String toolKey, Map<String, Object> args);
}
