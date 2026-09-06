package com.mftb.admin.service;

import com.mftb.admin.entity.McpTool;

import java.util.List;

/**
 * MCP 工具服務：廣場列表 / 已安裝 manifest / 安裝與卸載
 */
public interface McpToolService {

    /** 廣場列表：全部上架且啟用的工具（含安裝狀態），按 sort 升序 */
    List<McpTool> listTools();

    /** 已安裝工具 manifest（AI 助手動態拉取，登錄即可） */
    List<McpTool> listInstalled();

    /** 安裝工具（冪等），記錄安裝人與安裝時間 */
    void install(String toolKey, String operator);

    /** 卸載工具（冪等），清空安裝人與安裝時間 */
    void uninstall(String toolKey);
}
