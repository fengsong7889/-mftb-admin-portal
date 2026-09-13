package com.mftb.admin.service;

import java.util.Map;

/**
 * MCP 外部服务执行器（后端侧 tools/call 路由表的一项）
 * 每个已接入执行链路的外部服务实现本接口，McpExecService 按 toolKey 路由；
 * 将来接入第三方 MCP Server 时，增加一个协议转发实现即可，前端与广场零改动
 */
public interface McpExternalHandler {

    /** 对应 mcp_tool.tool_key */
    String toolKey();

    /** 执行外部服务调用，返回给 AI 的结果文本 */
    String execute(Map<String, Object> args);
}
