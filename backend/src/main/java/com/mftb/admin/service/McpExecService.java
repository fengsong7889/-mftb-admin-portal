package com.mftb.admin.service;

import java.util.Map;

/** MCP 外部工具統一執行網關 */
public interface McpExecService {

    /**
     * 執行外部服務調用（前端人工確認後轉發）
     *
     * @param toolKey 外部服務標識（mcp_tool.tool_key）
     * @param args    模型生成的工具參數
     * @return 執行結果文本（回傳給 AI 生成最終回覆）
     */
    String execute(String toolKey, Map<String, Object> args);
}
