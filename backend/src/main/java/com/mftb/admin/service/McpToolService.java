package com.mftb.admin.service;

import com.mftb.admin.entity.McpTool;

import java.util.List;

/**
 * MCP 工具服务：广场列表 / 已安装 manifest / 安装与卸载
 */
public interface McpToolService {

    /** 广场列表：全部上架且启用的工具（含安装状态），按 sort 升序 */
    List<McpTool> listTools();

    /** 已安装工具 manifest（AI 助手动态拉取，登录即可） */
    List<McpTool> listInstalled();

    /** 安装工具（幂等），记录安装人与安装时间 */
    void install(String toolKey, String operator);

    /** 卸载工具（幂等），清空安装人与安装时间 */
    void uninstall(String toolKey);
}
