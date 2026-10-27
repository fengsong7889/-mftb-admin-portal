-- 190: V0 Sprint 1 企业治理底座（ai_tool_policy / ai_tool_exec_log / ai_budget_ledger / ai_grant_log / ai_conversation_event + ai_employee_auth.capability_json + biz_llm_usage.verification_status）
-- 与 AiGovernanceSchemaInitializer.java 一一对应；本文件为参考文档，实际幂等执行由 Java 负责。

CREATE TABLE IF NOT EXISTS ai_tool_policy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    tool_key VARCHAR(64) NOT NULL COMMENT '工具唯一标识（mcp_tool.tool_key 对应）',
    enabled TINYINT NOT NULL DEFAULT 0 COMMENT '1=允许执行 0=禁止执行（默认拒绝）',
    risk_level VARCHAR(8) NOT NULL DEFAULT 'low' COMMENT 'low/medium/high',
    require_approval TINYINT NOT NULL DEFAULT 0 COMMENT '1=调用需审批凭证 0=仅需工具级授权',
    data_scope_json TEXT DEFAULT NULL COMMENT '数据范围白名单 JSON（{"groupCodes":[],"brand":[],"fields":[]}）',
    remark VARCHAR(255) DEFAULT NULL COMMENT '策略备注',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_ai_tool_policy_key (tool_key)
) COMMENT='AI 工具执行授权策略（V0 治理底座：工具级放行/风险/审批/数据范围）';

CREATE TABLE IF NOT EXISTS ai_tool_exec_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    tool_key VARCHAR(64) NOT NULL COMMENT '工具标识',
    caller VARCHAR(64) DEFAULT NULL COMMENT '调用账号（JWT）',
    conversation_id VARCHAR(64) DEFAULT NULL COMMENT '关联会话编号',
    args_digest VARCHAR(255) DEFAULT NULL COMMENT '参数摘要（SHA-256 前 16 位，不落敏感原文）',
    decision VARCHAR(16) NOT NULL COMMENT 'allow/reject/approval_required',
    reject_reason VARCHAR(255) DEFAULT NULL COMMENT '被拒原因',
    elapsed_ms BIGINT DEFAULT NULL COMMENT '执行耗时',
    success TINYINT DEFAULT NULL COMMENT '1=成功 0=失败（仅 decision=allow 时有值）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    KEY idx_tool_exec_key_time (tool_key, created_at),
    KEY idx_tool_exec_caller (caller)
) COMMENT='AI 工具执行审计日志（V0 治理底座：记录 caller/decision/耗时）';

CREATE TABLE IF NOT EXISTS ai_budget_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    username VARCHAR(64) NOT NULL COMMENT '预占账号',
    model_key VARCHAR(64) DEFAULT NULL COMMENT '目标模型标识（NULL=未路由）',
    request_id VARCHAR(64) NOT NULL COMMENT '一次请求唯一 ID（幂等键）',
    reservation_tokens INT NOT NULL DEFAULT 0 COMMENT '预估 tokens 数（prompt+completion 上限）',
    reserved_cost DECIMAL(14,6) NOT NULL DEFAULT 0 COMMENT '预估费用（按币种）',
    actual_tokens INT DEFAULT NULL COMMENT '结算 tokens 数',
    actual_cost DECIMAL(14,6) DEFAULT NULL COMMENT '结算费用',
    currency VARCHAR(8) DEFAULT NULL COMMENT '币种 CNY/USD',
    status VARCHAR(16) NOT NULL DEFAULT 'RESERVED' COMMENT 'RESERVED/SETTLED/RELEASED',
    verification_status VARCHAR(16) NOT NULL DEFAULT 'ESTIMATED' COMMENT 'VERIFIED/ESTIMATED/UNKNOWN',
    error_message VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_budget_request (request_id),
    KEY idx_budget_user_time (username, created_at)
) COMMENT='AI 预算流水（V0 网关侧预占/结算/释放）';

CREATE TABLE IF NOT EXISTS ai_grant_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    flow_no VARCHAR(64) NOT NULL COMMENT 'OA 流程编号（幂等键）',
    request_id BIGINT DEFAULT NULL COMMENT 'OaRequest 主键',
    user_id BIGINT NOT NULL COMMENT '被授予员工 ID',
    username VARCHAR(64) NOT NULL COMMENT '被授予员工账号',
    grant_type VARCHAR(32) NOT NULL COMMENT 'model_auth / quota',
    payload_json TEXT NOT NULL COMMENT '发放内容 JSON（模型 ID 列表 / 额度维度）',
    status VARCHAR(16) NOT NULL DEFAULT 'GRANTED' COMMENT 'GRANTED/FAILED/REVOKED',
    error_message VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
    operator VARCHAR(64) DEFAULT NULL COMMENT '操作人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_grant_flow (flow_no),
    KEY idx_grant_user (user_id, created_at)
) COMMENT='AI 使用申请审批发放幂等日志（防重放）';

CREATE TABLE IF NOT EXISTS ai_conversation_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    conversation_pk BIGINT NOT NULL COMMENT 'ai_conversation.id',
    conversation_no VARCHAR(64) DEFAULT NULL COMMENT '会话编号（DHxxxx）',
    event_type VARCHAR(32) NOT NULL COMMENT 'USER_TURN/ASSISTANT_TURN/TOOL_CALL/TOOL_RESULT/POLICY_DECISION/QUOTA_CHARGE/GATEWAY_ERROR',
    actor VARCHAR(64) DEFAULT NULL COMMENT '触发账号（本人或系统）',
    payload_json MEDIUMTEXT DEFAULT NULL COMMENT '事件载荷（脱敏后）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '事件时间',
    KEY idx_conv_event_pk (conversation_pk, created_at),
    KEY idx_conv_event_type (event_type)
) COMMENT='AI 会话执行事件（服务端追加，客户端不可覆写）';
