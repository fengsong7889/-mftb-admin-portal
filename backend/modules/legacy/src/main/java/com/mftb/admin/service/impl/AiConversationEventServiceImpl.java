package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiConversationEvent;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.mapper.AiConversationMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.springframework.util.StringUtils;
import com.mftb.admin.mapper.AiConversationEventMapper;
import com.mftb.admin.service.AiConversationEventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 会话执行事件的落库实现，契约见 {@link AiConversationEventService}。
 * <p>
 * 协作依赖：AiConversationEventMapper, ObjectMapper。
 */

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
    private final AiConversationMapper conversationMapper;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;

    @Override
    public String requireOwned(Long conversationPk, String actor) {
        AiConversation conversation = owned(conversationPk, actor);
        return conversation == null ? null : conversation.getConversationId();
    }

    private AiConversation owned(Long conversationPk, String actor) {
        String account = operatorResolver.currentOperatorAccount();
        SysUser user = operatorResolver.currentUser();
        if (!StringUtils.hasText(account) || !account.equals(actor) || user == null
                || !account.equals(user.getUsername()) || !Integer.valueOf(1).equals(user.getStatus())) {
            throw new BusinessException(401, "登入身分不可用");
        }
        if (conversationPk == null) return null;
        AiConversation conversation;
        try {
            conversation = conversationMapper.selectById(conversationPk);
        } catch (RuntimeException e) {
            throw new BusinessException(503, "無法確認會話歸屬");
        }
        if (conversation == null || !account.equals(conversation.getUsername())
                || Integer.valueOf(1).equals(conversation.getDeleted())) {
            throw new BusinessException(403, "會話不存在或無權操作");
        }
        return conversation;
    }

    @Override
    public AiConversationEvent append(Long conversationPk, String conversationNo, String eventType,
                                       String actor, Map<String, Object> payload) {
        if (conversationPk == null) {
            throw new IllegalArgumentException("conversationPk 不能为空");
        }
        AiConversation conversation = owned(conversationPk, actor);
        if (conversationNo != null && !conversationNo.equals(conversation.getConversationId())) {
            throw new BusinessException(400, "會話編號不一致");
        }
        String type = eventType == null ? null : eventType.toUpperCase(java.util.Locale.ROOT);
        if (type == null || !ALLOWED_TYPES.contains(type)) {
            throw new IllegalArgumentException("非法事件类型: " + eventType);
        }
        AiConversationEvent row = new AiConversationEvent();
        row.setConversationPk(conversationPk);
        row.setConversationNo(conversation.getConversationId());
        row.setEventType(type);
        row.setActor(actor);
        row.setPayloadJson(serialize(payload));
        try {
            eventMapper.insert(row);
        } catch (RuntimeException e) {
            log.error("會話審計寫入失敗 type={}", e.getClass().getSimpleName());
            throw new BusinessException(503, "會話審計寫入失敗，請勿自動重試操作");
        }
        return row;
    }

    @Override
    public List<AiConversationEvent> listByConversation(Long conversationPk, int limit) {
        SysUser user = operatorResolver.currentUser();
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())
                || !permissionService.hasSystemAccess(user, "ai")
                || !permissionService.hasPermission(user, "ai-conversation-audit", "view")) {
            throw new BusinessException(403, "無權查看會話審計");
        }
        if (conversationPk == null) throw new BusinessException(400, "缺少會話編號");
        return eventMapper.selectList(new LambdaQueryWrapper<AiConversationEvent>()
                .eq(AiConversationEvent::getConversationPk, conversationPk)
                .orderByAsc(AiConversationEvent::getId)
                .last("LIMIT " + Math.max(1, Math.min(limit, 500))));
    }

    private String serialize(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) return null;
        try {
            Map<String, Object> safe = new java.util.LinkedHashMap<>(payload);
            // 事件仅存结构化元数据，正文／上游错误原文不进入不可变审计。
            safe.keySet().removeAll(Set.of("preview", "content", "messages", "error"));
            return objectMapper.writeValueAsString(safe);
        } catch (JsonProcessingException e) {
            throw new BusinessException(503, "會話審計內容無法處理");
        }
    }
}
