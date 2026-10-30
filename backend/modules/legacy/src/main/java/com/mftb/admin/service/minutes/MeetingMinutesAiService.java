package com.mftb.admin.service.minutes;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MeetingMinutesAiDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesAiExtraction;
import com.mftb.admin.entity.MeetingMinutesNote;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingMinutesAiExtractionMapper;
import com.mftb.admin.mapper.MeetingMinutesNoteMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingMinutesPublication;
import com.mftb.admin.service.agent.AiModelAdmissionService;
import com.mftb.admin.service.agent.AiOutboundPolicyService;
import com.mftb.admin.service.agent.BudgetReservationService;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.service.agent.LlmMeteringService;
import com.mftb.admin.service.agent.platform.AiBudgetPoolService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;

/**
 * 会议纪要 AI 结构化提取（自然语言笔记 → 字段级建议）。
 *
 * <p>处理链路：资源校验 → 输入快照 → 幂等登记 → 最小上下文 → AI 准入 → 严格预算预占 →
 * 模型调用 → 结构校验 → 员工/日期确定性补全 → 结果与用量落库 → 返回。
 * 模型调用不置于数据库长事务；预占失败绝不发起调用；有真实 usage 即使结构无效也计量。
 *
 * <p>本服务只产出「建议」，绝不写正式纪要、发布或发送——那是用户确认后走既有保存链路的事。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingMinutesAiService {

    private static final int MAX_CONCURRENT = 1;
    private static final int RATE_PER_MINUTE = 6;
    private static final long MODEL_BUDGET_MS = 60_000L;
    private static final ExecutorService POOL = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "minutes-ai");
        t.setDaemon(true);
        return t;
    });

    private final MeetingMinutesAiExtractionMapper extractionMapper;
    private final MeetingMinutesNoteMapper noteMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final SysUserMapper userMapper;
    private final MeetingAccessGuard guard;
    private final MeetingMinutesAuthorizer authorizer;
    private final MinutesAiPrompt prompt;
    private final MinutesOwnerMatcher ownerMatcher;
    private final MinutesRelativeDateParser dateParser;
    private final AiModelAdmissionService admissionService;
    private final LlmChannelRouter channelRouter;
    private final LlmHttpClient llmClient;
    private final LlmMeteringService metering;
    private final BudgetReservationService budgetService;
    private final ObjectMapper objectMapper;

    @Value("${meeting.minutes.enabled:true}")
    private boolean minutesEnabled;
    @Value("${meeting.minutes.ai-enabled:false}")
    private boolean aiEnabled;
    @Value("${meeting.minutes.business-timezone:Asia/Shanghai}")
    private String businessTimezone;

    /* ==================== 状态预检 ==================== */

    public MeetingMinutesAiDto.AiStatusVO status(long bookingId) {
        SysUser current = guard.currentUser();
        MeetingMinutesAiDto.AiStatusVO vo = new MeetingMinutesAiDto.AiStatusVO();
        vo.setMaxInputChars(MinutesAiPrompt.MAX_INPUT_CHARS);
        vo.setEnabled(aiEnabled);
        if (!minutesEnabled || !aiEnabled) {
            vo.setAvailable(false);
            vo.setReasonCode("feature_off");
            return vo;
        }
        MeetingBooking booking = authorizer.requireBooking(bookingId);
        authorizer.requireBookingReadable(booking, current);
        try {
            AiModelAdmissionService.Decision ctx = admissionService.checkContext(current.getUsername(), "meeting");
            if (!ctx.allowed()) {
                vo.setAvailable(false);
                vo.setReasonCode(ctx.errorKind());
                return vo;
            }
            LlmChannelRouter.Channel channel = resolveChannel(current.getUsername());
            if (channel == null) {
                vo.setAvailable(false);
                vo.setReasonCode("no_channel");
                return vo;
            }
            AiModelAdmissionService.Decision check = admissionService.check(current.getUsername(), channel.getDefaultModelKey());
            vo.setAvailable(check.allowed());
            vo.setReasonCode(check.allowed() ? null : check.errorKind());
        } catch (RuntimeException e) {
            vo.setAvailable(false);
            vo.setReasonCode("admission_unavailable");
        }
        return vo;
    }

    /* ==================== 提取 ==================== */

    public MeetingMinutesAiDto.ExtractionVO extract(MeetingMinutesAiDto.ExtractionForm form) {
        SysUser current = guard.currentUser();
        requireEnabled();
        if (form.getBookingId() == null || form.getNoteVersion() == null) {
            throw new BusinessException("缺少會議或筆記版本");
        }
        String requestKey = requireKey(form.getRequestKey());

        // 幂等：同请求号先回已有结果，不重复调模型/扣费
        MeetingMinutesAiExtraction replay = extractionMapper.findByRequest(current.getId(), requestKey);
        if (replay != null) {
            if (!Objects.equals(replay.getRequestHash(), requestHash(form))) {
                throw new BusinessException("同一提取識別碼不可用於不同請求");
            }
            return toVO(replay);
        }

        MeetingBooking booking = authorizer.requireBooking(form.getBookingId());
        MeetingMinutes minutes = authorizer.requireEditableForBooking(form.getBookingId(), current);
        // 基线一致性：有纪要必须带实际版本，无纪要必须都为 null
        if (minutes == null) {
            if (form.getBaseMinutesId() != null || form.getBaseMinutesVersion() != null) {
                throw new BusinessException("本場會尚無紀要，請以新建基線提取");
            }
        } else if (!Objects.equals(minutes.getId(), form.getBaseMinutesId())
                || !Objects.equals(minutes.getVersion(), form.getBaseMinutesVersion())) {
            throw new BusinessException("紀要已被他人修改，請刷新後重試");
        }

        MeetingMinutesNote note = noteMapper.findByOwner(form.getBookingId(), current.getId());
        if (note == null || !Objects.equals(note.getVersion(), form.getNoteVersion())) {
            throw new BusinessException("筆記版本已過期，請先同步最新筆記");
        }
        String rawText = note.getRawText() == null ? "" : note.getRawText();
        if (rawText.isBlank()) {
            throw new BusinessException("筆記為空，無內容可提取");
        }
        if (rawText.length() > MinutesAiPrompt.MAX_INPUT_CHARS) {
            throw new BusinessException("筆記超過 " + MinutesAiPrompt.MAX_INPUT_CHARS + " 字上限，請分段處理");
        }
        // 限流（跨实例以库为准）
        if (extractionMapper.countRecent(current.getId(), LocalDateTime.now().minusMinutes(1)) >= RATE_PER_MINUTE) {
            throw new BusinessException(429, "操作過於頻繁，請稍後再試");
        }
        // 每用户仅一条处理中：先看是否已有未结束的请求
        MeetingMinutesAiExtraction running = extractionMapper.findLatest(form.getBookingId(), current.getId());
        if (running != null && running.getStatus() == MeetingMinutesAiExtraction.STATUS_PROCESSING) {
            return toVO(running);
        }

        ZoneId zone = ZoneId.of(businessTimezone);
        LocalDate meetingDate = booking.getStartTime() == null
                ? LocalDateTime.now(zone).toLocalDate() : booking.getStartTime().atZone(zone).toLocalDate();

        // 登记处理中行（唯一键把住并发双击；active_operator_id 生成列把住每用户一条处理中）
        MeetingMinutesAiExtraction row = new MeetingMinutesAiExtraction();
        row.setBookingId(form.getBookingId());
        row.setNoteId(note.getId());
        row.setOperatorUserId(current.getId());
        row.setRequestKey(requestKey);
        row.setRequestHash(requestHash(form));
        row.setNoteVersion(note.getVersion());
        row.setSourceHash(MeetingMinutesPublication.hash(rawText));
        row.setSourceSnapshot(JsonUtils.toJson(Map.of("rawText", rawText, "mentions", JsonUtils.parseList(note.getMentionsJson(), Object.class))));
        row.setBaseMinutesId(minutes == null ? null : minutes.getId());
        row.setBaseMinutesVersion(minutes == null ? null : minutes.getVersion());
        row.setMeetingDate(meetingDate);
        row.setTimezone(businessTimezone);
        row.setStatus(MeetingMinutesAiExtraction.STATUS_PROCESSING);
        row.setPromptVersion(MinutesAiPrompt.PROMPT_VERSION);
        row.setSchemaVersion(MinutesAiPrompt.SCHEMA_VERSION);
        row.setBillingStatus(MeetingMinutesAiExtraction.BILLING_NONE);
        row.setStartedAt(LocalDateTime.now(java.time.ZoneOffset.UTC));
        row.setResultExpiresAt(LocalDateTime.now(java.time.ZoneOffset.UTC).plusDays(7));
        row.setMetadataExpiresAt(LocalDateTime.now(java.time.ZoneOffset.UTC).plusDays(180));
        row.setCreatedBy(current.getName());
        row.setUpdatedBy(current.getName());
        try {
            extractionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            MeetingMinutesAiExtraction other = extractionMapper.findByRequest(current.getId(), requestKey);
            return other == null ? throwBusy() : toVO(other);
        }

        return runExtraction(row, booking, note, rawText, meetingDate, current);
    }

    private MeetingMinutesAiDto.ExtractionVO throwBusy() {
        throw new BusinessException("提取請求處理中，請稍後重試");
    }

    /** 真正调模型：准入 → 严格预占 → 调用 → 结构校验 → 确定性补全 → 落库。异常都在此收敛为终态。 */
    private MeetingMinutesAiDto.ExtractionVO runExtraction(MeetingMinutesAiExtraction row, MeetingBooking booking,
                                                           MeetingMinutesNote note, String rawText, LocalDate meetingDate, SysUser current) {
        String account = current.getUsername();
        Map<String, String> segments = prompt.segment(rawText);
        Set<String> validRefs = segments.keySet();
        Map<String, String> mentionAliases = mentionAliases(note);
        Set<String> validMentions = mentionAliases.keySet();

        LlmChannelRouter.Channel channel = resolveChannel(account);
        if (channel == null) {
            extractionMapper.markFailed(row.getId(), "no_channel", null, MeetingMinutesAiExtraction.BILLING_NONE, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }
        AiModelAdmissionService.Decision check = admissionService.check(account, channel.getDefaultModelKey());
        if (!check.allowed()) {
            extractionMapper.markFailed(row.getId(), check.errorKind(), channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_NONE, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }
        String userPrompt = prompt.userPrompt(segments, booking.getTitle(), meetingDate, businessTimezone, mentionAliases);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", channel.getDefaultModelKey());
        payload.put("temperature", 0.1);
        payload.put("max_tokens", MinutesAiPrompt.OUTPUT_MAX_TOKENS);
        payload.put("response_format", Map.of("type", "json_object"));
        payload.put("messages", List.of(
                Map.of("role", "system", "content", prompt.systemPrompt()),
                Map.of("role", "user", "content", userPrompt)));
        AiOutboundPrepared prepared = preparePayload(account, channel, payload);
        if (!prepared.allowed()) {
            extractionMapper.markFailed(row.getId(), prepared.errorKind(), channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_NONE, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }

        String requestId = "mm-ai-" + row.getRequestKey();
        int promptEst = Math.max(1, (prompt.systemPrompt().length() + userPrompt.length()) / 4);
        // 严格预占：任何无法确认的预占故障都阻止调用
        try {
            budgetService.reserve(requestId, account, channel.getDefaultModelKey(), promptEst,
                    MinutesAiPrompt.OUTPUT_MAX_TOKENS, channel.getInputPrice(), channel.getOutputPrice(), channel.getCurrency());
        } catch (AiBudgetPoolService.BudgetDeniedException denied) {
            extractionMapper.markFailed(row.getId(), "budget_exceeded", channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_RELEASED, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        } catch (RuntimeException e) {
            log.warn("[MinutesAi] 預算預占失敗，未發起調用 request={}: {}", requestId, e.getMessage());
            extractionMapper.markFailed(row.getId(), "reserve_failed", channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_NONE, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }
        extractionMapper.updateBilling(row.getId(), MeetingMinutesAiExtraction.BILLING_RESERVED, null);

        Future<JsonNode> future = null;
        JsonNode resp;
        try {
            Callable<JsonNode> call = () -> llmClient.chatCompletion(channel.getBaseUrl(), channel.getApiKey(), prepared.payload());
            future = POOL.submit(call);
            resp = future.get(MODEL_BUDGET_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            if (future != null) {
                future.cancel(true);
            }
            metering.release(requestId, "TIMEOUT");
            extractionMapper.markUnknown(row.getId(), "upstream_timeout", channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_RELEASED, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        } catch (Exception e) {
            Throwable cause = e.getCause() instanceof LlmHttpClient.LlmCallException le ? le : e;
            metering.release(requestId, "call_error");
            log.warn("[MinutesAi] 調用失敗 request={}: {}", requestId, cause.getMessage());
            extractionMapper.markUnknown(row.getId(), "upstream_error", channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_RELEASED, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }
        if (resp == null) {
            metering.release(requestId, "empty_body");
            extractionMapper.markUnknown(row.getId(), "upstream_empty", channel.getDefaultModelKey(),
                    MeetingMinutesAiExtraction.BILLING_RELEASED, current.getName());
            return toVO(reload(row.getId(), current.getId()));
        }

        // 有真实 usage 就先结算计量（即使随后结构校验失败也不假装未消耗）
        long tokens = metering.settle(requestId, account, "auto", channel, resp);
        String usageJson = usageJson(resp, tokens);
        String model = resp.path("model").asText(channel.getDefaultModelKey());

        String content = resp.path("choices").path(0).path("message").path("content").asText(null);
        MinutesAiModelOutput output = parseOutput(content);
        MeetingMinutesAiDto.ExtractionVO vo;
        try {
            if (output == null) {
                throw new IllegalArgumentException("invalid_json");
            }
            prompt.validate(output, validRefs, validMentions);
            vo = assemble(row, output, segments, mentionAliases, meetingDate, tokens, model);
        } catch (IllegalArgumentException invalid) {
            // 结构无效：已消耗，落账但标失败，不应用半份结果
            extractionMapper.markFailed(row.getId(), "invalid_structure", model,
                    MeetingMinutesAiExtraction.BILLING_SETTLED, current.getName());
            extractionMapper.updateBilling(row.getId(), MeetingMinutesAiExtraction.BILLING_SETTLED, usageJson);
            return toVO(reload(row.getId(), current.getId()));
        }
        extractionMapper.markSucceeded(row.getId(), model, JsonUtils.toJson(vo), usageJson,
                MeetingMinutesAiExtraction.BILLING_SETTLED, current.getName());
        return toVO(reload(row.getId(), current.getId()));
    }

    /* ==================== 确定性补全 ==================== */

    private MeetingMinutesAiDto.ExtractionVO assemble(MeetingMinutesAiExtraction row, MinutesAiModelOutput output,
                                                      Map<String, String> segments, Map<String, String> mentionAliases,
                                                      LocalDate meetingDate, long tokens, String model) {
        Map<Long, SysUser> attendees = attendeeMap(row.getBookingId());
        Map<String, Long> mentionUser = mentionUserMap(row);
        MeetingMinutesAiDto.Proposal proposal = new MeetingMinutesAiDto.Proposal();
        List<MeetingMinutesAiDto.Annotation> annotations = new ArrayList<>();
        List<MeetingMinutesAiDto.Issue> issues = new ArrayList<>();

        for (MinutesAiModelOutput.Topic topic : output.getTopics()) {
            MeetingMinutesAiDto.ProposalItem item = new MeetingMinutesAiDto.ProposalItem();
            item.setRef(topic.getRef());
            item.setTopic(trim(topic.getTopic(), 100));
            item.setDiscussion(trim(topic.getDiscussion(), 500));
            item.setConclusion(trim(topic.getConclusion(), 500));
            item.setDecisionStatus(topic.getDecisionStatus());
            item.setSourceRefs(topic.getSourceRefs());
            proposal.getItems().add(item);
            addAnnotation(annotations, item.getRef(), "topic", topic.getSourceRefs(), segments, "extracted");
        }
        for (MinutesAiModelOutput.Action action : output.getActions()) {
            MeetingMinutesAiDto.ProposalAction item = new MeetingMinutesAiDto.ProposalAction();
            item.setRef(action.getRef());
            item.setTopicRef(action.getTopicRef());
            item.setContent(trim(action.getContent(), 300));
            item.setDeliverable(trim(action.getDeliverable(), 300));
            item.setSourceRefs(action.getSourceRefs());
            resolveOwner(item, action.getOwnerMentionRef(), action.getOwnerText(), mentionUser, attendees, annotations, issues);
            resolveDue(item, action.getDueText(), meetingDate, annotations, issues);
            proposal.getActions().add(item);
        }
        for (MinutesAiModelOutput.OpenIssue issue : output.getOpenIssues()) {
            MeetingMinutesAiDto.ProposalOpenIssue item = new MeetingMinutesAiDto.ProposalOpenIssue();
            item.setRef(issue.getRef());
            item.setTopicRef(issue.getTopicRef());
            item.setContent(trim(issue.getContent(), 300));
            item.setSourceRefs(issue.getSourceRefs());
            MinutesOwnerMatcher.Match owner = ownerMatcher.match(
                    issue.getOwnerMentionRef() == null ? null : mentionUser.get(issue.getOwnerMentionRef()),
                    issue.getOwnerText(), attendees);
            if (owner.status() == MinutesOwnerMatcher.Status.RESOLVED) {
                item.setOwnerUserId(owner.resolved().getId());
                item.setOwnerName(owner.resolved().getName());
            } else {
                addIssue(issues, item.getRef(), "ownerUserId", owner.reasonCode(), owner.candidates());
            }
            MinutesRelativeDateParser.Result due = dateParser.parse(issue.getDueText(), meetingDate);
            if (due.kind() == MinutesRelativeDateParser.Kind.RESOLVED) {
                item.setDueDate(due.date().toString());
            } else if (!"none".equals(due.reasonCode())) {
                addIssue(issues, item.getRef(), "dueDate", due.reasonCode(), List.of());
            }
            proposal.getOpenIssues().add(item);
        }

        MeetingMinutesAiDto.ExtractionVO vo = new MeetingMinutesAiDto.ExtractionVO();
        vo.setRequestKey(row.getRequestKey());
        vo.setStatus("succeeded");
        vo.setExtractionSchemaVersion(MinutesAiPrompt.SCHEMA_VERSION);
        vo.setPromptVersion(MinutesAiPrompt.PROMPT_VERSION);
        MeetingMinutesAiDto.SourceMeta source = new MeetingMinutesAiDto.SourceMeta();
        source.setNoteVersion(row.getNoteVersion());
        source.setSourceHash(row.getSourceHash());
        source.setBaseMinutesId(row.getBaseMinutesId());
        source.setBaseMinutesVersion(row.getBaseMinutesVersion());
        vo.setSource(source);
        MeetingMinutesAiDto.ContextMeta ctx = new MeetingMinutesAiDto.ContextMeta();
        ctx.setMeetingDate(meetingDate.toString());
        ctx.setTimezone(businessTimezone);
        vo.setContext(ctx);
        vo.setProposal(proposal);
        vo.setAnnotations(annotations);
        vo.setIssues(issues);
        MeetingMinutesAiDto.Usage usage = new MeetingMinutesAiDto.Usage();
        usage.setModel(model);
        usage.setCompletionTokens((int) Math.max(0, tokens));
        usage.setMeteringStatus(LlmMeteringService.verification(null));
        vo.setUsage(usage);
        return vo;
    }

    private void resolveOwner(MeetingMinutesAiDto.ProposalAction item, String mentionRef, String ownerText,
                              Map<String, Long> mentionUser, Map<Long, SysUser> attendees,
                              List<MeetingMinutesAiDto.Annotation> annotations, List<MeetingMinutesAiDto.Issue> issues) {
        Long mentionUserId = mentionRef == null ? null : mentionUser.get(mentionRef);
        MinutesOwnerMatcher.Match match = ownerMatcher.match(mentionUserId, ownerText, attendees);
        if (match.status() == MinutesOwnerMatcher.Status.RESOLVED) {
            item.setOwnerUserId(match.resolved().getId());
            item.setOwnerName(match.resolved().getName());
            item.setOwnerEmpNo(match.resolved().getEmpId());
            addAnnotation(annotations, item.getRef(), "ownerUserId", item.getSourceRefs(), Map.of(), "resolved");
        } else {
            addIssue(issues, item.getRef(), "ownerUserId", match.reasonCode(), match.candidates());
        }
    }

    private void resolveDue(MeetingMinutesAiDto.ProposalAction item, String dueText, LocalDate meetingDate,
                            List<MeetingMinutesAiDto.Annotation> annotations, List<MeetingMinutesAiDto.Issue> issues) {
        MinutesRelativeDateParser.Result result = dateParser.parse(dueText, meetingDate);
        if (result.kind() == MinutesRelativeDateParser.Kind.RESOLVED) {
            item.setDueDate(result.date().toString());
            MeetingMinutesAiDto.Annotation annotation = new MeetingMinutesAiDto.Annotation();
            annotation.setProposalKey(item.getRef());
            annotation.setField("dueDate");
            annotation.setSourceRefs(item.getSourceRefs());
            annotation.setRawText(dueText);
            annotation.setParseStatus("resolved");
            annotations.add(annotation);
        } else if (!"none".equals(result.reasonCode())) {
            addIssue(issues, item.getRef(), "dueDate", result.reasonCode(), List.of());
        }
    }

    /* ==================== 恢复查询 ==================== */

    public MeetingMinutesAiDto.ExtractionVO get(String requestKey) {
        SysUser current = guard.currentUser();
        MeetingMinutesAiExtraction row = extractionMapper.findByRequest(current.getId(), requestKey);
        if (row == null) {
            throw new BusinessException("提取請求不存在或已過期");
        }
        // 崩溃恢复：超期处理中 → 未知
        if (row.getStatus() == MeetingMinutesAiExtraction.STATUS_PROCESSING
                && row.getUpdatedAt() != null && row.getUpdatedAt().isBefore(LocalDateTime.now().minusMinutes(2))) {
            extractionMapper.expireStaleProcessing(LocalDateTime.now().minusMinutes(2));
            row = extractionMapper.findByRequest(current.getId(), requestKey);
        }
        return toVO(row);
    }

    /* ==================== 辅助 ==================== */

    /** 定时清理：崩溃遗留的处理中 → 未知；超 7 天的原文快照与结果 → 清空（不自动重放付费调用）。 */
    public int cleanupExpired() {
        int stale = extractionMapper.expireStaleProcessing(LocalDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(2));
        int cleared = extractionMapper.clearExpiredPayloads();
        return stale + cleared;
    }

    private void requireEnabled() {
        if (!minutesEnabled) {
            throw new BusinessException("會議紀要功能尚未啟用");
        }
        if (!aiEnabled) {
            throw new BusinessException("AI 輔助錄入尚未啟用，請聯繫管理員開啟");
        }
    }

    private LlmChannelRouter.Channel resolveChannel(String account) {
        LlmChannelRouter.Channel primary = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, account);
        return primary != null ? primary : channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_OFF_PEAK, account);
    }

    private AiOutboundPrepared preparePayload(String account, LlmChannelRouter.Channel channel, Map<String, Object> payload) {
        AiOutboundPolicyService.Prepared prepared = admissionService.prepare(account, channel, payload, "meeting");
        AiModelAdmissionService.Decision decision = prepared.decision();
        Map<String, Object> checked = prepared.payload();
        return new AiOutboundPrepared(decision != null && decision.allowed(),
                decision == null ? "outbound_unavailable" : decision.errorKind(),
                checked == null || checked.isEmpty() ? payload : checked);
    }

    private MinutesAiModelOutput parseOutput(String content) {
        if (content == null || content.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(content, MinutesAiModelOutput.class);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, String> mentionAliases(MeetingMinutesNote note) {
        Map<String, String> aliases = new LinkedHashMap<>();
        for (MeetingMinutesAiDto.Mention mention : JsonUtils.parseList(note.getMentionsJson(), MeetingMinutesAiDto.Mention.class)) {
            if (mention.getMentionRef() != null && mention.getName() != null) {
                aliases.put(mention.getMentionRef(), mention.getName());
            }
        }
        return aliases;
    }

    private Map<String, Long> mentionUserMap(MeetingMinutesAiExtraction row) {
        Map<String, Long> map = new LinkedHashMap<>();
        MeetingMinutesNote note = noteMapper.selectById(row.getNoteId());
        if (note == null) {
            return map;
        }
        for (MeetingMinutesAiDto.Mention mention : JsonUtils.parseList(note.getMentionsJson(), MeetingMinutesAiDto.Mention.class)) {
            if (mention.getMentionRef() != null && mention.getUserId() != null) {
                map.put(mention.getMentionRef(), mention.getUserId());
            }
        }
        return map;
    }

    private Map<Long, SysUser> attendeeMap(long bookingId) {
        List<Long> ids = attendeeMapper.selectList(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, bookingId)).stream()
                .map(MeetingAttendee::getUserId).filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return userMapper.selectBatchIds(ids).stream()
                .filter(u -> Integer.valueOf(1).equals(u.getStatus()))
                .collect(Collectors.toMap(SysUser::getId, u -> u, (a, b) -> a));
    }

    private void addAnnotation(List<MeetingMinutesAiDto.Annotation> annotations, String proposalKey, String field,
                               List<String> sourceRefs, Map<String, String> segments, String parseStatus) {
        MeetingMinutesAiDto.Annotation annotation = new MeetingMinutesAiDto.Annotation();
        annotation.setProposalKey(proposalKey);
        annotation.setField(field);
        annotation.setSourceRefs(sourceRefs == null ? List.of() : sourceRefs);
        annotation.setParseStatus(parseStatus);
        annotations.add(annotation);
    }

    private void addIssue(List<MeetingMinutesAiDto.Issue> issues, String proposalKey, String field, String code,
                          List<SysUser> candidates) {
        MeetingMinutesAiDto.Issue issue = new MeetingMinutesAiDto.Issue();
        issue.setProposalKey(proposalKey);
        issue.setField(field);
        issue.setCode(code == null ? "needs_confirm" : code);
        issue.setSeverity("ownerUserId".equals(field) ? "warn" : "info");
        issue.setCandidates(candidates == null ? List.of() : candidates.stream().map(user -> {
            MeetingMinutesAiDto.Candidate candidate = new MeetingMinutesAiDto.Candidate();
            candidate.setUserId(user.getId());
            candidate.setName(user.getName());
            candidate.setEmpNo(user.getEmpId());
            return candidate;
        }).toList());
        issues.add(issue);
    }

    private MeetingMinutesAiExtraction reload(long id, long operatorId) {
        return extractionMapper.findByIdAndOperator(id, operatorId);
    }

    private MeetingMinutesAiDto.ExtractionVO toVO(MeetingMinutesAiExtraction row) {
        if (row == null) {
            throw new BusinessException("提取結果不可用，請重試");
        }
        String status = switch (row.getStatus()) {
            case MeetingMinutesAiExtraction.STATUS_PROCESSING -> "processing";
            case MeetingMinutesAiExtraction.STATUS_SUCCEEDED -> "succeeded";
            case MeetingMinutesAiExtraction.STATUS_FAILED -> "failed";
            case MeetingMinutesAiExtraction.STATUS_EXPIRED -> "expired";
            default -> "unknown";
        };
        if (row.getResultExpiresAt() != null
                && row.getResultExpiresAt().isBefore(LocalDateTime.now(java.time.ZoneOffset.UTC))
                && "succeeded".equals(status)) {
            status = "expired";
        }
        MeetingMinutesAiDto.ExtractionVO stored = row.getResultJson() == null
                ? null : JsonUtils.parse(row.getResultJson(), MeetingMinutesAiDto.ExtractionVO.class);
        MeetingMinutesAiDto.ExtractionVO vo = stored != null ? stored : new MeetingMinutesAiDto.ExtractionVO();
        vo.setRequestKey(row.getRequestKey());
        vo.setStatus(status);
        vo.setExtractionSchemaVersion(row.getSchemaVersion() == null ? MinutesAiPrompt.SCHEMA_VERSION : row.getSchemaVersion());
        vo.setPromptVersion(row.getPromptVersion());
        if (vo.getContext() == null) {
            MeetingMinutesAiDto.ContextMeta ctx = new MeetingMinutesAiDto.ContextMeta();
            ctx.setMeetingDate(row.getMeetingDate() == null ? null : row.getMeetingDate().toString());
            ctx.setTimezone(row.getTimezone());
            vo.setContext(ctx);
        }
        if (!"succeeded".equals(status)) {
            vo.setErrorCode(row.getErrorCode());
        }
        return vo;
    }

    private static String usageJson(JsonNode resp, long tokens) {
        JsonNode usage = resp.path("usage");
        return JsonUtils.toJson(Map.of(
                "promptTokens", usage.path("prompt_tokens").asInt(0),
                "completionTokens", usage.path("completion_tokens").asInt(0),
                "totalTokens", tokens));
    }

    private static String requestHash(MeetingMinutesAiDto.ExtractionForm form) {
        return MeetingMinutesPublication.hash(Map.of(
                "b", Objects.toString(form.getBookingId(), ""),
                "n", Objects.toString(form.getNoteVersion(), ""),
                "m", Objects.toString(form.getBaseMinutesId(), ""),
                "v", Objects.toString(form.getBaseMinutesVersion(), "")));
    }

    private static String requireKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new BusinessException("請提供有效的本次操作識別碼");
        }
        return key;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String v = value.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }

    private record AiOutboundPrepared(boolean allowed, String errorKind, Map<String, Object> payload) {
    }

    static String newRequestId() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
