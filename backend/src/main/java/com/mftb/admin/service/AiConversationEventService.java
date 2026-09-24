package com.mftb.admin.service;

import com.mftb.admin.entity.AiConversationEvent;

import java.util.List;
import java.util.Map;

/**
 * AI 会话执行事件（V0 §B.6）：服务端追加写；不接受任何外部 PUT/DELETE。
 * 事件由 Agent 网关、策略引擎、审计切面在同一事务或 fire-and-forget 落库；
 * 前端只读，用于「运行与安全审计」详情页展示。
 */
public interface AiConversationEventService {

    /** 追加一条事件；payloadJson 需已脱敏。 */
    AiConversationEvent append(Long conversationPk, String conversationNo, String eventType,
                                String actor, Map<String, Object> payload);

    /** 按会话编号升序读取事件；用于审计详情。 */
    List<AiConversationEvent> listByConversation(Long conversationPk, int limit);
}
