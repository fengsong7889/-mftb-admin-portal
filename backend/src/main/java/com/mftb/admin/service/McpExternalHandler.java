package com.mftb.admin.service;

import java.util.Map;

/**
 * MCP 外部服務執行器（後端側 tools/call 路由表的一項）
 * 每個已接入執行鏈路的外部服務實現本接口，McpExecService 按 toolKey 路由；
 * 將來接入第三方 MCP Server 時，增加一個協議轉發實現即可，前端與廣場零改動
 */
public interface McpExternalHandler {

    /** 對應 mcp_tool.tool_key */
    String toolKey();

    /** 執行外部服務調用，返回給 AI 的結果文本 */
    String execute(Map<String, Object> args);
}
