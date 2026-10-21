package com.mftb.admin.service.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AiConversationSummaryVO;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiConversationMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 会话短期记忆：把旧消息真正压缩成摘要，而不是只插一条“已压缩”标记。
 *
 * <p>为什么在服务端做：模型通道、配额与计量都在服务端；前端直连模型既拿不到
 * 统一账本，也会把 Key 暴露到浏览器。
 *
 * <p>边界：
 * <ul>
 *   <li>只摘要“最近 6 条之外”的旧消息；最近 6 条原样保留，避免丢当前上下文；</li>
 *   <li>摘要失败不落库、不伪造；前端提示失败，用户可重试；</li>
 *   <li>摘要文本只保留目标/已确认事实/未完成事项/关键编号，禁止写入权限结论与敏感字段。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationSummaryService {

    private static final int KEEP_RECENT = 6;
    private static final int MAX_TRANSCRIPT_CHARS = 8_000;
    private static final int MAX_MESSAGE_CHARS = 800;
    private static final int MAX_SUMMARY_TOKENS = 500;
    private static final String SYSTEM_PROMPT = """
            你是對話摘要器。把用戶提供的對話壓縮為不超過 300 字的中文摘要，保留：
            用戶目標、已確認的事實、未完成的事項、關鍵編號（需求/項目/迭代）。
            不要編造，不要輸出權限結論、密碼、手機號、郵箱、身份證、銀行卡等敏感信息。
            只輸出摘要正文，不要加標題或解釋。
            """;

    private final AiConversationMapper conversationMapper;
    private final OperatorResolver operatorResolver;
    private final LlmChannelRouter channelRouter;
    private final LlmHttpClient llmClient;
    private final LlmMeteringService metering;
    private final ObjectMapper objectMapper;

    public AiConversationSummaryVO summarize(Long conversationId) {
        SysUser user = operatorResolver.currentUser();
        String account = operatorResolver.currentOperatorAccount();
        if (user == null || !StringUtils.hasText(account)) {
            throw new BusinessException("登錄狀態已失效，請重新登錄");
        }
        AiConversation conv = conversationMapper.selectById(conversationId);
        if (conv == null || !account.equals(conv.getUsername())) {
            throw new BusinessException("會話不存在或無權操作");
        }
        List<Map<String, Object>> messages = parseMessages(conv.getMessages());
        AiConversationSummaryVO vo = new AiConversationSummaryVO();
        vo.setKeptCount(KEEP_RECENT);
        if (messages.size() <= KEEP_RECENT + 1) {
            vo.setCompressed(false);
            vo.setSummary("");
            vo.setCoveredCount(0);
            return vo;
        }
        int covered = messages.size() - KEEP_RECENT;
        String transcript = buildTranscript(messages.subList(0, covered));
        if (!StringUtils.hasText(transcript)) {
            vo.setCompressed(false);
            vo.setSummary("");
            vo.setCoveredCount(0);
            return vo;
        }

        LlmChannelRouter.Channel channel = pickChannel(account);
        if (channel == null) {
            throw new BusinessException("當前賬號沒有可用模型，請聯繫管理員開通後再壓縮會話");
        }
        String requestId = "summary-" + UUID.randomUUID();
        metering.reserve(requestId, account, channel,
                Math.max(1, transcript.length() / 4), MAX_SUMMARY_TOKENS);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", channel.getDefaultModelKey());
            payload.put("temperature", 0.2);
            payload.put("max_tokens", MAX_SUMMARY_TOKENS);
            payload.put("messages", List.of(
                    Map.of("role", "system", "content", SYSTEM_PROMPT),
                    Map.of("role", "user", "content", transcript)));
            JsonNode resp = llmClient.chatCompletion(channel.getBaseUrl(), channel.getApiKey(), payload);
            long tokens = metering.settle(requestId, account, "auto", channel, resp);
            String summary = resp.path("choices").path(0).path("message").path("content").asText("");
            if (!StringUtils.hasText(summary)) {
                metering.release(requestId, "empty_summary");
                throw new BusinessException("摘要生成失敗：模型未返回內容，請稍後重試");
            }
            summary = summary.trim();
            if (summary.length() > 1200) {
                summary = summary.substring(0, 1200) + "…";
            }
            AiConversation update = new AiConversation();
            update.setId(conversationId);
            update.setSummary(summary);
            update.setSummaryMessageCount(covered);
            update.setSummaryUpdatedAt(LocalDateTime.now());
            conversationMapper.updateById(update);

            vo.setCompressed(true);
            vo.setSummary(summary);
            vo.setCoveredCount(covered);
            vo.setTokens(tokens);
            vo.setModel(resp.path("model").asText(channel.getDefaultModelKey()));
            return vo;
        } catch (LlmHttpClient.LlmCallException e) {
            metering.release(requestId, e.getCategory().name());
            throw new BusinessException("摘要生成失敗：" + e.userMessage());
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            metering.release(requestId, "summary_error");
            log.warn("[ConversationSummary] 摘要失败 conversation={}: {}", conversationId, e.getMessage());
            throw new BusinessException("摘要生成失敗，請稍後重試");
        }
    }

    private LlmChannelRouter.Channel pickChannel(String account) {
        LlmChannelRouter.Channel channel = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_OFF_PEAK, account);
        if (channel == null) {
            channel = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, account);
        }
        return channel;
    }

    private List<Map<String, Object>> parseMessages(String raw) {
        if (!StringUtils.hasText(raw)) return List.of();
        try {
            List<Map<String, Object>> list = objectMapper.readValue(raw, new TypeReference<>() {});
            return list == null ? List.of() : list;
        } catch (Exception e) {
            log.warn("[ConversationSummary] 消息 JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    private String buildTranscript(List<Map<String, Object>> messages) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> m : messages) {
            Object role = m.get("role");
            Object content = m.get("content");
            if (content == null) continue;
            String text = String.valueOf(content).replaceAll("\\s+", " ").trim();
            if (text.isEmpty()) continue;
            if (text.length() > MAX_MESSAGE_CHARS) text = text.substring(0, MAX_MESSAGE_CHARS) + "…";
            String line = ("user".equals(role) ? "用戶：" : "助手：") + text + "\n";
            if (sb.length() + line.length() > MAX_TRANSCRIPT_CHARS) break;
            sb.append(line);
        }
        return sb.toString().trim();
    }

    /** 供前端展示“已使用摘要”的可选能力（当前按需调用）。 */
    public List<String> summaryHints(Long conversationId) {
        AiConversation conv = conversationMapper.selectById(conversationId);
        if (conv == null || !StringUtils.hasText(conv.getSummary())) return new ArrayList<>();
        return List.of(conv.getSummary());
    }
}
