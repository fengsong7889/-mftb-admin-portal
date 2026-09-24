package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiConversationEvent;
import com.mftb.admin.mapper.AiConversationEventMapper;
import com.mftb.admin.service.AiConversationEventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiConversationEventServiceImpl implements AiConversationEventService {

    /** 允许的 event_type 白名单，防止外部传入未知类型污染审计维度。 */
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "USER_TURN", "ASSISTANT_TURN", "TOOL_CALL", "TOOL_RESULT",
            "POLICY_DECISION", "QUOTA_CHARGE", "GATEWAY_ERROR");

    private final AiConversationEventMapper eventMapper;
    private final ObjectMapper objectMapper;

    @Override
    public AiConversationEvent append(Long conversationPk, String conversationNo, String eventType,
                                       String actor, Map<String, Object> payload) {
        if (conversationPk == null) {
            throw new IllegalArgumentException("conversationPk 不能为空");
        }
        String type = eventType == null ? null : eventType.toUpperCase();
        if (type == null || !ALLOWED_TYPES.contains(type)) {
            throw new IllegalArgumentException("非法事件类型: " + eventType);
        }
        AiConversationEvent row = new AiConversationEvent();
        row.setConversationPk(conversationPk);
        row.setConversationNo(conversationNo);
        row.setEventType(type);
        row.setActor(actor);
        row.setPayloadJson(serialize(payload));
        eventMapper.insert(row);
        return row;
    }

    @Override
    public List<AiConversationEvent> listByConversation(Long conversationPk, int limit) {
        return eventMapper.selectList(new LambdaQueryWrapper<AiConversationEvent>()
                .eq(AiConversationEvent::getConversationPk, conversationPk)
                .orderByAsc(AiConversationEvent::getId)
                .last("LIMIT " + Math.max(1, Math.min(limit, 500))));
    }

    private String serialize(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.warn("事件载荷序列化失败，落 null: {}", e.getMessage());
            return null;
        }
    }
}
