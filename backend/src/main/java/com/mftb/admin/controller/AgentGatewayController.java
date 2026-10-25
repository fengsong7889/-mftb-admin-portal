package com.mftb.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AiModelAdmissionService;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.service.agent.AiKillSwitchService.Status;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.service.agent.LlmChannelRouter.Channel;
import com.mftb.admin.service.agent.LlmMeteringService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final LlmMeteringService metering;
    private final OperatorResolver operatorResolver;
    private final LlmHttpClient llmClient;
    private final ObjectMapper objectMapper;
    /** V0 §B.6：会话执行事件（仅在 header 传 conversationPk 时写入） */
    private final AiConversationEventService conversationEventService;
    /** V0 §八 V0-7：紧急熍断，命中时 chat 直接 503 */
    private final AiKillSwitchService killSwitchService;
    private final AiModelAdmissionService admissionService;

    /** 与旧 Vite 中间件兼容：POST /api/llm/chat/completions → POST /api/agent/chat/completions */
    @PostMapping("/chat/completions")
    @Operation(summary = "OpenAI 兼容 chat 转发；服务端预算预占、计量与事件写入")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> payload,
                                  @RequestHeader(value = "x-llm-mode", required = false, defaultValue = DEFAULT_MODE) String mode,
                                  @RequestHeader(value = "x-llm-request-id", required = false) String requestIdHeader,
                                  @RequestHeader(value = "x-llm-conversation-pk", required = false) Long conversationPk) {
        try {
            return chatValidated(payload, mode, requestIdHeader, conversationPk);
        } catch (com.mftb.admin.common.BusinessException e) {
            return ResponseEntity.status(e.getCode()).body(Map.of("error", e.getMessage(), "errorKind", "request_blocked"));
        }
    }

    private ResponseEntity<?> chatValidated(Map<String, Object> payload, String mode, String requestIdHeader, Long conversationPk) {
        com.mftb.admin.dto.agent.AgentChatRequest.validateCompatibility(payload);
        if (!Set.of("auto", "primary", "off-peak").contains(String.valueOf(mode))) {
            throw new com.mftb.admin.common.BusinessException(400, "不支援的模型模式");
        }
        String username = operatorResolver.currentOperatorAccount();
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("error", "登录状态无效或已过期，请重新登录后使用 AI 助手"));
        }
        conversationEventService.requireOwned(conversationPk, username);
        AiModelAdmissionService.Decision availability = admissionService.checkAvailability(username);
        if (!availability.allowed()) {
            return ResponseEntity.status(availability.httpStatus()).body(Map.of("error", availability.message(), "errorKind", availability.errorKind()));
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

        AiModelAdmissionService.Decision decision = admissionService.check(username, chosen.getDefaultModelKey());
        if (!decision.allowed()) {
            appendEvent(conversationPk, "POLICY_DECISION", username,
                    Map.of("decision", "reject", "reason", decision.errorKind()));
            return ResponseEntity.status(decision.httpStatus())
                    .body(Map.of("error", decision.message(), "errorKind", decision.errorKind()));
        }

        // V0 §B.1：预占预算（估算 prompt = 消息条数×200 兑底，completion = max_tokens 或 2048）
        String requestId = requestIdHeader != null ? requestIdHeader : UUID.randomUUID().toString();
        // 改写请求体：替换 model 为通道默认；其余字段透传（messages/tools/temperature 等）
        Map<String, Object> outbound = new LinkedHashMap<>(payload);
        if (chosen.getDefaultModelKey() != null) {
            outbound.put("model", chosen.getDefaultModelKey());
        }
        var prepared = admissionService.prepare(username, chosen, outbound, "common");
        if (!prepared.decision().allowed()) {
            return ResponseEntity.status(prepared.decision().httpStatus())
                    .body(Map.of("error", prepared.decision().message(), "errorKind", prepared.decision().errorKind()));
        }
        outbound = prepared.payload();
        metering.reserve(requestId, username, chosen, estimatePromptTokens(outbound), estimateCompletionTokens(outbound));
        try {
            String body = llmClient.chatCompletionRaw(chosen.getBaseUrl(), chosen.getApiKey(), outbound);
            reportUsageAndSettle(username, mode, chosen, chosenLabel, body, requestId, conversationPk);
            maybeAppendAssistantTurn(conversationPk, body, username);
            return ResponseEntity.ok().contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .body(body == null ? "{}" : body);
        } catch (LlmHttpClient.LlmCallException e) {
            log.warn("[AgentGateway] 通道 {} 调用失败[{}]: {}", chosenLabel, e.getCategory(), e.getMessage());
            metering.release(requestId, e.getCategory().name());
            appendEvent(conversationPk, "GATEWAY_ERROR", username, Map.of(
                    "requestId", requestId, "channel", chosenLabel, "category", e.getCategory().name()));
            int status = e.getCategory() == LlmHttpClient.Category.TIMEOUT ? 504 : 502;
            return ResponseEntity.status(status).body(Map.of("error", e.userMessage()));
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

    /** 上报 usage + 预算结算 + 写 QUOTA_CHARGE 事件（计量口径统一走 LlmMeteringService）。 */
    private void reportUsageAndSettle(String username, String mode, Channel channel, String channelLabel,
                                       String rawBody, String requestId, Long conversationPk) {
        JsonNode root = null;
        if (rawBody != null && !rawBody.isEmpty()) {
            try {
                root = objectMapper.readTree(rawBody);
            } catch (Exception e) {
                log.warn("[AgentGateway] 上游回應解析失败 request={}: {}", requestId, e.getMessage());
            }
        }
        long charged = metering.settle(requestId, username, mode, channel, root);
        if (charged > 0) {
            appendEvent(conversationPk, "QUOTA_CHARGE", username, Map.of(
                    "requestId", requestId,
                    "model", root != null ? root.path("model").asText(channel.getDefaultModelKey()) : String.valueOf(channel.getDefaultModelKey()),
                    "tokens", charged,
                    "verification", LlmMeteringService.verification(channel)));
        }
    }

    /** 写事件；conversationPk 为空时静默跳过（历史会话或无会话上下文时仍允许 chat）。 */
    private void appendEvent(Long conversationPk, String type, String actor, Map<String, Object> payload) {
        if (conversationPk == null) return;
        conversationEventService.append(conversationPk, null, type, actor, payload);
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
        } catch (com.mftb.admin.common.BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new com.mftb.admin.common.BusinessException(503, "模型回覆審計無法完成，請勿自動重試");
        }
    }

    /** GET /api/agent/status：当前账号可用通道/模型概览（附不可用原因，避免“显示可用但一问就挂”） */
    @GetMapping("/status")
    @Operation(summary = "当前账号可用通道/模型概览")
    public Result<Map<String, Object>> status(
            @RequestHeader(value = "x-llm-mode", required = false, defaultValue = DEFAULT_MODE) String mode) {
        String username = operatorResolver.currentOperatorAccount();
        // 首页挂载会高频调这个接口：预先取一次授权模型，避开“每个候选通道都重跑一次四维授权查询”
        Set<String> authorizedModels = new HashSet<>();
        try {
            myCenterService.myModels().forEach(m -> {
                if (m.getModelKey() != null) authorizedModels.add(m.getModelKey());
            });
        } catch (Exception e) {
            log.warn("[AgentGateway] 授权模型预取失败，本轮按无授权处理: {}", e.getMessage());
        }
        Channel ch = null;
        for (String label : List.of(LlmChannelRouter.CHANNEL_PRIMARY, LlmChannelRouter.CHANNEL_OFF_PEAK)) {
            if ("primary".equals(mode) && !LlmChannelRouter.CHANNEL_PRIMARY.equals(label)) continue;
            if ("off-peak".equals(mode) && !LlmChannelRouter.CHANNEL_OFF_PEAK.equals(label)) continue;
            Channel candidate = channelRouter.resolveChannel(label, username);
            // A3：通道能解析不等于账号有权用；未授权模型不能报 ok=true，否则首页芯片与后端准入不一致
            if (candidate != null && authorizedModels.contains(candidate.getDefaultModelKey())) {
                ch = candidate;
                break;
            }
        }
        Map<String, Object> info = new HashMap<>();
        info.put("ok", ch != null);
        info.put("mode", mode);
        info.put("channel", ch == null ? null : ch.getLabel());
        info.put("model", ch == null ? null : ch.getDefaultModelKey());
        info.put("account", username);
        // 熍断是全局态：不透给前端的话，急停期间首页仍会显示「在線」，用户只能靠发送失败发现（实测）
        info.put("killSwitch", killSwitchService.isEngaged());
        // 不可用时的具体原因：no_api_key（供供应商未配 Key）/ account_restricted（白名单）/ no_model_auth（未授权）
        if (ch == null) {
            info.put("reason", resolveUnavailableReason(mode, username));
        }
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

    /** 按用户选择的 mode 维度给出可读的不可用原因；auto 时逐个候选取第一个具体病因。 */
    private String resolveUnavailableReason(String mode, String username) {
        List<String> labels = new ArrayList<>();
        if ("primary".equals(mode)) labels.add(LlmChannelRouter.CHANNEL_PRIMARY);
        else if ("off-peak".equals(mode)) labels.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        else {
            labels.add(LlmChannelRouter.CHANNEL_PRIMARY);
            labels.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        }
        for (String label : labels) {
            String reason = channelRouter.diagnose(label, username);
            if (!LlmChannelRouter.REASON_OK.equals(reason)) {
                return reason;
            }
        }
        // 通道都健康，但账号没任何一个授权模型
        return "no_model_auth";
    }
}
