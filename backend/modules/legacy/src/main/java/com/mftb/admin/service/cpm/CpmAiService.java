/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.fasterxml.jackson.databind.JsonNode;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmAiExtraction;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmAiExtractionMapper;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.service.agent.AiModelAdmissionService;
import com.mftb.admin.service.agent.AiOutboundPolicyService;
import com.mftb.admin.service.agent.AiSceneService;
import com.mftb.admin.service.agent.AiUpstreamErrorCodes;
import com.mftb.admin.service.agent.BudgetReservationService;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.service.agent.LlmMeteringService;
import com.mftb.admin.service.agent.platform.AiBudgetPoolService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * CPM AI 提取服务：完整复刻会议纪要的安全链路（场景门禁/幂等/限流/预算/计量/白名单校验），
 * 差异只在任务内核（流水账→条目）与更简单的输入（原文随请求体提交，无笔记表版本基线）。
 *
 * <p>治理不变式：
 * 1. 预检与执行同源（evaluate 就绪才允许调模型，超管豁免同纪要口径）；
 * 2. requestKey 幂等：同键同哈希返回原结果、同键换内容拒绝——重试永不双扣费；
 * 3. 模型输出是不可信输入：分类白名单 + 状态/进度边界 + sourceRefs 必须能指认回原文；
 * 4. payload 限期清除：原文是敏感正文，台账不能变第二份永久档案；
 * 5. 确认前不落正式条目：候选只存 result_json，用户勾选后 confirm 才写 biz_cpm_item。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmAiService {

    private static final int RATE_PER_MINUTE = 6;
    private static final int MAX_CONCURRENT_RUNNING = 1;
    private static final long MODEL_BUDGET_MS = 60_000L;
    /** 摘要润色的 Prompt 版本（与提取分离：改摘要话术不影响提取台账的追溯口径） */
    private static final String SUMMARY_PROMPT_VERSION = "cpm-summary-v1";
    private static final ExecutorService POOL = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "cpm-ai");
        t.setDaemon(true);
        return t;
    });

    private final CpmAiExtractionMapper extractionMapper;
    private final CpmItemMapper itemMapper;
    private final CpmAiPrompt prompt;
    private final CpmItemService itemService;
    private final CpmSnapshotBuilder snapshotBuilder;
    private final CpmAccessGuard guard;
    private final AiSceneService sceneService;
    private final AiModelAdmissionService admissionService;
    private final AiOutboundPolicyService outboundPolicyService;
    private final LlmChannelRouter channelRouter;
    private final LlmHttpClient llmClient;
    private final LlmMeteringService metering;
    private final BudgetReservationService budgetService;
    private final OperatorResolver operatorResolver;
    private final CpmPeriods periods;

    /* ==================== 预检 ==================== */

    public CpmDto.AiStatusVO status() {
        SysUser current = guard.currentUser();
        CpmDto.AiStatusVO vo = new CpmDto.AiStatusVO();
        vo.setMaxInputChars(CpmConstants.AI_INPUT_MAX);
        vo.setAsrMaxSeconds(CpmConstants.ASR_AUDIO_MAX_SECONDS);
        vo.setEnabled(sceneService.isSceneEnabled(CpmConstants.SCENE_CPM_REPORT));
        if (operatorResolver.isAdmin(current)) {
            vo.setAvailable(true);
            vo.setAuthorized(true);
            vo.setChecks(null);
            return vo;
        }
        com.mftb.admin.dto.AiSceneDto.DiagnosisVO readiness =
                sceneService.evaluate(CpmConstants.SCENE_CPM_REPORT, current);
        vo.setAvailable(readiness.isReady());
        vo.setAuthorized(readiness.isAuthorized());
        vo.setReasonCode(readiness.getReasonCode());
        vo.setMessage(readiness.getMessage());
        vo.setChecks(readiness.getChecks());
        return vo;
    }

    /* ==================== 提取 ==================== */

    public CpmDto.AiExtractionVO extract(CpmDto.AiExtractionForm form) {
        SysUser current = guard.currentUser();
        if (!operatorResolver.isAdmin(current)) {
            sceneService.assertExecutable(CpmConstants.SCENE_CPM_REPORT, current);
        }
        String requestKey = requireKey(form.getRequestKey());
        String rawText = form.getRawText() == null ? "" : form.getRawText().trim();
        prompt.requireInputWithinLimit(rawText);
        String inputHash = sha256(rawText);

        CpmAiExtraction replay = extractionMapper.findByRequest(requestKey);
        if (replay != null) {
            if (!Objects.equals(replay.getInputHash(), inputHash)) {
                throw new BusinessException("同一提取識別碼不可用於不同原文");
            }
            return toVO(replay);
        }

        // 限流与单人并发（跨实例以库为准）
        if (extractionMapper.countRecent(current.getId(), LocalDateTime.now().minusMinutes(1)) >= RATE_PER_MINUTE) {
            throw new BusinessException(429, "操作過於頻繁，請稍後再試");
        }
        List<CpmAiExtraction> recent = extractionMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CpmAiExtraction>()
                        .eq(CpmAiExtraction::getUserId, current.getId())
                        .eq(CpmAiExtraction::getStatus, CpmAiExtraction.STATUS_PROCESSING));
        if (recent.size() >= MAX_CONCURRENT_RUNNING) {
            // 已有未结束的请求：直接回它的状态，不并发起第二个（纪要 MAX_CONCURRENT=1 同口径）
            return toVO(recent.get(0));
        }

        Map<String, String> segments = prompt.segment(rawText);
        Map<String, String> whitelist = itemService.categoryLabels();
        // 模板偏好：请求指定优先，否则取词表并集（与条目校验同源，绝不因模板切换让历史分类变非法）
        String templateKey = StringUtils.hasText(form.getTemplateKey()) ? form.getTemplateKey().trim() : null;
        List<String> existingTitles = recentTitles(current.getId());

        CpmAiExtraction row = new CpmAiExtraction();
        row.setRequestKey(requestKey);
        row.setUserId(current.getId());
        row.setStatus(CpmAiExtraction.STATUS_PROCESSING);
        row.setInputHash(inputHash);
        row.setPayloadJson(JsonUtils.toJson(Map.of("rawText", rawText, "templateKey", templateKey == null ? "" : templateKey)));
        row.setPromptVersion(CpmAiPrompt.PROMPT_VERSION);
        row.setSchemaVersion(CpmAiPrompt.SCHEMA_VERSION);
        try {
            extractionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            CpmAiExtraction other = extractionMapper.findByRequest(requestKey);
            return other == null ? throwBusy() : toVO(other);
        }
        return runExtraction(row, rawText, segments, whitelist, existingTitles, current);
    }

    /** 真正调模型：准入 → 预占 → 调用 → 白名单校验 → 落候选。异常都在此收敛为终态。 */
    private CpmDto.AiExtractionVO runExtraction(CpmAiExtraction row, String rawText,
                                                Map<String, String> segments, Map<String, String> whitelist,
                                                List<String> existingTitles, SysUser current) {
        String account = current.getUsername();
        boolean admin = operatorResolver.isAdmin(current);
        LlmChannelRouter.Channel channel = resolveChannel(account);
        if (channel == null) {
            extractionMapper.markFailed(row.getId(), "no_channel");
            return toVO(extractionMapper.selectById(row.getId()));
        }
        // 准入链（系统访问权 → 模型授权/额度 → 出域策略）整体走 admissionService.prepare：
        // 它内部就是 checkContext+check+outboundPolicy 三段，先前另调一次 check 是重复门禁（口径会飘）。
        String userPrompt = prompt.userPrompt(segments, periods.today().toString(), whitelist, existingTitles);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", channel.getDefaultModelKey());
        payload.put("temperature", CpmAiPrompt.TEMPERATURE);
        payload.put("max_tokens", CpmAiPrompt.OUTPUT_MAX_TOKENS);
        payload.put("response_format", Map.of("type", "json_object"));
        payload.put("messages", List.of(
                Map.of("role", "system", "content", prompt.systemPrompt()),
                Map.of("role", "user", "content", userPrompt)));

        // 出域策略（端点批准/内容规则）与纪要同闸；管理员只豁免额度预算，不豁免「未登记的出域」
        AiOutboundPolicyService.Prepared prepared = admin
                ? new AiOutboundPolicyService.Prepared(null, payload)
                : admissionService.prepare(account, channel, payload, "cpm");
        if (prepared.decision() != null && !prepared.decision().allowed()) {
            extractionMapper.markFailed(row.getId(),
                    prepared.decision().errorKind() == null ? "outbound_denied" : prepared.decision().errorKind());
            return toVO(extractionMapper.selectById(row.getId()));
        }
        if (prepared.payload() != null && !prepared.payload().isEmpty()) {
            payload = prepared.payload();
        }

        String requestId = "cpm-ai-" + row.getRequestKey();
        int promptEst = Math.max(1, (prompt.systemPrompt().length() + userPrompt.length()) / 4);
        if (!admin) {
            try {
                budgetService.reserve(requestId, account, channel.getDefaultModelKey(), promptEst,
                        CpmAiPrompt.OUTPUT_MAX_TOKENS, channel.getInputPrice(), channel.getOutputPrice(), channel.getCurrency());
            } catch (AiBudgetPoolService.BudgetDeniedException denied) {
                extractionMapper.markFailed(row.getId(), "budget_exceeded");
                metering.release(requestId, "budget_denied");
                return toVO(extractionMapper.selectById(row.getId()));
            } catch (RuntimeException e) {
                log.warn("[CpmAi] 預算預占失敗，未發起調用 request={}: {}", requestId, e.getMessage());
                extractionMapper.markFailed(row.getId(), "reserve_failed");
                return toVO(extractionMapper.selectById(row.getId()));
            }
        }

        JsonNode resp;
        final Map<String, Object> outboundPayload = payload;
        try {
            Future<JsonNode> future = POOL.submit(
                    () -> llmClient.chatCompletion(channel.getBaseUrl(), channel.getApiKey(), outboundPayload));
            resp = future.get(MODEL_BUDGET_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            metering.release(requestId, "TIMEOUT");
            extractionMapper.markFailed(row.getId(), "upstream_timeout");
            return toVO(extractionMapper.selectById(row.getId()));
        } catch (Exception e) {
            metering.release(requestId, "call_error");
            Throwable cause = e.getCause() instanceof LlmHttpClient.LlmCallException le ? le : e;
            log.warn("[CpmAi] 調用失敗 request={}: {}", requestId, cause.getMessage());
            extractionMapper.markFailed(row.getId(), resolveUpstreamErrorCode(cause));
            return toVO(extractionMapper.selectById(row.getId()));
        }
        if (resp == null) {
            metering.release(requestId, "empty_body");
            extractionMapper.markFailed(row.getId(), "upstream_empty");
            return toVO(extractionMapper.selectById(row.getId()));
        }

        long tokens = admin ? 0 : metering.settle(requestId, account, "auto", channel, resp);
        String usageJson = usageJson(resp, tokens);
        String model = resp.path("model").asText(channel.getDefaultModelKey());
        String content = resp.path("choices").path(0).path("message").path("content").asText(null);
        CpmAiModelOutput output = parseOutput(content);
        CpmDto.AiExtractionVO vo;
        try {
            if (output == null) {
                throw new IllegalArgumentException("invalid_json");
            }
            prompt.validate(output, segments.keySet(), whitelist.keySet());
            vo = new CpmDto.AiExtractionVO();
            vo.setRequestKey(row.getRequestKey());
            vo.setStatus("succeeded");
            vo.setPromptVersion(CpmAiPrompt.PROMPT_VERSION);
            vo.setExtractionSchemaVersion(CpmAiPrompt.SCHEMA_VERSION);
            vo.setCandidates(prompt.toCandidates(output, segments));
            vo.setSummary(output.getSummary());
            vo.setTomorrowPlan(output.getTomorrowPlan() == null ? List.of() : output.getTomorrowPlan());
        } catch (IllegalArgumentException invalid) {
            // 结构无效：token 已实际消耗，落账但标失败，绝不应用半份结果
            log.warn("[CpmAi] 輸出結構無效 request={}: {}", row.getRequestKey(), invalid.getMessage());
            extractionMapper.markFailed(row.getId(), "invalid_structure");
            return toVO(extractionMapper.selectById(row.getId()));
        }
        extractionMapper.markSucceeded(row.getId(), model, JsonUtils.toJson(vo), usageJson);
        return toVO(extractionMapper.selectById(row.getId()));
    }

    /* ==================== 断线重查 ==================== */

    /** 按请求号只读查询（不重调模型；只能读自己的台账——requestKey 不是越权探测的把手）。 */
    public CpmDto.AiExtractionVO get(String requestKey) {
        SysUser current = guard.currentUser();
        CpmAiExtraction row = extractionMapper.findByRequest(requestKey);
        if (row == null || !Objects.equals(row.getUserId(), current.getId())) {
            throw new BusinessException("提取結果不存在或已過期");
        }
        return toVO(row);
    }

    /* ==================== 汇报 AI 摘要 ==================== */

    /**
     * 汇报摘要润色：输入是服务端重算的确定性聚合（结构化事实），输出只有一段 summary 文字。
     * <p>数字不经模型：本方法只润色「概述」，快照 totals/trail 不受影响；ai_summary 位打标披露。
     * 复用提取台账（幂等/限流/计量/预算同链），candidates 恒空。
     */
    public String summarizeReport(String periodType, String periodStartStr, String requestKeyRaw) {
        SysUser current = guard.currentUser();
        if (!operatorResolver.isAdmin(current)) {
            sceneService.assertExecutable(CpmConstants.SCENE_CPM_REPORT, current);
        }
        String requestKey = requireKey(requestKeyRaw);
        CpmPeriods.Period period = periods.resolve(periodType, LocalDate.parse(periodStartStr));
        CpmDto.Snapshot snapshot = snapshotBuilderForSummary(current.getId(), period);
        if (snapshot.getTotals().getTotal() == 0) {
            throw new BusinessException("本週期無條目，無需生成摘要");
        }
        String context = summaryContext(snapshot);
        String inputHash = sha256(context);

        CpmAiExtraction replay = extractionMapper.findByRequest(requestKey);
        if (replay != null) {
            if (!Objects.equals(replay.getInputHash(), inputHash)) {
                throw new BusinessException("同一摘要識別碼不可用於不同內容");
            }
            if (CpmAiExtraction.STATUS_SUCCEEDED.equals(replay.getStatus())) {
                return readSummary(replay.getResultJson());
            }
            if (CpmAiExtraction.STATUS_PROCESSING.equals(replay.getStatus())) {
                throw new BusinessException("摘要處理中，請稍後重試");
            }
            throw new BusinessException("摘要生成失敗，請換一個識別碼重試");
        }
        if (extractionMapper.countRecent(current.getId(), LocalDateTime.now().minusMinutes(1)) >= RATE_PER_MINUTE) {
            throw new BusinessException(429, "操作過於頻繁，請稍後再試");
        }

        CpmAiExtraction row = new CpmAiExtraction();
        row.setRequestKey(requestKey);
        row.setUserId(current.getId());
        row.setStatus(CpmAiExtraction.STATUS_PROCESSING);
        row.setInputHash(inputHash);
        row.setPayloadJson(JsonUtils.toJson(Map.of("context", context)));
        row.setPromptVersion(SUMMARY_PROMPT_VERSION);
        row.setSchemaVersion(CpmAiPrompt.SCHEMA_VERSION);
        try {
            extractionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("摘要處理中，請稍後重試");
        }

        String account = current.getUsername();
        boolean admin = operatorResolver.isAdmin(current);
        LlmChannelRouter.Channel channel = resolveChannel(account);
        if (channel == null) {
            extractionMapper.markFailed(row.getId(), "no_channel");
            throw new BusinessException("AI 通道未配置，請稍後重試");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", channel.getDefaultModelKey());
        payload.put("temperature", 0);
        payload.put("max_tokens", 512);
        payload.put("response_format", Map.of("type", "json_object"));
        payload.put("messages", List.of(
                Map.of("role", "system", "content",
                        "你是企業工作匯報摘要助手。任務：根據給定的本期工作事實，寫一段 120 字以內的中文摘要。"
                                + "只允許概括給定事實，不得新增數字或事實；只輸出 JSON：{\"summary\": \"...\"}。"),
                Map.of("role", "user", "content", context)));
        String requestId = "cpm-ai-" + requestKey;
        if (!admin) {
            AiModelAdmissionService.Decision decision = admissionService.check(account, channel.getDefaultModelKey());
            if (!decision.allowed()) {
                extractionMapper.markFailed(row.getId(),
                        decision.errorKind() == null ? "admission_denied" : decision.errorKind());
                throw new BusinessException("AI 當前不可用：" + (decision.message() == null ? decision.errorKind() : decision.message()));
            }
            try {
                budgetService.reserve(requestId, account, channel.getDefaultModelKey(),
                        Math.max(1, context.length() / 4), 512,
                        channel.getInputPrice(), channel.getOutputPrice(), channel.getCurrency());
            } catch (AiBudgetPoolService.BudgetDeniedException denied) {
                extractionMapper.markFailed(row.getId(), "budget_exceeded");
                metering.release(requestId, "budget_denied");
                throw new BusinessException("AI 額度/預算不足，本次未生成摘要");
            } catch (RuntimeException e) {
                extractionMapper.markFailed(row.getId(), "reserve_failed");
                throw new BusinessException("AI 服務暫時不可用，請稍後重試");
            }
        }
        JsonNode resp;
        final Map<String, Object> outboundPayload = payload;
        try {
            Future<JsonNode> future = POOL.submit(
                    () -> llmClient.chatCompletion(channel.getBaseUrl(), channel.getApiKey(), outboundPayload));
            resp = future.get(MODEL_BUDGET_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            metering.release(requestId, "TIMEOUT");
            extractionMapper.markFailed(row.getId(), "upstream_timeout");
            throw new BusinessException("模型響應超時，請稍後重試");
        } catch (Exception e) {
            metering.release(requestId, "call_error");
            Throwable cause = e.getCause() instanceof LlmHttpClient.LlmCallException le ? le : e;
            extractionMapper.markFailed(row.getId(), resolveUpstreamErrorCode(cause));
            throw new BusinessException("摘要生成失敗，請稍後重試");
        }
        long tokens = admin ? 0 : metering.settle(requestId, account, "auto", channel, resp);
        String usageJson = usageJson(resp, tokens);
        String model = resp.path("model").asText(channel.getDefaultModelKey());
        String content = resp.path("choices").path(0).path("message").path("content").asText(null);
        String summary = parseSummary(content);
        if (summary == null) {
            extractionMapper.markFailed(row.getId(), "invalid_structure");
            throw new BusinessException("模型輸出格式異常，請重試");
        }
        extractionMapper.markSucceeded(row.getId(), model, JsonUtils.toJson(Map.of("summary", summary)), usageJson);
        return summary;
    }

    private CpmDto.Snapshot snapshotBuilderForSummary(long userId, CpmPeriods.Period period) {
        return snapshotBuilder.build(userId, period.periodType(), period.start(), period.end());
    }

    /** 摘要上下文：只给结构化事实（标题/状态/进度/计数），不转发任何原文笔记。 */
    private static String summaryContext(CpmDto.Snapshot snapshot) {
        StringBuilder sb = new StringBuilder();
        sb.append("週期 ").append(snapshot.getPeriodStart()).append(" ~ ").append(snapshot.getPeriodEnd())
                .append("；完成 ").append(snapshot.getTotals().getDone())
                .append("/").append(snapshot.getTotals().getTotal()).append(" 項。\n");
        snapshot.getGroups().forEach(g -> {
            sb.append('[').append(g.getCategoryLabel()).append("]\n");
            g.getItems().forEach(e -> sb.append("- ").append(e.getTitle())
                    .append("：").append(e.getStatus()).append(' ').append(e.getProgress()).append("%\n"));
        });
        return sb.toString();
    }

    private static String parseSummary(String content) {
        if (content == null || content.isBlank()) {
            return null;
        }
        try {
            String json = content.trim();
            if (json.startsWith("```")) {
                int start = json.indexOf('{');
                int end = json.lastIndexOf('}');
                if (start < 0 || end <= start) {
                    return null;
                }
                json = json.substring(start, end + 1);
            }
            JsonNode node = JsonUtils.parse(json, JsonNode.class);
            String summary = node == null ? null : node.path("summary").asText(null);
            if (summary == null || summary.isBlank() || summary.length() > 500) {
                return null;
            }
            return summary.trim();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String readSummary(String resultJson) {
        JsonNode node = JsonUtils.parse(resultJson, JsonNode.class);
        return node == null ? "" : node.path("summary").asText("");
    }

    /* ==================== 确认落库 ==================== */

    /**
     * 用户勾选确认后批量落条目（source=ai）。
     * <p>确认是唯一的写入口：候选阶段只读台账、不碰正式表——AI 只能起草，落账永远由人签字。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<CpmDto.ItemVO> confirm(CpmDto.AiConfirmForm form) {
        SysUser current = guard.currentUser();
        CpmAiExtraction row = extractionMapper.findByRequest(form.getRequestKey());
        if (row == null || !CpmAiExtraction.STATUS_SUCCEEDED.equals(row.getStatus())) {
            throw new BusinessException("提取結果不存在或已過期，請重新整理");
        }
        if (form.getSelected() == null || form.getSelected().isEmpty()) {
            throw new BusinessException("請至少保留一條整理結果");
        }
        if (form.getSelected().size() > CpmConstants.AI_ITEMS_MAX) {
            throw new BusinessException("單次確認最多 " + CpmConstants.AI_ITEMS_MAX + " 條");
        }
        List<CpmDto.ItemVO> out = new ArrayList<>();
        for (CpmDto.AiCandidate candidate : form.getSelected()) {
            CpmDto.ItemForm itemForm = new CpmDto.ItemForm();
            itemForm.setTitle(candidate.getTitle());
            itemForm.setDetail(candidate.getDetail());
            itemForm.setCategory(candidate.getCategory());
            itemForm.setStatus(candidate.getStatus());
            itemForm.setProgress(candidate.getProgress());
            itemForm.setWorkDate(StringUtils.hasText(form.getWorkDate()) ? form.getWorkDate() : rowWorkDate(row));
            itemForm.setSourceType(CpmConstants.SOURCE_AI);
            out.add(itemService.create(itemForm));
        }
        return out;
    }

    private String rowWorkDate(CpmAiExtraction row) {
        return periods.today().toString();
    }

    /* ==================== 内部工具 ==================== */

    private List<String> recentTitles(long userId) {
        List<String> titles = new ArrayList<>();
        itemMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CpmItem>()
                        .eq(CpmItem::getUserId, userId)
                        .ge(CpmItem::getWorkDate, periods.today().minusDays(7))
                        .orderByDesc(CpmItem::getId).last("LIMIT 60"))
                .forEach(i -> titles.add(i.getTitle()));
        return titles;
    }

    private LlmChannelRouter.Channel resolveChannel(String account) {
        LlmChannelRouter.Channel primary = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, account);
        return primary != null ? primary : channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_OFF_PEAK, account);
    }

    private CpmDto.AiExtractionVO toVO(CpmAiExtraction row) {
        CpmDto.AiExtractionVO vo = new CpmDto.AiExtractionVO();
        vo.setRequestKey(row.getRequestKey());
        vo.setStatus(row.getStatus());
        vo.setPromptVersion(row.getPromptVersion());
        vo.setExtractionSchemaVersion(row.getSchemaVersion());
        if (!CpmAiExtraction.STATUS_SUCCEEDED.equals(row.getStatus())) {
            vo.setErrorCode(row.getErrorCode());
            return vo;
        }
        CpmDto.AiExtractionVO stored = JsonUtils.parse(row.getResultJson(), CpmDto.AiExtractionVO.class);
        if (stored != null) {
            stored.setRequestKey(row.getRequestKey());
            stored.setStatus(row.getStatus());
            return stored;
        }
        return vo;
    }

    private CpmAiModelOutput parseOutput(String content) {
        if (!StringUtils.hasText(content)) {
            return null;
        }
        String json = content.trim();
        // 容错只有一种：模型无视禁令包了代码围栏——剥掉后再走严格校验，其余一律 invalid
        if (json.startsWith("```")) {
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start < 0 || end <= start) {
                return null;
            }
            json = json.substring(start, end + 1);
        }
        return JsonUtils.parse(json, CpmAiModelOutput.class);
    }

    private static String resolveUpstreamErrorCode(Throwable cause) {
        // 分类口径与纪要共用一处：欠费/密钥失效/限流这些原因必须能翻译成给用户的文案，
        // 自己另写一份 switch 会把全部上游失败压成 upstream_http_error（原始码直接甩到界面）
        return AiUpstreamErrorCodes.of(cause);
    }

    private static String usageJson(JsonNode resp, long tokens) {
        JsonNode usage = resp.path("usage");
        return JsonUtils.toJson(Map.of(
                "promptTokens", usage.path("prompt_tokens").asInt(0),
                "completionTokens", usage.path("completion_tokens").asInt(0),
                "totalTokens", tokens));
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String requireKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new BusinessException("請提供有效的本次操作識別碼");
        }
        return key;
    }

    private CpmDto.AiExtractionVO throwBusy() {
        throw new BusinessException("提取請求處理中，請稍後重試");
    }
}
