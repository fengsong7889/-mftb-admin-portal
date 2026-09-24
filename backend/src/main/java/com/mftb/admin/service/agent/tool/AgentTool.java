package com.mftb.admin.service.agent.tool;

import java.util.Map;

/**
 * V0 §B.1 后端内建工具契约：orchestration 循环按 toolKey 路由到具体实现。
 * <p>与 {@link com.mftb.admin.service.McpExternalHandler} 的区别：MCP handler 面向「外部服务」，
 * 需要 mcp_tool.installed=1 + ai_tool_policy 白名单 + 审批凭证；本接口面向「内置只读查询」，
 * 直接调对应 Service，不经过 MCP 网关。权限仍走调用者 JWT + Service 内部数据范围。
 */
public interface AgentTool {

    /** 与前端 mcp_tool.tool_key / ai_tool_policy.tool_key 对齐 */
    String toolKey();

    /** 下发给模型的 function schema（OpenAI Chat Tool 语义） */
    Map<String, Object> schema();

    /** 描述（用于 System Prompt 能力清单拼接） */
    String description();

    /**
     * 执行工具。返回值必须为字符串（作为 role=tool 消息 content 回填给 LLM）；
     * 失败也返回 JSON 字符串 {@code {"error": "..."}}，不抛，让 LLM 自行处理。
     */
    String execute(Map<String, Object> args, ToolCallContext ctx);

    /** 工具执行上下文：caller 与请求关联的会话主键。 */
    record ToolCallContext(String caller, Long conversationPk) {}
}
