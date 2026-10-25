package com.mftb.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmAssistantVO;
import com.mftb.admin.dto.RdmDashboardVO;
import com.mftb.admin.entity.RdmComment;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.common.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * RDM AI 辅助（M4+）：PRD 草稿生成、逾期风险摘要。
 *
 * <p>三条纪律（对齐项目既有 AI 网关的做法，不另立规则）：
 * <ol>
 *   <li><b>额度与账本同源</b>：走 {@link LlmChannelRouter} 取通道、{@link com.mftb.admin.service.agent.AiModelAdmissionService} 统一准入、
 *       {@link com.mftb.admin.service.agent.LlmMeteringService} 计量 —— RDM 的消耗必须出现在同一张「使用统计」里，
 *       否则会出现"绕过计量偷跑模型"的审计盲区。</li>
 *   <li><b>AI 不参与判定</b>：草稿只填表单不落库；风险摘要里"哪些需求逾期"来自 SQL，
 *       大模型只负责把要点写成一段话。数字绝不由模型产出。</li>
 *   <li><b>失败必须可见</b>：调用不通时返回 {@code aiUsed=false} + 提示语，
 *       而不是静默返回一段模板文字冒充 AI 结果。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmAssistantService {

    /** 单次生成的输出上限，避免一次草稿吃掉整份额度 */
    private static final int MAX_OUTPUT_TOKENS = 1200;
    /**
     * 风险取数上限与看板共用：历史上这里是 12、看板是 20，同页并列会出现两套总数。
     */
    private static final int MAX_RISK_ITEMS = RdmAnalyticsService.RISK_QUERY_LIMIT;
    /** 发给模型的明细条数上限：只影响叙述质量，不影响统计口径 */
    private static final int AI_PROMPT_RISK_LIMIT = 12;
    /** 通用 AI 调用上限：超过后走“本地结构化”兜底，不让整页被上游拖死。 */
    private static final long DEFAULT_AI_TIMEOUT_MS = 20_000L;
    /** 风险摘要是首屏阻塞项，只给 8 秒：超时直接回落结构化要点。 */
    private static final long RISK_AI_TIMEOUT_MS = 8_000L;
    private static final ExecutorService AI_CALL_POOL = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "rdm-ai-call");
        t.setDaemon(true);
        return t;
    });

    private final RdmRequirementMapper requirementMapper;
    private final RdmPrdMapper prdMapper;
    private final RdmCommentMapper commentMapper;
    /** 需求级访问守卫：AI 草稿会把需求正文送给模型，必须先过资源归属 */
    private final RdmAccessGuard accessGuard;
    private final LlmChannelRouter channelRouter;
    private final com.mftb.admin.service.agent.AiModelAdmissionService admissionService;
    private final com.mftb.admin.service.agent.LlmMeteringService metering;
    private final RdmConfigService configService;
    /** 风险取数唯一入口所在：摘要与页面列表必须共用，所以这里依赖而不是再写一份 SQL */
    private final RdmAnalyticsService analyticsService;
    private final LlmHttpClient llmClient;
    private final ObjectMapper objectMapper;

    /** 一次 LLM 调用的结果 */
    private record ChatResult(String text, String model, long tokens, String channel, String error) {
        boolean failed() {
            return error != null || !StringUtils.hasText(text);
        }
    }

    /* ==================== PRD 草稿 ==================== */

    /**
     * 生成 PRD 草稿（不落库，由产品经理在表单里确认后再保存）。
     *
     * @param reqId  需求ID
     * @param caller 当前登录人（记账与配额主体）
     */
    public RdmAssistantVO.PrdDraft prdDraft(Long reqId, String caller) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        // 不收数据范围的话，任何持菜单 edit 的人都能凭 id 把别人需求的正文送进大模型（既是越权读，也是数据外流）
        accessGuard.requireDeliveryWriter(reqId, "生成 PRD 草稿");
        RdmAssistantVO.PrdDraft draft = new RdmAssistantVO.PrdDraft();
        draft.setReqId(req.getId());
        draft.setTitle(req.getTitle());
        draft.setAiGenerated(false);

        ChatResult chat = chat(buildPrdSystemPrompt(), buildPrdUserPrompt(req), caller, "prd_draft");
        if (chat.failed()) {
            draft.setNotice(chat.error() == null ? "AI 草稿生成失敗，請手工填寫" : chat.error());
            return draft;
        }
        ParsedDraft parsed = parseDraft(chat.text());
        if (parsed == null) {
            draft.setNotice("AI 返回內容無法解析，請手工填寫或重試");
            log.warn("RDM PRD 草稿解析失敗: reqId={}, raw={}", reqId, abbrev(chat.text()));
            return draft;
        }
        draft.setTitle(StringUtils.hasText(parsed.title()) ? parsed.title() : req.getTitle());
        draft.setTargetUsers(parsed.targetUsers());
        draft.setFeatureList(parsed.features());
        draft.setAcceptanceCriteria(parsed.criteria());
        draft.setBoundary(parsed.boundary());
        draft.setRisks(parsed.risks());
        draft.setAiGenerated(true);
        draft.setModel(chat.model());
        draft.setTokens(chat.tokens());
        return draft;
    }

    private String buildPrdSystemPrompt() {
        return """
                你是资深产品经理，负责把业务方提交的需求整理成可交付的 PRD 草稿。
                严格要求：
                - 使用繁體中文輸出。
                - 只輸出 JSON，不要 markdown 代码块、不要解釋性文字。
                - 只能依據輸入的事實撰寫，禁止編造系統名稱、字段、接口路徑或數字。
                - 驗收標準必須是「可觀察、可判定」的單條陳述（能回答「這條過了嗎」），
                  禁止「體驗流暢」「提升效率」這類無法驗證的描述；寫不出來就用輸入中的原始期望拆解。
                - 功能清單控制在 3~8 條，驗收標準 3~8 條，每條不超過 40 字。
                JSON 結構：
                {"title":"...","targetUsers":"...","features":["..."],
                 "criteria":["..."],"boundary":"...","risks":"..."}
                其中 boundary 写范围边界与不做的事项，risks 写依赖与不确定性。
                """;
    }

    private String buildPrdUserPrompt(RdmRequirement req) {
        List<RdmPrd> existing = prdMapper.selectList(new LambdaQueryWrapper<RdmPrd>()
                .eq(RdmPrd::getReqId, req.getId()).orderByDesc(RdmPrd::getId).last("LIMIT 1"));
        List<RdmComment> comments = commentMapper.selectList(new LambdaQueryWrapper<RdmComment>()
                .eq(RdmComment::getReqId, req.getId()).orderByAsc(RdmComment::getId).last("LIMIT 20"));
        StringBuilder sb = new StringBuilder();
        sb.append("【需求編號】").append(req.getReqNo()).append('\n');
        sb.append("【標題】").append(req.getTitle()).append('\n');
        sb.append("【類型/優先級/複雜度】")
                .append(nullSafe(req.getReqType())).append(" / ")
                .append(nullSafe(req.getPriority())).append(" / ")
                .append(nullSafe(req.getComplexity())).append('\n');
        sb.append("【現狀與痛點】").append(nullSafe(req.getDescription())).append('\n');
        sb.append("【期望結果】").append(nullSafe(req.getExpectResult())).append('\n');
        sb.append("【業務價值】").append(nullSafe(req.getBusinessValue())).append('\n');
        sb.append("【提出人/部門】").append(nullSafe(req.getSubmitterName())).append(" / ")
                .append(nullSafe(req.getSubmitDeptName())).append('\n');
        if (!existing.isEmpty() && StringUtils.hasText(existing.get(0).getAcceptanceCriteria())) {
            sb.append("【已有 PRD 驗收標準（若無相關性可忽略）】")
                    .append(abbrev(existing.get(0).getAcceptanceCriteria())).append('\n');
        }
        if (!comments.isEmpty()) {
            sb.append("【溝通記錄】\n");
            for (RdmComment c : comments) {
                // 评论表只存创建人签名（无单独作者名列），内部沟通也一并输人 prompt：
                // 边界与依赖往往就写在内部评论里
                sb.append("- ").append(nullSafe(c.getCreatedBy())).append("：")
                        .append(abbrev(c.getContent(), 200)).append('\n');
            }
        }
        return sb.toString();
    }

    /** 解析模型返回的 JSON（容忍被 ```json 包裹或前后带说明文字的情况） */
    private ParsedDraft parseDraft(String raw) {
        String json = extractJsonObject(raw);
        if (json == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            return new ParsedDraft(
                    text(node, "title"),
                    text(node, "targetUsers"),
                    stringList(node, "features"),
                    stringList(node, "criteria"),
                    text(node, "boundary"),
                    text(node, "risks"));
        } catch (Exception e) {
            return null;
        }
    }

    /** PRD 草稿解析结果 */
    private record ParsedDraft(String title, String targetUsers, List<String> features,
                               List<String> criteria, String boundary, String risks) {
    }

    /* ==================== 风险摘要 ==================== */

    /**
     * 逾期风险摘要。
     * <p>先由 SQL 算出确定性事实（哪些需求逾期/阻塞/停滞、停留多少天），
     * 再让大模型把它写成一段管理视角的摘要；模型不可用时保留结构化要点。
     */
    public RdmAssistantVO.RiskSummary riskSummary(int minStayDays, String caller) {
        // 这里的数字是「停留至少多少天」而不是「近 N 天提单」：旧实现收着 days 参数却根不用在 SQL 里，
        // 导致页面写“近 14 天风险摘要”其实给的是全量当前快照，说好的窗口根本没生效
        int stay = Math.min(Math.max(minStayDays, 0), 90);
        RdmAssistantVO.RiskSummary summary = new RdmAssistantVO.RiskSummary();
        summary.setDays(stay);
        summary.setAiUsed(false);

        List<RdmAssistantVO.RiskItem> risks = loadRisks(stay);
        summary.setTopRisks(risks);
        summary.setHighlights(buildHighlights(risks));

        if (risks.isEmpty()) {
            summary.setNarrative(stay > 0
                    ? "沒有在当前狀態停留滿 " + stay + " 天的風險需求，交付鏈路目前暢通。"
                    : "當前沒有逾期、阻塞、無主或審批停滯的需求，交付鏈路目前暢通。");
            summary.setAiUsed(false);
            return summary;
        }
        ChatResult chat = chat(buildRiskSystemPrompt(), buildRiskUserPrompt(stay, risks, summary.getHighlights()),
                caller, "risk_summary", RISK_AI_TIMEOUT_MS);
        if (chat.failed()) {
            summary.setNarrative(String.join("；", summary.getHighlights()) + "。");
            summary.setNotice(chat.error() == null ? "AI 摘要生成失敗，已改用結構化要點" : chat.error());
            return summary;
        }
        summary.setNarrative(chat.text().trim());
        summary.setAiUsed(true);
        summary.setModel(chat.model());
        return summary;
    }

    /**
     * 风险取数：直接复用 {@link RdmAnalyticsService#riskList(int, int)}。
     * <p>不再自写一份 SQL：之前两份的定义相同但 LIMIT 与过滤条件不一致，同页并列时会“对不上”。
     */
    private List<RdmAssistantVO.RiskItem> loadRisks(int minStayDays) {
        List<RdmAssistantVO.RiskItem> list = new ArrayList<>();
        for (RdmDashboardVO.Risk risk : analyticsService.riskList(MAX_RISK_ITEMS, minStayDays)) {
            RdmAssistantVO.RiskItem item = new RdmAssistantVO.RiskItem();
            item.setReqId(risk.getReqId());
            item.setReqNo(risk.getReqNo());
            item.setTitle(risk.getTitle());
            item.setStatus(risk.getStatus());
            item.setHandler(risk.getHandler());
            item.setDays(risk.getDays() == null ? 0 : risk.getDays().intValue());
            item.setRiskType(risk.getRiskType());
            list.add(item);
        }
        return list;
    }

    /** 结构化要点（AI 不可用时也能行动） */
    private List<String> buildHighlights(List<RdmAssistantVO.RiskItem> risks) {
        List<String> points = new ArrayList<>();
        Map<String, List<RdmAssistantVO.RiskItem>> byType = new LinkedHashMap<>();
        for (RdmAssistantVO.RiskItem r : risks) {
            byType.computeIfAbsent(r.getRiskType() == null ? "OTHER" : r.getRiskType(), k -> new ArrayList<>()).add(r);
        }
        List<RdmAssistantVO.RiskItem> blocked = byType.get("BLOCKED");
        if (blocked != null && !blocked.isEmpty()) {
            points.add("阻塞 " + blocked.size() + " 條：" + blocked.get(0).getReqNo() + "（" + blocked.get(0).getHandler() + "）");
        }
        List<RdmAssistantVO.RiskItem> overdue = byType.get("OVERDUE");
        if (overdue != null && !overdue.isEmpty()) {
            points.add("逾期 " + overdue.size() + " 條，最久 " + overdue.get(0).getDays() + " 天未推進");
        }
        List<RdmAssistantVO.RiskItem> stuck = byType.get("INTAKE_STUCK");
        if (stuck != null && !stuck.isEmpty()) {
            points.add("審批停滯 " + stuck.size() + " 條，需催辦審批人");
        }
        List<RdmAssistantVO.RiskItem> unassigned = byType.get("UNASSIGNED");
        if (unassigned != null && !unassigned.isEmpty()) {
            points.add("無主需求 " + unassigned.size() + " 條，請技術負責人盡快分發");
        }
        List<RdmAssistantVO.RiskItem> stagnant = byType.get("STAGNANT");
        if (stagnant != null && !stagnant.isEmpty()) {
            points.add("超 7 天無進展 " + stagnant.size() + " 條");
        }
        return points;
    }

    private String buildRiskSystemPrompt() {
        return """
                你是研发项目经理的助手，负责把风险数据写成一段给管理层看的摘要。
                要求：繁體中文；200 字以内；只依据输入的事实，不得新增数字或需求；
                明确指出「谁」「多少天」「什么环节」需要动作，避免「需关注」「有待提升」这类无信息措辞；
                不要 markdown、不要列表符号，输出纯段落。
                """;
    }

    private String buildRiskUserPrompt(int window, List<RdmAssistantVO.RiskItem> risks, List<String> highlights) {
        StringBuilder sb = new StringBuilder();
        sb.append("統計窗口：").append(window > 0
                ? "停留 ≥ " + window + " 天的風險需求"
                : "全部風險需求（不按停留天數過濾）").append("。\n");
        sb.append("要點：").append(String.join("；", highlights)).append('\n');
        sb.append("明細（最多 ").append(AI_PROMPT_RISK_LIMIT).append(" 條）：\n");
        risks.stream().limit(AI_PROMPT_RISK_LIMIT).forEach(r -> sb.append("-")
                .append(' ').append(r.getReqNo()).append(' ').append(r.getTitle())
                .append("｜狀態 ").append(statusLabel(r.getStatus()))
                .append("｜處理人 ").append(r.getHandler())
                .append("｜停留 ").append(r.getDays()).append(" 天")
                .append("｜風險類型 ").append(r.getRiskType())
                .append('\n'));
        return sb.toString();
    }

    /* ==================== 通道与记账 ==================== */

    /**
     * 统一的单次 LLM 调用：身份、急停、模型授权与额度由 {@link com.mftb.admin.service.agent.AiModelAdmissionService} 负责，
     * 这里保证「调用成功即记账」，失败不记账（没有消耗就不该出现在账本上）。
     */
    private ChatResult chat(String systemPrompt, String userPrompt, String caller, String purpose) {
        return chat(systemPrompt, userPrompt, caller, purpose, DEFAULT_AI_TIMEOUT_MS);
    }

    /**
     * 带超时的 LLM 调用。
     * <p>上游慢时不能无限等：超时后把 Future 取消并返回可读错误，由调用方回落到本地结构化要点。
     * 线程池固定 4 个守护线程，避免每次调用新建线程。
     */
    private ChatResult chat(String systemPrompt, String userPrompt, String caller, String purpose, long timeoutMs) {
        if (!StringUtils.hasText(caller)) {
            return new ChatResult(null, null, 0, null, "登錄狀態失效，請重新登錄後使用 AI 輔助");
        }
        var availability = admissionService.checkContext(caller, "rdm");
        if (!availability.allowed()) return new ChatResult(null, null, 0, null, availability.message());
        LlmChannelRouter.Channel channel = resolveChannel(caller);
        if (channel == null) {
            return new ChatResult(null, null, 0, null, "當前賬號沒有可用的 AI 模型，請聯繫管理員開通");
        }
        var admission = admissionService.check(caller, channel.getDefaultModelKey());
        if (!admission.allowed()) {
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), admission.message());
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", channel.getDefaultModelKey());
        payload.put("temperature", 0.4);
        payload.put("max_tokens", MAX_OUTPUT_TOKENS);
        payload.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)));
        var prepared = admissionService.prepare(caller, channel, payload, "rdm");
        if (!prepared.decision().allowed()) {
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), prepared.decision().message());
        }
        String requestId = "rdm-" + java.util.UUID.randomUUID();
        try {
            metering.reserve(requestId, caller, channel, Math.max(1, (systemPrompt.length() + userPrompt.length()) / 4), MAX_OUTPUT_TOKENS);
        } catch (BusinessException denied) {
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), denied.getMessage());
        }
        long started = System.currentTimeMillis();
        JsonNode resp;
        Future<JsonNode> future = null;
        try {
            String baseUrl = channel.getBaseUrl();
            String apiKey = channel.getApiKey();
            future = AI_CALL_POOL.submit(() -> llmClient.chatCompletion(baseUrl, apiKey, prepared.payload()));
            resp = future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            if (future != null) future.cancel(true);
            metering.release(requestId, "TIMEOUT");
            log.warn("RDM AI 調用逾時: purpose={}, caller={}, elapsed={}ms, timeout={}ms",
                    purpose, caller, System.currentTimeMillis() - started, timeoutMs);
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(),
                    "AI 摘要生成逾時，已改用結構化要點");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            metering.release(requestId, "INTERRUPTED");
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(),
                    "AI 服務被中斷，請稍後再試");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof LlmHttpClient.LlmCallException le) {
                metering.release(requestId, le.getCategory().name());
                log.warn("RDM AI 調用失敗[{}]: purpose={}, caller={}, elapsed={}ms, detail={}", le.getCategory(),
                        purpose, caller, System.currentTimeMillis() - started, le.getMessage());
                return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), le.userMessage());
            }
            metering.release(requestId, "UNEXPECTED");
            log.warn("RDM AI 調用異常: purpose={}, caller={}, elapsed={}ms, detail={}",
                    purpose, caller, System.currentTimeMillis() - started, String.valueOf(cause));
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), "AI 服務暫時不可用，請稍後再試");
        }
        if (resp == null) {
            metering.release(requestId, "empty_body");
            log.warn("RDM AI 調用失敗: purpose={}, caller={}, elapsed={}ms", purpose, caller, System.currentTimeMillis() - started);
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(), "AI 服務暫時不可用，請稍後再試");
        }
        String text = resp.path("choices").path(0).path("message").path("content").asText(null);
        JsonNode usage = resp.path("usage");
        int promptTokens = usage.path("prompt_tokens").asInt(0);
        int completionTokens = usage.path("completion_tokens").asInt(0);
        String model = StringUtils.hasText(resp.path("model").asText(null))
                ? resp.path("model").asText() : channel.getDefaultModelKey();
        if (!StringUtils.hasText(text)) {
            metering.release(requestId, "empty_text");
            return new ChatResult(null, model, 0, channel.getLabel(), "AI 未返回內容，請重試或手工填寫");
        }
        metering.settle(requestId, caller, "auto", channel, resp);
        log.info("RDM AI 調用完成: purpose={}, caller={}, model={}, tokens={}, elapsed={}ms",
                purpose, caller, model, (long) promptTokens + completionTokens, System.currentTimeMillis() - started);
        return new ChatResult(text, model, (long) promptTokens + completionTokens, channel.getLabel(), null);
    }

    /** 主通道优先，不可用时回落离峰通道（与 AI 助手一致） */
    private LlmChannelRouter.Channel resolveChannel(String caller) {
        LlmChannelRouter.Channel primary = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, caller);
        if (primary != null) {
            return primary;
        }
        return channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_OFF_PEAK, caller);
    }

    /** 状态中文名走配置表（状态机可自定义名称，不能写死） */
    private String statusLabel(String status) {
        if (!StringUtils.hasText(status)) {
            return "-";
        }
        return configService.statusLabelMap().getOrDefault(status, status);
    }

    /* ==================== 小工具 ==================== */

    private static String extractJsonObject(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        return start >= 0 && end > start ? raw.substring(start, end + 1) : null;
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static List<String> stringList(JsonNode node, String field) {
        List<String> list = new ArrayList<>();
        JsonNode arr = node.path(field);
        if (arr.isArray()) {
            arr.forEach(item -> {
                String value = item.asText(null);
                if (StringUtils.hasText(value)) {
                    list.add(value.trim());
                }
            });
        }
        return list;
    }

    private static String nullSafe(String value) {
        return StringUtils.hasText(value) ? value.trim() : "（未填寫）";
    }

    private static String abbrev(String value) {
        return abbrev(value, 600);
    }

    private static String abbrev(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max) + "…";
    }
}
