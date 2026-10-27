package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 会话执行事件（服务端追加写；客户端不可覆写）。
 * <p>
 * 事件类型：USER_TURN / ASSISTANT_TURN / TOOL_CALL / TOOL_RESULT /
 * POLICY_DECISION / QUOTA_CHARGE / GATEWAY_ERROR。
 */
@Data
@TableName("ai_conversation_event")
public class AiConversationEvent {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long conversationPk;
    private String conversationNo;
    private String eventType;
    private String actor;
    /** 事件载荷（脱敏 JSON） */
    private String payloadJson;
    private LocalDateTime createdAt;
}
