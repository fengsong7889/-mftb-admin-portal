-- 191: V0 §八 V0-6 通知送达状态回填（AI 工具向外部渠道发起的通知，记录每次投递的受理状态）
CREATE TABLE IF NOT EXISTS ai_delivery_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    tool_key VARCHAR(64) NOT NULL COMMENT '工具标识（dingtalk_sender / email_sender / 未来 wecom_sender 等）',
    channel VARCHAR(32) NOT NULL COMMENT '渠道：dingtalk/email/wecom',
    caller VARCHAR(64) DEFAULT NULL COMMENT '发起账号（AI 助手调用者）',
    conversation_pk BIGINT DEFAULT NULL COMMENT '关联 ai_conversation.id（无会话上下文时为空）',
    conversation_id VARCHAR(64) DEFAULT NULL COMMENT '关联会话编号 DHxxxx',
    recipient_summary VARCHAR(255) DEFAULT NULL COMMENT '收件目标脱敏摘要（邮件到 xxx@yyy；钉钉群 channel.name）',
    subject_preview VARCHAR(255) DEFAULT NULL COMMENT '标题/内容前 100 字（供审计快速识别）',
    status VARCHAR(16) NOT NULL COMMENT 'SENT=渠道已受理 / FAILED=渠道或网络失败 / UNKNOWN=异步提交未确认',
    external_errcode VARCHAR(32) DEFAULT NULL COMMENT '渠道返回码（钉钉 errcode / SMTP 响应码等）',
    error_message VARCHAR(512) DEFAULT NULL COMMENT '错误摘要（不含堆栈）',
    attempts INT NOT NULL DEFAULT 1 COMMENT '本次投递尝试次数（预留重试计数）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_delivery_tool_time (tool_key, created_at),
    KEY idx_delivery_status (status, created_at),
    KEY idx_delivery_conv (conversation_pk)
) COMMENT='AI 通知外部投递结果日志（V0 §八 V0-6）';
