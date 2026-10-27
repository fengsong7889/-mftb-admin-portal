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

    /** 可选：会话编号（DHxxxx），写入审计日志供后续回溯 */
    private String conversationId;

    /** 可选：会话主键（ai_conversation.id），不为空时同步写 ai_conversation_event（V0 §B.6） */
    private Long conversationPk;

    /** 可选：工具级审批凭证（ai_tool_policy.require_approval=1 时必传），V0 为 L3 弹窗一次性 token */
    private String approvalToken;
}
