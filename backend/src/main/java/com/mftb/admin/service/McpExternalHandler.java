package com.mftb.admin.service;

import java.util.Map;

/**
 * MCP 外部服务执行器（后端侧 tools/call 路由表的一项）。
 * <p>新增 {@link #execute(Map, ToolCallContext)} 默认重载：AI 网关向 handler 传递调用者身份、
 * 会话关联等上下文，供 handler 记录投递日志；未 override 的实现继续走 {@link #execute(Map)}。
 */
public interface McpExternalHandler {

    /** 对应 mcp_tool.tool_key */
    String toolKey();

    /** 执行外部服务调用，返回给 AI 的结果文本（无上下文场景） */
    String execute(Map<String, Object> args);

    /**
     * 带调用上下文的执行入口。默认实现回退到 {@link #execute(Map)}，
     * 让通知类 handler 可以按需覆盖以记录 caller/会话关联的投递日志。
     */
    default String execute(Map<String, Object> args, ToolCallContext ctx) {
        return execute(args);
    }

    /** 网关传给 handler 的调用上下文（caller / 会话关联 / 请求 ID）。 */
    record ToolCallContext(String caller, Long conversationPk, String conversationId) {}
}
