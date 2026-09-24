package com.mftb.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.LlmUsageService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.service.agent.AiKillSwitchService.Status;
import com.mftb.admin.service.agent.BudgetReservationService;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.service.agent.LlmChannelRouter.Channel;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V0 §B.1：Spring 侧的 Agent 网关，取代 Vite dev 中间件里的 /api/llm/*。
 * <p>本期实现：路由 + 转发 + 服务端 usage 上报（VERIFIED）；
 * 工具循环仍保留在前端 {@code agent.ts}，多轮 chat 复用同一 request_id 便于对账。
 * <p>下一 PR 会迁入：{@code AgentOrchestrationService}（MAX_TOOL_ROUNDS 语义）、
 * {@code BudgetReservationService}（预占/结算）以及 {@code ai_conversation_event} 事件流。
 */
@Slf4j
@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentGatewayController {

    private static final String DEFAULT_MODE = "auto";

    private final LlmChannelRouter channelRouter;
    private final AiMyCenterService myCenterService;
    private final LlmUsageService llmUsageService;
    private final OperatorResolver operatorResolver;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    /** V0 §B.1：预算预占/结算/释放 */
    private final BudgetReservationService budgetService;
    /** V0 §B.6：会话执行事件（仅在 header 传 conversationPk 时写入） */
    private final AiConversationEventService conversationEventService;
    /** V0 §八 V0-7：紧急熍断，命中时 chat 直接 503 */
    private final AiKillSwitchService killSwitchService;

    /** 与旧 Vite 中间件兼容：POST /api/llm/chat/completions → POST /api/agent/chat/completions */
    @PostMapping("/chat/completions")
    @Operation(summary = "OpenAI 兼容 chat 转发；服务端预算预占、计量与事件写入")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> payload,
                                  @RequestHeader(value = "x-llm-mode", required = false, defaultValue = DEFAULT_MODE) String mode,
                                  @RequestHeader(value = "x-llm-request-id", required = false) String requestIdHeader,
                                  @RequestHeader(value = "x-llm-conversation-pk", required = false) Long conversationPk) {
        String username = operatorResolver.currentOperatorName();
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("error", "登录状态无效或已过期，请重新登录后使用 AI 助手"));
        }
        // V0 §八 V0-7：熎断优先级最高，拉不到任何模型/工具
        if (killSwitchService.isEngaged()) {
            Status st = killSwitchService.current();
            log.warn("[AgentGateway] 熎断中，拒绝 chat 请求：operator={} reason={}", st.operator(), st.reason());
            return ResponseEntity.status(503).body(Map.of("error",
                    "AI 服务已临时停用（紧急熎断中）。操作人：" + st.operator() + "；原因：" + st.reason()));
        }
        // V0 §B.6：命中新回合（最后一条 role=user）时写 USER_TURN；回写成功后写 ASSISTANT_TURN
        maybeAppendUserTurn(conversationPk, payload, username);

        // 通道选择：auto=先 primary 再 off-peak；显式 primary/off-peak 尊重选择
        List<String> candidateLabels = new ArrayList<>();
        if ("primary".equals(mode)) candidateLabels.add(LlmChannelRouter.CHANNEL_PRIMARY);
        else if ("off-peak".equals(mode)) candidateLabels.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        else {
            candidateLabels.add(LlmChannelRouter.CHANNEL_PRIMARY);
            candidateLabels.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        }

        Channel chosen = null;
        String chosenLabel = null;
        for (String label : candidateLabels) {
            Channel ch = channelRouter.resolveChannel(label, username);
            if (ch != null) { chosen = ch; chosenLabel = label; break; }
        }
        if (chosen == null) {
            appendEvent(conversationPk, "POLICY_DECISION", username, Map.of(
                    "decision", "reject", "reason", "no_channel_available", "mode", mode));
            return ResponseEntity.status(403).body(Map.of("error",
                    "當前賬號沒有可用模型（部分模型未對你開放），請聯繫管理員申請開通"));
        }

        // 配额校验：命中 reject 直接拒绝；downgrade 不改变通道选择（模型降级留待下一 PR）
        AiMyCenterDTO.QuotaCheckVO quota = myCenterService.checkQuota(null, chosen.getDefaultModelKey());
        if (quota != null && "reject".equals(quota.getAction())) {
            appendEvent(conversationPk, "POLICY_DECISION", username, Map.of(
                    "decision", "reject", "reason", "quota_exhausted",
                    "hitSource", String.valueOf(quota.getHitSource()),
                    "hitUsagePercent", String.valueOf(quota.getHitUsagePercent())));
            return ResponseEntity.status(429).body(Map.of("error",
                    quota.getMessage() == null ? "已超出額度限制" : quota.getMessage()));
        }

        // V0 §B.1：预占预算（估算 prompt = 消息条数×200 兑底，completion = max_tokens 或 2048）
        String requestId = requestIdHeader != null ? requestIdHeader : UUID.randomUUID().toString();
        int promptEst = estimatePromptTokens(payload);
        int completionEst = estimateCompletionTokens(payload);
        try {
            budgetService.reserve(requestId, username, chosen.getDefaultModelKey(),
                    promptEst, completionEst,
                    chosen.getInputPrice(), chosen.getOutputPrice(), chosen.getCurrency());
        } catch (RuntimeException e) {
            log.warn("[AgentGateway] 预算预占失败 request={}: {}", requestId, e.getMessage());
            // 不阻断业务，后续 usage 上报仍会写 UNKNOWN；无预占行时 settle 会命中 0 行自然忽略
        }

        // 改写请求体：替换 model 为通道默认；其余字段透传（messages/tools/temperature 等）
        Map<String, Object> outbound = new LinkedHashMap<>(payload);
        if (chosen.getDefaultModelKey() != null) {
            outbound.put("model", chosen.getDefaultModelKey());
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (chosen.getApiKey() != null && !chosen.getApiKey().isBlank()) {
            headers.setBearerAuth(chosen.getApiKey());
        }
        String url = normalizeBaseUrl(chosen.getBaseUrl());

        try {
            ResponseEntity<String> upstream = restTemplate.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(outbound, headers), String.class);
            String body = upstream.getBody();
            reportUsageAndSettle(username, mode, chosen, chosenLabel, body, requestId, conversationPk);
            maybeAppendAssistantTurn(conversationPk, body, username);
            return ResponseEntity.status(upstream.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body == null ? "{}" : body);
        } catch (Exception e) {
            log.warn("[AgentGateway] 通道 {} 调用失败: {}", chosenLabel, e.getMessage());
            budgetService.release(requestId, e.getMessage());
            appendEvent(conversationPk, "GATEWAY_ERROR", username, Map.of(
                    "requestId", requestId, "channel", chosenLabel, "error",
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            return ResponseEntity.status(502).body(Map.of("error",
                    "LLM 請求失敗: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())));
        }
    }

    /** 预估 prompt tokens：以消息总数 × 200 兑底（无 tokenizer）；实际以服务端返回 usage 为准。 */
    @SuppressWarnings("unchecked")
    private int estimatePromptTokens(Map<String, Object> payload) {
        Object msgs = payload.get("messages");
        if (msgs instanceof List<?> list) return Math.max(1, list.size()) * 200;
        return 200;
    }

    private int estimateCompletionTokens(Map<String, Object> payload) {
        Object mt = payload.get("max_tokens");
        if (mt instanceof Number n) return Math.max(0, n.intValue());
        return 2048;
    }

    /** 上报 usage + 预算结算 + 写 QUOTA_CHARGE 事件（一次性处理，异常不阻断主链路）。 */
    private void reportUsageAndSettle(String username, String mode, Channel channel, String channelLabel,
                                       String rawBody, String requestId, Long conversationPk) {
        if (rawBody == null || rawBody.isEmpty()) {
            budgetService.release(requestId, "empty_body");
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            JsonNode usage = root.path("usage");
            if (usage.isMissingNode() || usage.isNull()) {
                budgetService.release(requestId, "no_usage_field");
                return;
            }
            int prompt = usage.path("prompt_tokens").asInt(0);
            int completion = usage.path("completion_tokens").asInt(0);
            int cached = usage.path("prompt_tokens_details").path("cached_tokens").asInt(0);

            LlmUsageRecordRequest req = new LlmUsageRecordRequest();
            req.setMode(mode);
            req.setChannel(channelLabel);
            req.setModel(root.path("model").asText(channel.getDefaultModelKey()));
            req.setPromptTokens(prompt);
            req.setCompletionTokens(completion);
            req.setCachedTokens(cached);
            req.setRequestId(requestId);
            llmUsageService.record(username, req);

            budgetService.settle(requestId, prompt, completion, cached,
                    channel.getInputPrice(), channel.getOutputPrice(),
                    channel.getCachedInputPrice(), channel.getCurrency());

            appendEvent(conversationPk, "QUOTA_CHARGE", username, Map.of(
                    "requestId", requestId,
                    "model", req.getModel(),
                    "prompt", prompt, "completion", completion,
                    "verification", channel.getInputPrice() != null && channel.getOutputPrice() != null
                            ? "VERIFIED" : "UNKNOWN"));
        } catch (Exception e) {
            log.warn("[AgentGateway] 用量上报或预算结算失败 request={}: {}", requestId, e.getMessage());
        }
    }

    /** 写事件；conversationPk 为空时静默跳过（历史会话或无会话上下文时仍允许 chat）。 */
    private void appendEvent(Long conversationPk, String type, String actor, Map<String, Object> payload) {
        if (conversationPk == null) return;
        try {
            conversationEventService.append(conversationPk, null, type, actor, payload);
        } catch (Exception e) {
            log.warn("[AgentGateway] 事件写入失败 type={}: {}", type, e.getMessage());
        }
    }

    /**
     * V0 §B.6：前端多轮工具循环会多次命中 chat；仅当本次 payload 的最后一条为 role=user 时视为新回合，
     * 写一次 USER_TURN（取内容前 200 字，避免存大文本）。
     */
    @SuppressWarnings("unchecked")
    private void maybeAppendUserTurn(Long conversationPk, Map<String, Object> payload, String username) {
        if (conversationPk == null) return;
        Object msgs = payload.get("messages");
        if (!(msgs instanceof List<?> list) || list.isEmpty()) return;
        Object last = list.get(list.size() - 1);
        if (!(last instanceof Map<?, ?> map)) return;
        if (!"user".equals(map.get("role"))) return;
        Object content = map.get("content");
        String preview = content == null ? "" : String.valueOf(content);
        appendEvent(conversationPk, "USER_TURN", username, Map.of(
                "chars", preview.length(),
                "preview", preview.length() > 200 ? preview.substring(0, 200) + "…" : preview));
    }

    /** 模型回写成功后写 ASSISTANT_TURN（取回文前 200 字 + tool_calls 数量）。 */
    private void maybeAppendAssistantTurn(Long conversationPk, String rawBody, String username) {
        if (conversationPk == null || rawBody == null || rawBody.isEmpty()) return;
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            JsonNode msg = root.path("choices").path(0).path("message");
            if (msg.isMissingNode() || msg.isNull()) return;
            String content = msg.path("content").asText("");
            int toolCalls = msg.path("tool_calls").isArray() ? msg.path("tool_calls").size() : 0;
            appendEvent(conversationPk, "ASSISTANT_TURN", username, Map.of(
                    "chars", content.length(),
                    "preview", content.length() > 200 ? content.substring(0, 200) + "…" : content,
                    "toolCalls", toolCalls));
        } catch (Exception e) {
            log.warn("[AgentGateway] ASSISTANT_TURN 写入失败: {}", e.getMessage());
        }
    }

    /** GET /api/agent/status：与旧 Vite 中间件的 status 语义对齐，供前端展示当前通道 */
    @GetMapping("/status")
    @Operation(summary = "当前账号可用通道/模型概览")
    public Result<Map<String, Object>> status(
            @RequestHeader(value = "x-llm-mode", required = false, defaultValue = DEFAULT_MODE) String mode) {
        String username = operatorResolver.currentOperatorName();
        Channel ch = null;
        for (String label : List.of(LlmChannelRouter.CHANNEL_PRIMARY, LlmChannelRouter.CHANNEL_OFF_PEAK)) {
            if ("primary".equals(mode) && !LlmChannelRouter.CHANNEL_PRIMARY.equals(label)) continue;
            if ("off-peak".equals(mode) && !LlmChannelRouter.CHANNEL_OFF_PEAK.equals(label)) continue;
            Channel candidate = channelRouter.resolveChannel(label, username);
            if (candidate != null) { ch = candidate; break; }
        }
        Map<String, Object> info = new HashMap<>();
        info.put("ok", ch != null);
        info.put("mode", mode);
        info.put("channel", ch == null ? null : ch.getLabel());
        info.put("model", ch == null ? null : ch.getDefaultModelKey());
        info.put("account", username);
        // V0 §B.1：为首页提供与旧 Vite 中间件同语义的 denied，前端能直接接接展示无权限提示
        List<String> denied = new ArrayList<>();
        if (!channelRouter.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, username)) {
            denied.add(LlmChannelRouter.CHANNEL_PRIMARY);
        }
        if (!channelRouter.isChannelAllowed(LlmChannelRouter.CHANNEL_OFF_PEAK, username)) {
            denied.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        }
        info.put("denied", denied);
        return Result.success(info);
    }

    private static String normalizeBaseUrl(String base) {
        if (base == null || base.isBlank()) return "https://api.deepseek.com/chat/completions";
        String trimmed = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        if (trimmed.endsWith("/chat/completions")) return trimmed;
        return trimmed + "/chat/completions";
    }
}
