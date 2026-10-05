package com.mftb.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.LlmUsageRecordRequest;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RDM AI 辅助（M4+）：PRD 草稿生成、逾期风险摘要。
 *
 * <p>三条纪律（对齐项目既有 AI 网关的做法，不另立规则）：
 * <ol>
 *   <li><b>额度与账本同源</b>：走 {@link LlmChannelRouter} 取通道、{@link AiMyCenterService} 校验配额、
 *       {@link LlmUsageService} 记账 —— RDM 的消耗必须出现在同一张「使用统计」里，
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
    /** 风险摘要最多带多少条风险需求进 prompt */
    private static final int MAX_RISK_ITEMS = 12;

    private final RdmRequirementMapper requirementMapper;
    private final RdmPrdMapper prdMapper;
    private final RdmCommentMapper commentMapper;
    private final LlmChannelRouter channelRouter;
    private final AiMyCenterService myCenterService;
    private final LlmUsageService llmUsageService;
    private final RdmConfigService configService;
    /** 风险取数唯一入口所在：摘要与页面列表必须共用，所以这里依赖而不是再写一份 SQL */
    private final RdmAnalyticsService analyticsService;
    private final RestTemplate restTemplate;
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
                caller, "risk_summary");
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
            points.add("逾期 " + overdue.size() + " 條，最久 " + overdue.get(0).getDays() + " 天未推进");
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
        sb.append("統計窗口：近 ").append(window).append(" 天。\n");
        sb.append("要點：").append(String.join("；", highlights)).append('\n');
        sb.append("明細（最多 ").append(MAX_RISK_ITEMS).append(" 條）：\n");
        risks.stream().limit(MAX_RISK_ITEMS).forEach(r -> sb.append("-")
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
     * 统一的单次 LLM 调用：熔断/配额由入口层与 {@link AiMyCenterService} 负责，
     * 这里保证「调用成功即记账」，失败不记账（没有消耗就不该出现在账本上）。
     */
    private ChatResult chat(String systemPrompt, String userPrompt, String caller, String purpose) {
        if (!StringUtils.hasText(caller)) {
            return new ChatResult(null, null, 0, null, "登錄狀態失效，請重新登錄後使用 AI 輔助");
        }
        LlmChannelRouter.Channel channel = resolveChannel(caller);
        if (channel == null) {
            return new ChatResult(null, null, 0, null, "當前賬號沒有可用的 AI 模型，請聯繫管理員開通");
        }
        var quota = myCenterService.checkQuota(null, channel.getDefaultModelKey());
        if (quota != null && "reject".equals(quota.getAction())) {
            return new ChatResult(null, channel.getDefaultModelKey(), 0, channel.getLabel(),
                    quota.getMessage() == null ? "已超出本月 AI 額度，無法使用" : quota.getMessage());
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", channel.getDefaultModelKey());
        payload.put("temperature", 0.4);
        payload.put("max_tokens", MAX_OUTPUT_TOKENS);
        payload.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)));
        long started = System.currentTimeMillis();
        JsonNode resp = post(channel, payload);
        if (resp == null) {
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
            return new ChatResult(null, model, 0, channel.getLabel(), "AI 未返回內容，請重試或手工填寫");
        }
        recordUsage(caller, channel, model, promptTokens, completionTokens);
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

    /** 用量记进与 AI 助手同一张账，避免「绕过计量偷跑模型」 */
    private void recordUsage(String caller, LlmChannelRouter.Channel channel, String model,
                             int promptTokens, int completionTokens) {
        try {
            LlmUsageRecordRequest record = new LlmUsageRecordRequest();
            record.setMode("auto");
            record.setChannel(StringUtils.hasText(channel.getLabel()) ? channel.getLabel() : LlmChannelRouter.CHANNEL_PRIMARY);
            record.setModel(model);
            record.setPromptTokens(promptTokens);
            record.setCompletionTokens(completionTokens);
            llmUsageService.record(caller, record);
        } catch (Exception e) {
            // 记账失败不能把已经生成的内容丢掉；但必须留警告，账本缺口要能被查出来
            log.warn("RDM AI 用量上報失敗（結果仍返回）: caller={}, model={}, msg={}", caller, model, e.getMessage());
        }
    }

    /** 状态中文名走配置表（状态机可自定义名称，不能写死） */
    private String statusLabel(String status) {
        if (!StringUtils.hasText(status)) {
            return "-";
        }
        return configService.statusLabelMap().getOrDefault(status, status);
    }

    private JsonNode post(LlmChannelRouter.Channel channel, Map<String, Object> payload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (StringUtils.hasText(channel.getApiKey())) {
                headers.setBearerAuth(channel.getApiKey());
            }
            var resp = restTemplate.exchange(endpoint(channel.getBaseUrl()),
                    org.springframework.http.HttpMethod.POST,
                    new HttpEntity<>(payload, headers), String.class);
            String body = resp.getBody();
            if (!StringUtils.hasText(body)) {
                return null;
            }
            return objectMapper.readTree(body);
        } catch (Exception e) {
            log.warn("RDM AI 網關請求異常: {}", e.getMessage());
            return null;
        }
    }

    private static String endpoint(String base) {
        if (!StringUtils.hasText(base)) {
            throw new IllegalStateException("AI 通道缺少 baseUrl");
        }
        String trimmed = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        return trimmed.endsWith("/chat/completions") ? trimmed : trimmed + "/chat/completions";
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
