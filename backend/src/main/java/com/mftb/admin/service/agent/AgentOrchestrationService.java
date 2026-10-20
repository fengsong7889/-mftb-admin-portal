package com.mftb.admin.service.agent;

import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.mapper.McpToolMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiConversationService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.dto.AiMyCenterDTO;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * V0 §B.1 后端 tool 循环：把「LLM → 工具执行 → 回填 → 再 LLM」的多轮流程搬到 Spring。
 * <p>V1 前置版本：只跑 {@link AgentTool}（3 个内建只读工具）；LLM 若命中未识别 toolKey
 * （外部服务）时，编排会返回 text=null + pendingExternalCalls，交由前端确认后二次调用。
 * <p>System Prompt 由 {@link #buildSystemPrompt} 服务端拼装，保留繁体 + 千分位 + 品牌 1/2 等规则。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentOrchestrationService {

    private static final int MAX_TOOL_ROUNDS = 5;
    private static final int MAX_MESSAGES = 20;
    /** 预占用的单次补全上限（无 max_tokens 时的兑底，与旧网关口径一致） */
    private static final int ESTIMATED_COMPLETION_TOKENS = 2048;
    private static final String SYSTEM_RULES = """
            規則：
            - 使用繁體中文回覆
            - 金額顯示使用千分位格式（如 1,000,000）
            - 品牌名稱：flashBee=閃蜂，mFood=mFood；調用工具時 brand 參數必須傳 flashBee 或 mFood，不要傳 1/2 或中文名
            - 如果用戶提到的集團名稱模糊，先嘗試模糊匹配，有多個結果時列出讓用戶選擇
            - 查詢結果為空時，明確告知用戶未找到數據
            - 不要編造數據，只根據工具返回的實際結果回覆
            - 發送郵件等對外操作：用戶未提供收件人郵箱時必須先詢問確認，禁止編造郵箱地址
            - 標記「外部服務」的工具執行前系統會請求用戶人工確認，請在回覆中說明確認結果（已執行/被拒絕）
            - 回覆簡潔清晰，重要數字加粗顯示""";

    private final List<AgentTool> tools;
    private final LlmChannelRouter channelRouter;
    private final AiMyCenterService myCenterService;
    private final AiConversationEventService eventService;
    private final LlmHttpClient llmClient;
    private final ObjectMapper objectMapper;
    /** A1：问答链路计量与预算统一入口（与网关口径一致，避得换了入口就丢账） */
    private final LlmMeteringService metering;
    /** B4：服务端回填会话的 model_key / request_count（前端 PUT 从来不传这两个字段） */
    private final AiConversationService conversationService;
    /** 将已安装的外部工具（mcp_tool + ai_tool_policy）一并下放到 LLM tools schema */
    private final McpToolMapper mcpToolMapper;
    private final AiToolPolicyMapper toolPolicyMapper;
    /** D2：内建工具执行也要写 ai_tool_exec_log（复用工具策略的日志入口） */
    private final com.mftb.admin.service.AiToolPolicyService toolPolicyService;

    @Data
    public static class OrchestrateRequest {
        /** OpenAI Chat Completions 兼容消息数组（role/content/tool_calls 等） */
        private List<Map<String, Object>> messages;
        private Long conversationPk;
        /** auto / primary / off-peak */
        private String mode = "auto";
    }

    @Data
    public static class OrchestrateResult {
        /** 最终文本；若命中外部工具则为 null，前端处理 pendingExternalCalls 后带 nextMessages 重新调用 */
        private String text;
        private String model;
        private long tokens;
        /** LLM 请求执行但本 PR 编排不代跑（前端确认→ /api/mcp/exec）；每项含 id/name/argumentsJson */
        private List<Map<String, Object>> pendingExternalCalls = List.of();
        /**
         * 外部工具待回时，服务端已经写入了包含 assistant.tool_calls 的上下文，
         * 前端直接基于 nextMessages 追加工具结果后重新发送，避免上下文不一致。
         */
        private List<Map<String, Object>> nextMessages = List.of();
        /** 已执行过的内建工具调用（供事件时间线展示） */
        private List<ToolTrace> traces = new ArrayList<>();
        /**
         * 本轮不是 AI 正常回复（熔断/无权限/额度/上游异常），而是给用户的提示文案。
         * <p>为什么需要这个标记：以前错误文案与正常回复一样回 HTTP 200 + text，前端把它当助手回复
         * 写入会话历史，下一轮又当作上下文发给模型 → 一次超时会让整个会话每轮必挂（实测）。
         * 有了 errorKind，前端可以按错误态展示且不入库、不进上下文。
         */
        private String errorKind;
    }

    @Data
    public static class ToolTrace {
        private final String toolKey;
        private final String argsDigest;
        private final long elapsedMs;
        private final boolean success;
    }

    public OrchestrateResult orchestrate(OrchestrateRequest req, String caller) {
        OrchestrateResult out = new OrchestrateResult();
        if (req.getMessages() == null || req.getMessages().isEmpty()) {
            out.setText("（無消息可處理）");
            return out;
        }
        String username = caller;
        LlmChannelRouter.Channel channel = pickChannel(req.getMode(), username);
        if (channel == null) {
            out.setErrorKind("no_channel");
            out.setText("當前賬號沒有可用模型（部分模型未對你開放），請聯繫管理員申請開通");
            return out;
        }
        // A3：模型授权必须在服务端判定——前端把输入框置灰不是安全边界，绕过 UI 直接 POST 就能偷跑模型
        String modelKey = channel.getDefaultModelKey();
        if (!isModelAuthorized(modelKey)) {
            appendEvent(req.getConversationPk(), "POLICY_DECISION", username, Map.of(
                    "decision", "reject", "reason", "no_model_auth", "model", String.valueOf(modelKey)));
            out.setErrorKind("no_model_auth");
            out.setText("當前賬號未被授權使用模型「" + modelKey + "」，請聯繫管理員在「員工模型權控」開通後重試");
            return out;
        }
        AiMyCenterDTO.QuotaCheckVO quota = myCenterService.checkQuota(null, modelKey);
        if (quota != null && "reject".equals(quota.getAction())) {
            out.setErrorKind("quota_reject");
            out.setText(quota.getMessage() == null ? "已超出額度限制" : quota.getMessage());
            return out;
        }

        appendEvent(req.getConversationPk(), "USER_TURN", username, snapshotLastUser(req.getMessages()));

        // 复制 messages，前置 System Prompt；截断到最近 MAX_MESSAGES 条
        List<Map<String, Object>> working = new ArrayList<>();
        working.add(Map.of("role", "system", "content", buildSystemPrompt()));
        working.addAll(trimMessages(req.getMessages()));

        long totalTokens = 0;
        String modelUsed = channel.getDefaultModelKey();
        List<Map<String, Object>> toolSchemas = allToolSchemas();
        // 每轮单独一个 requestId：一次上游往返 = 一条用量明细 + 一条预算流水，多轮工具循环不能共账
        String requestIdBase = "orch-" + java.util.UUID.randomUUID();

        for (int round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", channel.getDefaultModelKey());
            payload.put("messages", working);
            payload.put("temperature", 0.3);
            if (!toolSchemas.isEmpty()) {
                payload.put("tools", toolSchemas);
                payload.put("tool_choice", "auto");
            }
            JsonNode resp;
            String roundRequestId = requestIdBase + "-r" + round;
            metering.reserve(roundRequestId, username, channel,
                    estimatePromptTokens(working), ESTIMATED_COMPLETION_TOKENS);
            try {
                resp = callLlm(channel, payload);
            } catch (LlmHttpClient.LlmCallException e) {
                log.warn("[AgentOrch] LLM 调用失败[{}]: {}", e.getCategory(), e.getMessage());
                metering.release(roundRequestId, e.getCategory().name());
                appendEvent(req.getConversationPk(), "GATEWAY_ERROR", username,
                        Map.of("category", e.getCategory().name(), "round", round));
                out.setErrorKind(e.getCategory().name().toLowerCase());
                out.setText(e.userMessage());
                out.setTokens(totalTokens);
                out.setModel(modelUsed);
                return out;
            }
            if (resp == null) {
                metering.release(roundRequestId, "empty_body");
                out.setErrorKind("upstream_empty");
                out.setText("AI 服務暫時不可用，請稍後再試。");
                out.setTokens(totalTokens);
                out.setModel(modelUsed);
                return out;
            }
            // A1：服务端观测到的 usage 落账（biz_llm_usage）+ 预算结算（ai_budget_ledger）
            totalTokens += metering.settle(roundRequestId, username, req.getMode(), channel, resp);
            appendEvent(req.getConversationPk(), "QUOTA_CHARGE", username, Map.of(
                    "requestId", roundRequestId, "model", String.valueOf(modelUsed),
                    "verification", LlmMeteringService.verification(channel)));
            modelUsed = resp.path("model").asText(modelUsed);
            JsonNode choice = resp.path("choices").path(0).path("message");
            String content = choice.path("content").asText("");
            JsonNode toolCalls = choice.path("tool_calls");
            if (!toolCalls.isArray() || toolCalls.isEmpty()) {
                out.setText(content.isEmpty() ? "（無內容）" : content);
                out.setTokens(totalTokens);
                out.setModel(modelUsed);
                appendEvent(req.getConversationPk(), "ASSISTANT_TURN", username,
                        Map.of("chars", content.length(), "preview", preview(content, 200), "toolCalls", 0));
                // B4：本回合真正完成，服务端记一次调用并固定实际使用的模型
                conversationService.recordAgentTurn(req.getConversationPk(), username, modelUsed);
                return out;
            }
            if (round == MAX_TOOL_ROUNDS) {
                // 轮次超限，去掉 tools 再拿一次收尾
                payload.remove("tools");
                payload.remove("tool_choice");
                String finalRequestId = requestIdBase + "-rfinal";
                metering.reserve(finalRequestId, username, channel,
                        estimatePromptTokens(working), ESTIMATED_COMPLETION_TOKENS);
                String finalContent;
                try {
                    JsonNode finalResp = callLlm(channel, payload);
                    if (finalResp == null) {
                        metering.release(finalRequestId, "empty_body");
                        finalContent = "查詢完成，但無法生成回覆。";
                    } else {
                        totalTokens += metering.settle(finalRequestId, username, req.getMode(), channel, finalResp);
                        finalContent = finalResp.path("choices").path(0).path("message").path("content").asText("");
                    }
                } catch (LlmHttpClient.LlmCallException e) {
                    log.warn("[AgentOrch] 收尾调用失败[{}]: {}", e.getCategory(), e.getMessage());
                    metering.release(finalRequestId, e.getCategory().name());
                    out.setErrorKind(e.getCategory().name().toLowerCase());
                    finalContent = e.userMessage();
                }
                out.setText(finalContent);
                out.setTokens(totalTokens);
                out.setModel(modelUsed);
                return out;
            }
            // 记录 assistant 消息 + 分发工具
            Map<String, Object> asstMsg = new LinkedHashMap<>();
            asstMsg.put("role", "assistant");
            asstMsg.put("content", content);
            List<Map<String, Object>> tcList = new ArrayList<>();
            for (JsonNode tc : toolCalls) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", tc.path("id").asText());
                entry.put("type", "function");
                entry.put("function", Map.of(
                        "name", tc.path("function").path("name").asText(),
                        "arguments", tc.path("function").path("arguments").asText("{}")));
                tcList.add(entry);
            }
            asstMsg.put("tool_calls", tcList);
            working.add(asstMsg);

            List<Map<String, Object>> pending = new ArrayList<>();
            for (Map<String, Object> tc : tcList) {
                @SuppressWarnings("unchecked")
                Map<String, Object> fn = (Map<String, Object>) tc.get("function");
                String name = String.valueOf(fn.get("name"));
                String argsJson = String.valueOf(fn.get("arguments"));
                String callId = String.valueOf(tc.get("id"));
                AgentTool tool = findTool(name);
                if (tool == null) {
                    // 未识别（外部服务），回给前端：确认 + 执后同 nextMessages 追补 tool result
                    pending.add(Map.of("id", callId, "name", name, "argumentsJson", argsJson));
                    continue;
                }
                Map<String, Object> args = parseArgs(argsJson);
                long start = System.currentTimeMillis();
                String toolResult = tool.execute(args, new AgentTool.ToolCallContext(username, req.getConversationPk()));
                long cost = System.currentTimeMillis() - start;
                boolean ok = toolResult != null && !toolResult.startsWith("{\"error\"");
                out.getTraces().add(new ToolTrace(name, shortDigest(argsJson), cost, ok));
                appendEvent(req.getConversationPk(), "TOOL_CALL", username,
                        Map.of("toolKey", name, "argsDigest", shortDigest(argsJson)));
                appendEvent(req.getConversationPk(), "TOOL_RESULT", username,
                        Map.of("toolKey", name, "success", ok ? 1 : 0, "elapsed", cost));
                // D2：内建工具也必须进 ai_tool_exec_log。以前只有外部工具走 /api/mcp/exec 时写日志，
                // 导致「執行日誌」页永远为空，而页面承诺“所有 AI 调用均留痕”——审计不能只盖一半。
                recordToolExecLog(name, username, shortDigest(argsJson), cost, ok);
                working.add(Map.of("role", "tool", "tool_call_id", callId,
                        "content", toolResult == null ? "" : toolResult));
            }
            if (!pending.isEmpty()) {
                out.setPendingExternalCalls(pending);
                // 仅包含已确定的 assistant tool_calls 上下文（本次 working 包取到已包含 assistant 消息）
                out.setNextMessages(new ArrayList<>(working));
                out.setTokens(totalTokens);
                out.setModel(modelUsed);
                return out;
            }
        }
        return out;
    }

    /* ────────────────── 内部工具 ────────────────── */

    /** 内建工具执行留痕（与 /api/mcp/exec 同一张表、同一口径）；失败只留警告不阻断回复。 */
    private void recordToolExecLog(String toolKey, String caller, String digest, long elapsedMs, boolean ok) {
        try {
            com.mftb.admin.entity.AiToolExecLog entry = new com.mftb.admin.entity.AiToolExecLog();
            entry.setToolKey(toolKey);
            entry.setCaller(caller);
            entry.setArgsDigest(digest);
            entry.setDecision("allow");
            entry.setElapsedMs(elapsedMs);
            entry.setSuccess(ok ? 1 : 0);
            if (!ok) {
                entry.setRejectReason("tool_execution_failed");
            }
            toolPolicyService.logExecution(entry);
        } catch (Exception e) {
            log.warn("[AgentOrch] 工具執行日誌写入失敗 tool={}: {}", toolKey, e.getMessage());
        }
    }

    private LlmChannelRouter.Channel pickChannel(String mode, String username) {
        List<String> candidates = new ArrayList<>();
        if ("primary".equals(mode)) candidates.add(LlmChannelRouter.CHANNEL_PRIMARY);
        else if ("off-peak".equals(mode)) candidates.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        else {
            candidates.add(LlmChannelRouter.CHANNEL_PRIMARY);
            candidates.add(LlmChannelRouter.CHANNEL_OFF_PEAK);
        }
        for (String label : candidates) {
            LlmChannelRouter.Channel ch = channelRouter.resolveChannel(label, username);
            if (ch != null) return ch;
        }
        return null;
    }

    /** 转发到 OpenAI 兼容端点；失败以 {@link LlmHttpClient.LlmCallException} 抛出，由调用方映射文案。 */
    private JsonNode callLlm(LlmChannelRouter.Channel channel, Map<String, Object> payload) {
        return llmClient.chatCompletion(channel.getBaseUrl(), channel.getApiKey(), payload);
    }

    private List<Map<String, Object>> builtInToolSchemas() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentTool t : tools) {
            out.add(Map.of(
                    "type", "function",
                    "function", Map.of(
                            "name", t.toolKey(),
                            "description", t.description(),
                            "parameters", t.schema())));
        }
        return out;
    }

    /**
     * 内建工具 + 已安装且已授权的外部工具。外部工具的 params_json 直接作为 OpenAI function parameters，
     * 前端旧行为一致；未登记 policy / enabled=0 的工具不会下发，避免 LLM 命中后无入口。
     */
    private List<Map<String, Object>> allToolSchemas() {
        List<Map<String, Object>> out = new ArrayList<>(builtInToolSchemas());
        Set<String> builtinKeys = new java.util.HashSet<>();
        for (AgentTool t : tools) builtinKeys.add(t.toolKey());
        try {
            List<McpTool> installed = mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                    .eq(McpTool::getInstalled, 1)
                    .eq(McpTool::getSource, "external"));
            if (installed.isEmpty()) return out;
            List<String> keys = installed.stream().map(McpTool::getToolKey).filter(k -> !builtinKeys.contains(k)).toList();
            if (keys.isEmpty()) return out;
            Map<String, AiToolPolicy> policyBy = new LinkedHashMap<>();
            for (AiToolPolicy p : toolPolicyMapper.selectList(new LambdaQueryWrapper<AiToolPolicy>()
                    .in(AiToolPolicy::getToolKey, keys))) {
                policyBy.put(p.getToolKey(), p);
            }
            for (McpTool tool : installed) {
                if (builtinKeys.contains(tool.getToolKey())) continue;
                AiToolPolicy policy = policyBy.get(tool.getToolKey());
                if (policy == null || policy.getEnabled() == null || policy.getEnabled() != 1) continue;
                Map<String, Object> parameters = parseParamsJson(tool.getParamsJson());
                Map<String, Object> fn = new LinkedHashMap<>();
                fn.put("name", tool.getToolKey());
                fn.put("description", tool.getDescription() == null ? "" : tool.getDescription());
                fn.put("parameters", parameters);
                out.add(Map.of("type", "function", "function", fn));
            }
        } catch (Exception e) {
            log.warn("[AgentOrch] 拉取外部工具 schema 失败，退化为仅内建：{}", e.getMessage());
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParamsJson(String raw) {
        if (raw == null || raw.isBlank()) return Map.of("type", "object", "properties", Map.of());
        try { return objectMapper.readValue(raw, Map.class); }
        catch (Exception e) { return Map.of("type", "object", "properties", Map.of()); }
    }

    private String buildSystemPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("你是 MFTB 推廣管理後台的 AI 助手，幫助業務人員快速查詢系統數據。\n\n");
        sb.append("你的能力範圍：\n");
        int i = 1;
        for (AgentTool t : tools) {
            sb.append(i++).append(". ").append(t.description()).append('\n');
        }
        sb.append('\n').append(SYSTEM_RULES);
        return sb.toString();
    }

    private AgentTool findTool(String key) {
        for (AgentTool t : tools) {
            if (t.toolKey().equals(key)) return t;
        }
        return null;
    }

    private static List<Map<String, Object>> trimMessages(List<Map<String, Object>> raw) {
        if (raw.size() <= MAX_MESSAGES) return new ArrayList<>(raw);
        return new ArrayList<>(raw.subList(raw.size() - MAX_MESSAGES, raw.size()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseArgs(String json) {
        try { return objectMapper.readValue(json, Map.class); }
        catch (Exception e) { return Map.of(); }
    }

    /**
     * A3：模型授权校验。走 {@link AiMyCenterService#hasModelAccess(String)}（与首页 my-models 同源），
     * 网关与编排共用一个口径，避开“前端置灰、后端放行”的越权。
     */
    private boolean isModelAuthorized(String modelKey) {
        try {
            return myCenterService.hasModelAccess(modelKey);
        } catch (Exception e) {
            log.warn("[AgentOrch] 授权模型查询失败，拒绝调用: {}", e.getMessage());
            return false;
        }
    }

    /** 预占用的 prompt 估算：消息条数 × 200 兑底（无 tokenizer），结算以服务端实际 usage 为准。 */
    private static int estimatePromptTokens(List<Map<String, Object>> working) {
        return Math.max(1, working.size()) * 200;
    }

    private static String shortDigest(String s) {
        if (s == null) return null;
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    private static Map<String, Object> snapshotLastUser(List<Map<String, Object>> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, Object> m = messages.get(i);
            if ("user".equals(m.get("role"))) {
                Object c = m.get("content");
                String text = c == null ? "" : String.valueOf(c);
                return Map.of("chars", text.length(), "preview", preview(text, 200));
            }
        }
        return Map.of("chars", 0, "preview", "");
    }

    private static String preview(String text, int maxLen) {
        if (text == null) return "";
        String oneLine = text.replaceAll("\\s+", " ").trim();
        return oneLine.length() <= maxLen ? oneLine : oneLine.substring(0, maxLen) + "…";
    }

    private void appendEvent(Long conversationPk, String type, String actor, Map<String, Object> payload) {
        if (conversationPk == null) return;
        try { eventService.append(conversationPk, null, type, actor, payload); }
        catch (Exception e) { log.warn("[AgentOrch] 事件写入失败 type={}: {}", type, e.getMessage()); }
    }
}
