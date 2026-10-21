package com.mftb.admin.service.agent;

import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.dto.agent.AgentPendingAction;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.mapper.McpToolMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiConversationService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.util.OperatorResolver;

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
            - 回覆簡潔清晰，重要數字加粗顯示
            - 產研交付術語：項目 → 迭代 → 需求 → 任務；交付項是需求下的交付單元
            - 回答產研問題時按「結論 → 風險與建議 → 口徑」組織；工具已返回 view 時，明細由系統卡片渲染，正文不要重複表格
            - 待我審批/待分配/待我處理/待我驗收用 rdm_my_todos；查某狀態需求用 rdm_query_requirements；查某人做了什麼用 rdm_person_workload
            - 項目/需求/迭代必須帶編號；人名或項目名模糊時先列候選讓用戶選，不要猜
            - 若工具返回 scope.restricted=true，必須在回覆中寫明「僅顯示與您相關的數據」
            - 推送必須先調用 rdm_prepare_progress_push 生成預覽；生成後只說「已生成推送預覽，請在確認卡確認」，不得說已發送""";

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
    /** 配置中心：能力清单/回答骨架/术语口径（可为空，空则回退代码内置 Prompt） */
    private final AiPromptConfigService promptConfigService;
    /** 当前登录人：工具角色/部门可见性；非 Web 上下文为 null（暗退为全员可见） */
    private final OperatorResolver operatorResolver;
    /** 输入/输出合规护栏 */
    private final AiGuardrailService guardrailService;
    /** 自动记忆候选（只生成建议，用户确认后才落库） */
    private final AiUserMemoryService memoryService;

    @Data
    public static class OrchestrateRequest {
        /** OpenAI Chat Completions 兼容消息数组（role/content/tool_calls 等） */
        private List<Map<String, Object>> messages;
        private Long conversationPk;
        /** auto / primary / off-peak */
        private String mode = "auto";
        /** 配置中心试跑：用草稿组装好的完整 Prompt 覆盖线上 Prompt */
        private String systemPromptOverride;
        /** 试跑：不写会话事件、不暴露外部工具与推送工具 */
        private boolean sandbox;
        /** 试跑：完全不使用工具，只测回答风格 */
        private boolean disableTools;
        /** 当前业务系统（rdm/finance/eam/hr…）：决定取哪套骨架/护栏/记忆；空=共用 */
        private String systemCode;
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

        /** 服务端生成的结构化视图（前端渲染指标卡/表格）；最多 3 个 */
        private List<AgentView> views = new ArrayList<>();

        /** 待用户确认的动作（当前仅推送）；最多 1 个 */
        private List<AgentPendingAction> pendingActions = new ArrayList<>();
        /** 自动记忆候选：用户消息里明确“记住/以后都…”时给出，前端一键确认后落库 */
        private String memorySuggestion;
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
        SysUser currentUser = currentUser();
        String lastUserText = lastUserText(req.getMessages());
        // 输入护栏：命中 block 直接返回，不调模型也不落会话事件（避免敏感内容进入后续上下文）
        AiGuardrailService.GuardResult inputGuard = guardrailService == null
                ? null : guardrailService.checkInput(lastUserText, req.getSystemCode());
        String effectiveUserText = lastUserText;
        if (inputGuard != null) {
            if (inputGuard.isBlocked()) {
                appendEvent(req.getConversationPk(), "POLICY_DECISION", username,
                        Map.of("decision", "reject", "reason", "guardrail_input"));
                out.setErrorKind("guardrail_blocked");
                out.setText(inputGuard.getMessage());
                return out;
            }
            if (StringUtils.hasText(inputGuard.getText())) effectiveUserText = inputGuard.getText();
            if (!inputGuard.getWarnings().isEmpty()) {
                appendEvent(req.getConversationPk(), "POLICY_DECISION", username,
                        Map.of("decision", "warn", "reason", "guardrail_input",
                                "count", inputGuard.getWarnings().size()));
            }
        }
        // 工具启停只认 ai_tool_policy；能力清单与实际下发工具必须同源，再叠角色/部门可见性
        Map<String, AiToolPolicy> policyBy = loadPolicyMap();
        List<AgentTool> enabledTools = enabledBuiltInTools(policyBy, currentUser);
        if (req.isDisableTools()) {
            enabledTools = List.of();
        } else if (req.isSandbox()) {
            // 试跑不暴露推送工具：避免在沙箱里生成待确认动作
            enabledTools = enabledTools.stream()
                    .filter(t -> !"rdm_prepare_progress_push".equals(t.toolKey()))
                    .toList();
        }
        // 按当前系统裁剪工具：物资/人事等未接入 AI 工具的系统只保留通用工具（知识库/术语）
        if (StringUtils.hasText(req.getSystemCode())) {
            enabledTools = enabledTools.stream()
                    .filter(t -> AiPromptConfigService.inScope(scopeOf(t.toolKey()), req.getSystemCode()))
                    .toList();
        }
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
        String systemPrompt = StringUtils.hasText(req.getSystemPromptOverride())
                ? req.getSystemPromptOverride() : buildSystemPrompt(enabledTools, effectiveUserText, req.getSystemCode());
        working.add(Map.of("role", "system", "content", systemPrompt));
        working.addAll(withSanitizedLastUser(req.getMessages(), lastUserText, effectiveUserText));

        long totalTokens = 0;
        String modelUsed = channel.getDefaultModelKey();
        List<Map<String, Object>> toolSchemas = allToolSchemas(enabledTools, policyBy, req.isSandbox(), currentUser);
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
                finishWithGuardedText(out, content.isEmpty() ? "（無內容）" : content, username, req, effectiveUserText);
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
                finishWithGuardedText(out, finalContent, username, req, effectiveUserText);
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
                if (!isToolEnabled(name, policyBy, currentUser)) {
                    // 模型可能凭历史记忆调用已停用工具：执行前二次拦截，绝 不“页面关了但接口还能跑”
                    String disabled = "{\"error\":\"工具已停用\",\"hint\":\"請聯繫管理員在 AI 操作授權中開啟\"}";
                    out.getTraces().add(new ToolTrace(name, shortDigest(argsJson), 0, false));
                    working.add(Map.of("role", "tool", "tool_call_id", callId, "content", disabled));
                    recordToolExecLog(name, username, shortDigest(argsJson), 0, false);
                    continue;
                }
                if (!AiPromptConfigService.inScope(scopeOf(name), req.getSystemCode())) {
                    // 系统未接入该能力：即使模型凭历史记忆点名，也不能跨系统查数据
                    String outOfScope = "{\"error\":\"當前系統未接入該能力\",\"hint\":\"請前往對應系統的 AI 助手使用\"}";
                    out.getTraces().add(new ToolTrace(name, shortDigest(argsJson), 0, false));
                    working.add(Map.of("role", "tool", "tool_call_id", callId, "content", outOfScope));
                    recordToolExecLog(name, username, shortDigest(argsJson), 0, false);
                    continue;
                }
                Map<String, Object> args = new LinkedHashMap<>(parseArgs(argsJson));
                // 知识库检索强制收敛到当前系统（common + 本系统），不依赖模型自填 systemCode
                if ("search_knowledge".equals(name) && StringUtils.hasText(req.getSystemCode())) {
                    args.put("systemCode", req.getSystemCode());
                }
                long start = System.currentTimeMillis();
                AgentTool.RichOutput rich = tool.executeRich(args, new AgentTool.ToolCallContext(username, req.getConversationPk()));
                if (rich == null) {
                    // 兼容旧工具/Mockito 桩只实现 execute 的情况：退化为纯文本结果
                    rich = AgentTool.RichOutput.of(tool.execute(args, new AgentTool.ToolCallContext(username, req.getConversationPk())));
                }
                String toolResult = rich.content();
                long cost = System.currentTimeMillis() - start;
                if (rich.view() != null) {
                    addView(out, rich.view());
                }
                if (rich.pendingAction() != null) {
                    out.getPendingActions().add(rich.pendingAction());
                }
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

    private List<Map<String, Object>> builtInToolSchemas(List<AgentTool> enabledTools) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentTool t : enabledTools) {
            String description = promptConfigService == null ? null
                    : promptConfigService.descriptionOf(t.toolKey(), t.description());
            if (description == null) description = t.description();
            out.add(Map.of(
                    "type", "function",
                    "function", Map.of(
                            "name", t.toolKey(),
                            "description", description,
                            "parameters", t.schema())));
        }
        return out;
    }

    /**
     * 内建工具 + 已安装且已授权的外部工具。
     * <p>内建工具也读 ai_tool_policy：存在策略行且 enabled=0 的不下发；
     * 无策略行时保持历史行为（放行），新工具由迁移显式登记 enabled=1。
     * <p>sandbox=true 时只下发内建只读工具，不暴露外部服务。
     */
    private List<Map<String, Object>> allToolSchemas(List<AgentTool> enabledTools,
                                                     Map<String, AiToolPolicy> policyBy, boolean sandbox,
                                                     SysUser currentUser) {
        List<Map<String, Object>> out = new ArrayList<>(builtInToolSchemas(enabledTools));
        if (sandbox) return out;
        Set<String> builtinKeys = new java.util.HashSet<>();
        for (AgentTool t : tools) builtinKeys.add(t.toolKey());
        try {
            List<McpTool> installed = mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                    .eq(McpTool::getInstalled, 1)
                    .eq(McpTool::getSource, "external"));
            if (installed.isEmpty()) return out;
            for (McpTool tool : installed) {
                if (builtinKeys.contains(tool.getToolKey())) continue;
                AiToolPolicy policy = policyBy.get(tool.getToolKey());
                if (policy == null || policy.getEnabled() == null || policy.getEnabled() != 1) continue;
                if (!AiToolVisibility.visible(policy, currentUser)) continue;
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

    /** 工具启停策略快照：一次会话只查一次，避免每轮重复查库。 */
    private Map<String, AiToolPolicy> loadPolicyMap() {
        Map<String, AiToolPolicy> map = new LinkedHashMap<>();
        try {
            for (AiToolPolicy p : toolPolicyMapper.selectList(new LambdaQueryWrapper<>())) {
                if (p.getToolKey() != null) map.put(p.getToolKey(), p);
            }
        } catch (Exception e) {
            log.warn("[AgentOrch] 读取工具策略失败，内建工具按默认放行：{}", e.getMessage());
        }
        return map;
    }

    private List<AgentTool> enabledBuiltInTools(Map<String, AiToolPolicy> policyBy, SysUser currentUser) {
        List<AgentTool> list = new ArrayList<>();
        for (AgentTool t : tools) {
            if (isToolEnabled(t.toolKey(), policyBy, currentUser)) list.add(t);
        }
        return list;
    }

    private boolean isToolEnabled(String toolKey, Map<String, AiToolPolicy> policyBy, SysUser currentUser) {
        AiToolPolicy policy = policyBy.get(toolKey);
        if (policy == null || policy.getEnabled() == null || policy.getEnabled() == 1) {
            // 角色/部门不在可见范围时按停用处理：页面和模型都不能再看到它
            return AiToolVisibility.visible(policy, currentUser);
        }
        return false;
    }

    /** 同一轮最多保留 3 个视图；同 id 去重，避免模型重复调用同一工具刷屏。 */
    private void addView(OrchestrateResult out, AgentView view) {
        if (view == null) return;
        if (view.getId() != null) {
            boolean exists = out.getViews().stream().anyMatch(v -> view.getId().equals(v.getId()));
            if (exists) return;
        }
        if (out.getViews().size() >= 3) out.getViews().remove(0);
        out.getViews().add(view);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParamsJson(String raw) {
        if (raw == null || raw.isBlank()) return Map.of("type", "object", "properties", Map.of());
        try { return objectMapper.readValue(raw, Map.class); }
        catch (Exception e) { return Map.of("type", "object", "properties", Map.of()); }
    }

    private String buildSystemPrompt(List<AgentTool> enabledTools, String userQuery) {
        return buildSystemPrompt(enabledTools, userQuery, null);
    }

    private String buildSystemPrompt(List<AgentTool> enabledTools, String userQuery, String systemCode) {
        String configured = promptConfigService == null ? null
                : promptConfigService.compose(enabledTools, userQuery, systemCode);
        StringBuilder sb = new StringBuilder();
        sb.append(basePrompt());
        if (StringUtils.hasText(configured)) {
            // 配置中心已包含能力清单/术语/骨架/领域规则；安全规则仍由代码追加，配置无法覆盖
            sb.append(configured).append("\n\n");
        } else {
            sb.append("你的能力範圍：\n");
            int i = 1;
            for (AgentTool t : enabledTools) {
                String name = promptConfigService == null ? null
                        : promptConfigService.displayNameOf(t.toolKey(), t.description());
                if (name == null) name = t.description();
                sb.append(i++).append(". ").append(name).append('\n');
            }
            sb.append('\n');
        }
        sb.append(safetyRules());
        return sb.toString();
    }

    /** 代码内置的角色设定（配置中心预览/试跑与线上同源）。 */
    public static String basePrompt() {
        return "你是 MFTB 推廣管理後台的 AI 助手，幫助業務人員快速查詢系統數據。\n\n";
    }

    /** 代码内置的安全不变量（配置无法覆盖）。 */
    public static String safetyRules() {
        return SYSTEM_RULES;
    }

    private AgentTool findTool(String key) {
        for (AgentTool t : tools) {
            if (t.toolKey().equals(key)) return t;
        }
        return null;
    }

    /** 工具归属作用域：能力表 domain 优先，缺失时按前缀推断；配置中心不可用时退化为全局放行。 */
    private String scopeOf(String toolKey) {
        try {
            if (promptConfigService != null) {
                String domain = promptConfigService.domainOfTool(toolKey);
                if (StringUtils.hasText(domain)) return domain;
            }
            return inferScope(toolKey);
        } catch (Exception e) {
            log.debug("[AgentOrch] 读取工具作用域失败，按前缀推断: {}", e.getMessage());
            return inferScope(toolKey);
        }
    }

    private static String inferScope(String toolKey) {
        if (toolKey == null) return "common";
        if (toolKey.startsWith("rdm_")) return "rdm";
        if (toolKey.startsWith("query_")) return "finance";
        return "common";
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

    /** 当前登录人；定时/测试等无 Web 上下文时返回 null（工具可见性按全员放行）。 */
    private SysUser currentUser() {
        try {
            return operatorResolver == null ? null : operatorResolver.currentUser();
        } catch (Exception e) {
            log.debug("[AgentOrch] 读取登录人失败，工具可见性按全员处理: {}", e.getMessage());
            return null;
        }
    }

    private static String lastUserText(List<Map<String, Object>> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, Object> m = messages.get(i);
            if ("user".equals(m.get("role"))) {
                Object content = m.get("content");
                return content == null ? "" : String.valueOf(content);
            }
        }
        return "";
    }

    /**
     * 护栏 replace 动作需要把改写后的用户输入带入模型。
     * <p>请求消息可能是 Map.of 产生的不可变对象，必须复制后再改；只改最后一条 user。
     */
    private static List<Map<String, Object>> withSanitizedLastUser(List<Map<String, Object>> raw,
                                                                  String original, String sanitized) {
        List<Map<String, Object>> trimmed = trimMessages(raw);
        if (!StringUtils.hasText(sanitized) || sanitized.equals(original)) return trimmed;
        for (int i = trimmed.size() - 1; i >= 0; i--) {
            if ("user".equals(trimmed.get(i).get("role"))) {
                Map<String, Object> copy = new LinkedHashMap<>(trimmed.get(i));
                copy.put("content", sanitized);
                trimmed.set(i, copy);
                break;
            }
        }
        return trimmed;
    }

    /** 输出护栏 + 自动记忆候选：所有正常回答都从这里出口，避免漏掉某条 return。 */
    private void finishWithGuardedText(OrchestrateResult out, String content, String username,
                                       OrchestrateRequest req, String effectiveUserText) {
        String text = content;
        if (guardrailService != null) {
            AiGuardrailService.GuardResult guard = guardrailService.checkOutput(text, req.getSystemCode());
            if (guard != null && guard.isBlocked()) {
                appendEvent(req.getConversationPk(), "POLICY_DECISION", username,
                        Map.of("decision", "reject", "reason", "guardrail_output"));
                out.setErrorKind("guardrail_blocked");
                out.setText(guard.getMessage());
                return;
            }
            if (guard != null) {
                if (guard.getText() != null) text = guard.getText();
                if (guard.getWarnings() != null && !guard.getWarnings().isEmpty()) {
                    appendEvent(req.getConversationPk(), "POLICY_DECISION", username,
                            Map.of("decision", "warn", "reason", "guardrail_output",
                                    "count", guard.getWarnings().size()));
                }
            }
        }
        out.setText(text);
        if (!req.isSandbox() && memoryService != null && StringUtils.hasText(text)) {
            out.setMemorySuggestion(memoryService.suggestFromMessage(effectiveUserText));
        }
    }

    private void appendEvent(Long conversationPk, String type, String actor, Map<String, Object> payload) {
        if (conversationPk == null) return;
        try { eventService.append(conversationPk, null, type, actor, payload); }
        catch (Exception e) { log.warn("[AgentOrch] 事件写入失败 type={}: {}", type, e.getMessage()); }
    }
}
