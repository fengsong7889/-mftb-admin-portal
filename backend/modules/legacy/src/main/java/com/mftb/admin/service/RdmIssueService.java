package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmIssueDTO;
import com.mftb.admin.dto.RdmIssueVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmIssueResolution;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmIssueResolutionMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * RDM 问题与延期决定服务（流程版本 3 · 项目交付与质量管理链路）。
 *
 * <p>任务21 把「延期承接与问题解决闭环」补齐，锁死以下不可让的口径：
 * <ol>
 *   <li><b>延期不得绕过严重缺陷阻断</b>：申请延期本身<b>不</b>把问题置为 deferred、<b>不</b>从门禁排除；
 *       严重/critical 问题在延期<b>被批准前</b>持续阻断，仅「已获批准」（{@link RdmConstants#DEFER_APPROVED_STATUSES}）
 *       的延期才解除阻断，被拒/待决期间仍阻断（{@link #hasBlockingOpenIssue}）。</li>
 *   <li><b>bizDecisionRequired 由服务端判定</b>：依据问题类型/严重度/范围影响，<b>不信任前端传入</b>。</li>
 *   <li><b>四眼 / 拒绝自批</b>：产品/业务裁决人不得是该延期申请人，管理员<b>无</b>代签豁免；
 *       决定人身份取自认证主体 {@link OperatorResolver#currentUser()}。</li>
 *   <li><b>唯一有效承接</b>：承接需求须存在/同项目/V3/已准入，服务端显式校验唯一有效承接
 *       （DB 侧另有 {@code active_issue_id} 生成列 + {@code uk_rdm_followup_active_issue} 兜底），
 *       双向来源完整（承接需求侧写 {@code parentReqId} 来源，<b>不</b>写结构父 {@code structureParentReqId}）。</li>
 *   <li><b>按证据关闭</b>：{@link #resolveIssue} 必须绑定修复证据 + 复测轮次（冻结的执行事实）+ 必要验收，
 *       写入 {@link RdmIssueResolution}；<b>延期 ≠ 解决</b>，<b>承接完成验收 ≠ 原问题自动解决</b>。</li>
 *   <li><b>取消/合并/改派保留承接与历史</b>，并按<b>真实工作日日历</b>（含请假/周末支援/按人例外）做逾期升级。</li>
 *   <li><b>幂等</b>：写操作经 {@link RdmIdempotentService#executeOnce} 派生天然键；public 幂等入口 +
 *       {@code @Transactional doXxx} 拆分，executeOnce 不嵌进外层活动事务。</li>
 * </ol>
 *
 * <p><b>供任务27 发布门禁消费的判定</b>：{@link #hasBlockingOpenIssue(Long)}（按交付项）与
 * {@link #hasBlockingOpenIssueByReq(Long)}（按需求）。口径：严重度 ∈ {critical, major} 且问题未关闭
 * （非 resolved/cancelled/merged）且无「已获批准」的延期，即阻断。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmIssueService {

    /** 问题编号规则 key（前缀 WT + YYYYMMDD + 4 位） */
    private static final String SEQ_ISSUE = "rdm_issue";

    /** 裁决动作 */
    private static final String DECISION_APPROVED = "approved";
    private static final String DECISION_REJECTED = "rejected";
    private static final String DECISION_PENDING = "pending";
    private static final String DECISION_NOT_REQUIRED = "not_required";

    /** 问题来源（与 RdmIssueDTO.Create 契约一致） */
    private static final List<String> SOURCE_TYPES = List.of("test", "acceptance", "online", "other");
    /** 严重程度 */
    private static final List<String> SEVERITIES = List.of(
            RdmConstants.SEV_CRITICAL, RdmConstants.SEV_MAJOR,
            RdmConstants.SEV_MINOR, RdmConstants.SEV_TRIVIAL);

    /* ==================== executeOnce 业务类型（服务端派生天然键） ==================== */
    private static final String BIZ_ISSUE_DEFER = "rdm_issue_defer";
    private static final String BIZ_ISSUE_DECIDE = "rdm_issue_defer_decision";
    private static final String BIZ_ISSUE_BIND = "rdm_issue_followup_bind";
    private static final String BIZ_ISSUE_RESOLVE = "rdm_issue_resolution";
    private static final String BIZ_ISSUE_ACTION = "rdm_issue_action";

    private final RdmIssueMapper issueMapper;
    private final RdmIssueDeferMapper deferMapper;
    private final RdmIssueFollowupMapper followupMapper;
    private final RdmIssueResolutionMapper resolutionMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmTestRoundMapper testRoundMapper;
    private final RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private final RdmNotifyService notifyService;
    private final RdmAccessGuard accessGuard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final RdmIdempotentService idempotentService;
    private final RdmWorkingDayCalculator workingDayCalculator;

    /* ==================== 问题登记 ==================== */

    /**
     * 登记问题：来源可为测试执行、验收、线上、其它；初始状态 open。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmIssue createIssue(RdmIssueDTO.Create dto, Long currentUserId, String currentUserName) {
        if (dto == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請填寫問題標題");
        }
        String sourceType = StringUtils.hasText(dto.getSourceType()) ? dto.getSourceType().trim() : "test";
        if (!SOURCE_TYPES.contains(sourceType)) {
            throw new BusinessException("非法的問題來源: " + sourceType);
        }
        String severity = StringUtils.hasText(dto.getSeverity()) ? dto.getSeverity().trim() : RdmConstants.SEV_MINOR;
        if (!SEVERITIES.contains(severity)) {
            throw new BusinessException("非法的嚴重程度: " + severity);
        }
        Long reqId = dto.getReqId();
        if (reqId == null && dto.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(dto.getDeliveryItemId());
            if (item != null) {
                reqId = item.getReqId();
            }
        }
        if (reqId != null) {
            requireFlowV3(reqId);
        }

        RdmIssue issue = new RdmIssue();
        issue.setIssueNo(generateIssueNo());
        issue.setSourceType(sourceType);
        issue.setSourceId(dto.getSourceId());
        issue.setReqId(reqId);
        issue.setDeliveryItemId(dto.getDeliveryItemId());
        issue.setScopeVersion(dto.getScopeVersion());
        issue.setBuildId(dto.getBuildId());
        issue.setTitle(dto.getTitle().trim());
        issue.setDescription(dto.getDescription());
        issue.setImpact(dto.getImpact());
        issue.setSeverity(severity);
        issue.setOwnerUserId(dto.getOwnerUserId());
        issue.setOwnerUserName(dto.getOwnerUserName());
        issue.setStatus(RdmConstants.ISSUE_OPEN);
        issue.setReporterUserId(currentUserId);
        issue.setReporterUserName(currentUserName);
        issueMapper.insert(issue);
        log.info("問題已登記: issueNo={}, severity={}, source={}, deliveryItem={}",
                issue.getIssueNo(), severity, sourceType, issue.getDeliveryItemId());
        return issue;
    }

    /* ==================== 延期闭环（幂等入口 + @Transactional doXxx 拆分） ==================== */

    /**
     * 申请延期（幂等入口）。问题须为 open/processing，申请人须为问题负责人/报告人或交付协调人。
     * <p><b>关键（规则1）</b>：申请延期<b>不</b>把问题置为 deferred、<b>不</b>解除阻断；
     * 问题在被批准前持续阻断。仅创建 pending_product 延期单并通知主责产品经理。
     */
    public RdmIssueDefer applyDefer(Long issueId, RdmIssueDTO.DeferApply dto,
                                    Long currentUserId, String currentUserName) {
        Long actorId = currentUserIdOrThrow();
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(issueId),
                dto == null ? "" : nullToEmpty(dto.getReason()),
                dto == null ? "" : nullToEmpty(dto.getTargetVersion()),
                dto == null ? "" : nullToEmpty(dto.getDueAt()),
                String.valueOf(dto == null ? null : dto.getOwnerUserId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_DEFER)
                .resourceKey("issue:" + issueId)
                .clientRequestId(deriveClientRequestId("applyDefer", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doApplyDefer(issueId, dto, actorId, currentUserName), RdmIssueDefer.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmIssueDefer doApplyDefer(Long issueId, RdmIssueDTO.DeferApply dto, Long actorId, String actorName) {
        RdmIssue issue = requireIssue(issueId);
        if (!RdmConstants.ISSUE_OPEN.equals(issue.getStatus())
                && !RdmConstants.ISSUE_PROCESSING.equals(issue.getStatus())) {
            throw new BusinessException("僅「待處理」或「處理中」的問題可申請延期，當前狀態：" + issue.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("申請延期必須填寫延期原因");
        }
        if (!StringUtils.hasText(dto.getTargetVersion())) {
            throw new BusinessException("申請延期必須填寫目標版本（「以後再說」不是版本）");
        }
        LocalDate dueAt = parseDate(dto.getDueAt());
        if (dueAt == null) {
            throw new BusinessException("申請延期必須填寫修復期限");
        }
        checkExpectedVersion(dto.getExpectedVersion(), issue.getVersion(), "問題");
        requireDeferApplicant(issue, actorId, "申請延期");
        // 业务幂等：同一问题已有在途延期申请时不允许重复发起
        RdmIssueDefer active = findActiveDefer(issueId);
        if (active != null) {
            throw new BusinessException("該問題已有在途的延期申請（狀態：" + active.getStatus() + "），請先處理");
        }

        RdmIssueDefer defer = new RdmIssueDefer();
        defer.setIssueId(issueId);
        defer.setReason(dto.getReason().trim());
        defer.setImpactDesc(dto.getImpactDesc());
        defer.setMitigation(dto.getMitigation());
        defer.setTargetVersion(dto.getTargetVersion().trim());
        defer.setOwnerUserId(dto.getOwnerUserId() != null ? dto.getOwnerUserId() : issue.getOwnerUserId());
        defer.setOwnerUserName(dto.getOwnerUserName() != null ? dto.getOwnerUserName() : issue.getOwnerUserName());
        defer.setDueAt(dueAt);
        defer.setScopeVersion(issue.getScopeVersion());
        defer.setProductDecision(DECISION_PENDING);
        defer.setBizDecision(DECISION_NOT_REQUIRED);
        defer.setStatus(RdmConstants.DEFER_PENDING_PRODUCT);
        defer.setApplicantUserId(actorId);
        defer.setApplicantUserName(actorName);
        defer.setEscalationLevel(0);
        deferMapper.insert(defer);

        // 规则1：申请阶段绝不改问题状态、不解除阻断。问题保持 open/processing，持续阻断直到延期获批。
        notifyProductManager(issue, "問題延期待產品裁決",
                "問題「" + issue.getTitle() + "」（" + issue.getIssueNo() + "）申請延期至 "
                        + defer.getTargetVersion() + "，請產品負責人裁決。裁決通過前該問題仍阻斷交付。");
        log.info("問題延期申請已提交（問題未解除阻斷）: issueNo={}, deferId={}", issue.getIssueNo(), defer.getId());
        return defer;
    }

    /**
     * 产品裁决（幂等入口）：须为需求主责产品经理，且<b>不得是该延期申请人</b>（四眼）。
     */
    public void productDecide(Long deferId, RdmIssueDTO.DeferDecision dto,
                              Long currentUserId, String currentUserName) {
        Long actorId = currentUserIdOrThrow();
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(deferId), "product",
                dto == null ? "" : nullToEmpty(dto.getDecision()),
                dto == null ? "" : nullToEmpty(dto.getReason()),
                String.valueOf(dto == null ? null : dto.getFollowUpReqId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_DECIDE)
                .resourceKey("defer:" + deferId)
                .clientRequestId(deriveClientRequestId("product", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        idempotentService.executeOnce(key,
                () -> { doProductDecide(deferId, dto, actorId, currentUserName); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doProductDecide(Long deferId, RdmIssueDTO.DeferDecision dto, Long actorId, String actorName) {
        RdmIssueDefer defer = requireDefer(deferId);
        RdmIssue issue = requireIssue(defer.getIssueId());
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), defer.getVersion(), "延期單");
        requireProductManager(issue, actorId, "裁決問題延期");
        requireNotApplicant(defer, actorId, "裁決問題延期");
        if (!RdmConstants.DEFER_PENDING_PRODUCT.equals(defer.getStatus())) {
            throw new BusinessException("該延期申請不在「待產品裁決」狀態，當前：" + defer.getStatus());
        }
        boolean approved = parseDecision(dto);

        defer.setProductDecision(approved ? DECISION_APPROVED : DECISION_REJECTED);
        defer.setProductDecideUserId(actorId);
        defer.setProductDecideUserName(actorName);
        defer.setProductDecideTime(LocalDateTime.now());
        defer.setProductDecideReason(dto.getReason());

        if (approved) {
            // 规则2：是否需业务裁决由服务端判定，忽略前端传入的 bizDecisionRequired
            boolean needBiz = requiresBizDecision(issue, defer);
            defer.setBizDecision(needBiz ? DECISION_PENDING : DECISION_NOT_REQUIRED);
            if (needBiz) {
                // 仍需业务确认：延期尚未「获批」，问题持续阻断，不置 deferred、不设 effectiveAt
                defer.setStatus(RdmConstants.DEFER_PENDING_BIZ);
                deferMapper.updateById(defer);
                notifyBizAcceptor(issue, "問題延期待業務確認",
                        "問題「" + issue.getTitle() + "」延期已獲產品同意，需業務驗收人確認後方可解除阻斷。");
            } else {
                // 产品批准且无需业务 → 延期获批：解除阻断
                markDeferApproved(issue, defer);
                if (dto.getFollowUpReqId() != null) {
                    bindCore(issue, defer, dto.getFollowUpReqId(), null, null, actorId);
                }
            }
        } else {
            rejectDefer(issue, defer);
        }
        log.info("產品延期裁決完成: issueNo={}, deferId={}, approved={}", issue.getIssueNo(), deferId, approved);
    }

    /**
     * 业务裁决（幂等入口）：须为交付项业务验收人，且<b>不得是该延期申请人</b>（四眼）。
     */
    public void bizDecide(Long deferId, RdmIssueDTO.DeferDecision dto,
                          Long currentUserId, String currentUserName) {
        Long actorId = currentUserIdOrThrow();
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(deferId), "business",
                dto == null ? "" : nullToEmpty(dto.getDecision()),
                dto == null ? "" : nullToEmpty(dto.getReason()),
                String.valueOf(dto == null ? null : dto.getFollowUpReqId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_DECIDE)
                .resourceKey("defer:" + deferId)
                .clientRequestId(deriveClientRequestId("business", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        idempotentService.executeOnce(key,
                () -> { doBizDecide(deferId, dto, actorId, currentUserName); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doBizDecide(Long deferId, RdmIssueDTO.DeferDecision dto, Long actorId, String actorName) {
        RdmIssueDefer defer = requireDefer(deferId);
        RdmIssue issue = requireIssue(defer.getIssueId());
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), defer.getVersion(), "延期單");
        requireBizAcceptor(issue, actorId, "確認問題延期");
        requireNotApplicant(defer, actorId, "確認問題延期");
        if (!RdmConstants.DEFER_PENDING_BIZ.equals(defer.getStatus())) {
            throw new BusinessException("該延期申請不在「待業務確認」狀態，當前：" + defer.getStatus());
        }
        boolean approved = parseDecision(dto);

        defer.setBizDecision(approved ? DECISION_APPROVED : DECISION_REJECTED);
        defer.setBizDecideUserId(actorId);
        defer.setBizDecideUserName(actorName);
        defer.setBizDecideTime(LocalDateTime.now());
        defer.setBizDecideReason(dto.getReason());

        if (approved) {
            // 业务确认通过 → 延期获批：解除阻断
            markDeferApproved(issue, defer);
            if (dto.getFollowUpReqId() != null) {
                bindCore(issue, defer, dto.getFollowUpReqId(), null, null, actorId);
            }
        } else {
            rejectDefer(issue, defer);
        }
        log.info("業務延期裁決完成: issueNo={}, deferId={}, approved={}", issue.getIssueNo(), deferId, approved);
    }

    /* ==================== 承接（唯一有效承接 + 双向来源） ==================== */

    /**
     * 建立承接（幂等入口，规则4）：以<b>数值 ID</b> 指定问题与承接需求。
     * <p>承接需求须存在、同项目、V3、已准入；每个问题同一时刻唯一有效承接；双向来源完整。
     */
    public RdmIssueFollowup bindFollowUp(RdmIssueDTO.Bind dto) {
        Long actorId = currentUserIdOrThrow();
        if (dto == null || dto.getIssueId() == null || dto.getFollowUpReqId() == null) {
            throw new BusinessException("請以數值ID指定問題與承接需求");
        }
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(dto.getIssueId()), String.valueOf(dto.getFollowUpReqId()),
                String.valueOf(dto.getOwnerUserId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_BIND)
                .resourceKey("issue:" + dto.getIssueId())
                .clientRequestId(deriveClientRequestId("bind", dto.getRequestId(),
                        dto.getIssueId() + "->" + dto.getFollowUpReqId()))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doBindFollowUp(dto, actorId), RdmIssueFollowup.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmIssueFollowup doBindFollowUp(RdmIssueDTO.Bind dto, Long actorId) {
        RdmIssue issue = requireIssue(dto.getIssueId());
        RdmIssueDefer defer = requireDeferPendingBind(issue.getId());
        checkExpectedVersion(dto.getExpectedVersion(), defer.getVersion(), "延期單");
        requireIssueOperator(issue, actorId, "建立問題承接");
        return bindCore(issue, defer, dto.getFollowUpReqId(), dto.getOwnerUserId(), dto.getReason(), actorId);
    }

    /**
     * 承接核心逻辑（事务内，不含 executeOnce）。供 {@link #doBindFollowUp} 与裁决自动绑定复用，
     * 避免把 executeOnce 嵌进已活动的幂等事务。
     */
    private RdmIssueFollowup bindCore(RdmIssue issue, RdmIssueDefer defer, Long followUpReqId,
                                      Long ownerUserIdOverride, String reasonOverride, Long actorId) {
        if (followUpReqId == null) {
            throw new BusinessException("請指定承接需求");
        }
        if (!RdmConstants.DEFER_PENDING_BIND.equals(defer.getStatus())) {
            throw new BusinessException("該延期申請不在「待建立承接」狀態，當前：" + defer.getStatus());
        }
        // 唯一有效承接（服务端显式校验；DB 侧 uk_rdm_followup_active_issue 兜底）
        Long activeCount = followupMapper.selectCount(new LambdaQueryWrapper<RdmIssueFollowup>()
                .eq(RdmIssueFollowup::getIssueId, issue.getId())
                .eq(RdmIssueFollowup::getActive, RdmConstants.FOLLOWUP_ACTIVE));
        if (activeCount != null && activeCount > 0) {
            throw new BusinessException("該問題已有生效承接，一個問題同一時刻只能有一條有效承接");
        }
        // 承接来源必备（NOT NULL 列）：问题须挂在需求 + 交付项上，且有范围版本
        if (issue.getReqId() == null || issue.getDeliveryItemId() == null) {
            throw new BusinessException("問題未關聯需求或交付項，無法建立承接來源");
        }
        Integer scopeVersion = resolveScopeVersion(issue);
        if (scopeVersion == null || scopeVersion <= 0) {
            throw new BusinessException("問題缺少有效的業務範圍版本（scopeVersion>0），無法建立承接");
        }

        RdmRequirement followUp = requirementMapper.selectById(followUpReqId);
        if (followUp == null) {
            throw new BusinessException("承接需求不存在或已刪除");
        }
        // 同项目
        Long issueProjectId = resolveIssueProjectId(issue);
        if (issueProjectId == null || !issueProjectId.equals(followUp.getProjectId())) {
            throw new BusinessException("承接需求必須與問題同屬一個項目");
        }
        // V3
        if (followUp.getFlowVersion() == null || followUp.getFlowVersion() != RdmConstants.FLOW_VERSION_3) {
            throw new BusinessException("承接需求必須為新版交付流程（flow_version=3）");
        }
        // 已准入
        if (!StringUtils.hasText(followUp.getStatus())
                || RdmConstants.REQ_NOT_ADMITTED_STATUSES.contains(followUp.getStatus())) {
            throw new BusinessException("承接需求必須已准入（非草稿/待准入/准入被拒）");
        }
        // 发起人对承接需求须有交付写权限
        accessGuard.requireDeliveryWriter(followUp.getId(), "建立問題承接");

        Long ownerUserId = ownerUserIdOverride != null ? ownerUserIdOverride
                : (defer.getOwnerUserId() != null ? defer.getOwnerUserId() : issue.getOwnerUserId());
        if (ownerUserId == null) {
            throw new BusinessException("無法確定承接責任人，請指定承接負責人");
        }
        String reason = StringUtils.hasText(reasonOverride) ? reasonOverride.trim() : defer.getReason();

        RdmIssueFollowup followup = new RdmIssueFollowup();
        followup.setIssueId(issue.getId());
        followup.setDeferId(defer.getId());
        followup.setFollowUpReqId(followUpReqId);
        followup.setSourceReqId(issue.getReqId());
        followup.setSourceDeliveryItemId(issue.getDeliveryItemId());
        followup.setScopeVersion(scopeVersion);
        followup.setOwnerUserId(ownerUserId);
        followup.setTargetVersion(defer.getTargetVersion());
        followup.setDueAt(defer.getDueAt());
        followup.setActive(RdmConstants.FOLLOWUP_ACTIVE);
        followup.setReason(reason);
        followup.setCreatedBy(actorId);
        followupMapper.insert(followup);

        // 延期单转生效并回填承接
        defer.setFollowUpReqId(followUpReqId);
        defer.setFollowUpReqNo(followUp.getReqNo());
        defer.setStatus(RdmConstants.DEFER_EFFECTIVE);
        deferMapper.updateById(defer);

        // 双向来源：承接需求侧记录「整改来源」问题所在需求（用 parentReqId，绝不写 structureParentReqId 结构父）
        RdmRequirement sourceReq = requirementMapper.selectById(issue.getReqId());
        followUp.setParentReqId(issue.getReqId());
        followUp.setParentReqNo(sourceReq == null ? null : sourceReq.getReqNo());
        requirementMapper.updateById(followUp);

        log.info("問題承接已建立（雙向來源完整）: issueNo={}, followupId={}, followUpReqNo={}, sourceReqId={}, operator={}",
                issue.getIssueNo(), followup.getId(), followUp.getReqNo(), issue.getReqId(), actorId);
        return followup;
    }

    /* ==================== 按证据关闭问题 ==================== */

    /**
     * 按证据关闭问题（幂等入口，规则5）。<b>不得无证据关闭</b>：必须绑定修复证据 + 复测轮次（冻结的执行事实）
     * + 必要验收，写入 {@link RdmIssueResolution}。延期 ≠ 解决；承接完成验收 ≠ 原问题自动解决。
     */
    public RdmIssueResolution resolveIssue(Long issueId, RdmIssueDTO.Resolve dto) {
        Long actorId = currentUserIdOrThrow();
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(issueId),
                String.valueOf(dto == null ? null : dto.getFollowupId()),
                String.valueOf(dto == null ? null : dto.getTestRoundId()),
                String.valueOf(dto == null ? null : dto.getProductAcceptanceId()),
                String.valueOf(dto == null ? null : dto.getBusinessAcceptanceId()),
                dto == null ? "" : nullToEmpty(dto.getBuildId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_RESOLVE)
                .resourceKey("issue:" + issueId)
                .clientRequestId(deriveClientRequestId("resolve", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String bindingRequestId = RdmIdempotentService.bindingRequestId(key);
        return idempotentService.executeOnce(key,
                () -> doResolveIssue(issueId, dto, actorId, bindingRequestId), RdmIssueResolution.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmIssueResolution doResolveIssue(Long issueId, RdmIssueDTO.Resolve dto, Long actorId, String bindingRequestId) {
        RdmIssue issue = requireIssue(issueId);
        if (RdmConstants.ISSUE_RESOLVED.equals(issue.getStatus())) {
            // 幂等：已解决返回既有闭环证据（若有）
            return resolutionMapper.selectOne(new LambdaQueryWrapper<RdmIssueResolution>()
                    .eq(RdmIssueResolution::getIssueId, issueId)
                    .orderByDesc(RdmIssueResolution::getId).last("LIMIT 1"));
        }
        if (RdmConstants.ISSUE_CANCELLED.equals(issue.getStatus())
                || RdmConstants.ISSUE_MERGED.equals(issue.getStatus())) {
            throw new BusinessException("已取消/已合併的問題不能再按解決關閉，當前狀態：" + issue.getStatus());
        }
        if (dto == null) {
            throw new BusinessException("關閉問題必須提供修復證據");
        }
        checkExpectedVersion(dto.getExpectedVersion(), issue.getVersion(), "問題");
        requireIssueOperator(issue, actorId, "關閉問題");

        // 修复证据（必填）
        if (!StringUtils.hasText(dto.getRepairEvidenceJson())) {
            throw new BusinessException("關閉問題必須綁定修復證據，不得無證據關閉");
        }
        // 复测轮次（必填，且须为已冻结的执行事实——关联任务20 复测新轮）
        if (dto.getTestRoundId() == null) {
            throw new BusinessException("關閉問題必須關聯復測輪次");
        }
        RdmTestRound round = testRoundMapper.selectById(dto.getTestRoundId());
        if (round == null) {
            throw new BusinessException("復測輪次不存在");
        }
        if (round.getFrozenAt() == null) {
            throw new BusinessException("復測輪次尚未凍結（無執行事實），不能作為關閉證據");
        }
        // 产品验收（必备，结论须通过）
        if (dto.getProductAcceptanceId() == null) {
            throw new BusinessException("關閉問題必須關聯產品驗收");
        }
        RdmAcceptanceRecord productAcc = acceptanceRecordMapper.selectById(dto.getProductAcceptanceId());
        requirePassedAcceptance(productAcc, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, "產品驗收");
        // 涉业务问题须业务验收（服务端判定，口径同延期）
        if (requiresBizDecision(issue, null)) {
            if (dto.getBusinessAcceptanceId() == null) {
                throw new BusinessException("涉業務問題關閉必須關聯業務驗收");
            }
            RdmAcceptanceRecord bizAcc = acceptanceRecordMapper.selectById(dto.getBusinessAcceptanceId());
            requirePassedAcceptance(bizAcc, RdmConstants.ACCEPTANCE_TYPE_BUSINESS, "業務驗收");
        }
        // 结论必须为通过才能关闭
        String conclusion = StringUtils.hasText(dto.getConclusion()) ? dto.getConclusion().trim() : RdmConstants.RESOLUTION_PASS;
        if (!RdmConstants.RESOLUTION_PASS.equals(conclusion)) {
            throw new BusinessException("復測/驗收結論為不通過，不能關閉問題");
        }
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("關閉問題必須填寫理由");
        }
        // 承接（修复承接）必备：rdm_issue_resolution.followup_id NOT NULL + FK
        RdmIssueFollowup followup = resolveFollowupForResolve(issue, dto.getFollowupId());
        // 关闭所需的来源上下文（NOT NULL 列）
        if (issue.getDeliveryItemId() == null) {
            throw new BusinessException("問題未關聯交付項，無法寫入修復閉環證據");
        }
        Integer scopeVersion = resolveScopeVersion(issue);
        if (scopeVersion == null || scopeVersion <= 0) {
            throw new BusinessException("問題缺少有效的業務範圍版本（scopeVersion>0），無法寫入修復閉環證據");
        }
        if (!StringUtils.hasText(dto.getBuildId()) && !StringUtils.hasText(issue.getBuildId())) {
            throw new BusinessException("關閉問題必須提供構建標識（buildId）");
        }

        RdmIssueResolution resolution = new RdmIssueResolution();
        resolution.setIssueId(issueId);
        resolution.setFollowupId(followup.getId());
        resolution.setDeliveryItemId(issue.getDeliveryItemId());
        resolution.setScopeVersion(scopeVersion);
        resolution.setBuildId(StringUtils.hasText(dto.getBuildId()) ? dto.getBuildId().trim() : issue.getBuildId());
        resolution.setRepairEvidenceJson(dto.getRepairEvidenceJson());
        resolution.setTestRoundId(dto.getTestRoundId());
        resolution.setTestExecutionIdsJson(StringUtils.hasText(dto.getTestExecutionIdsJson())
                ? dto.getTestExecutionIdsJson() : "[]");
        resolution.setProductAcceptanceId(dto.getProductAcceptanceId());
        resolution.setBusinessAcceptanceId(dto.getBusinessAcceptanceId());
        resolution.setConclusion(conclusion);
        resolution.setReason(dto.getReason().trim());
        resolution.setSignerUserId(actorId);
        resolution.setRequestId(bindingRequestId);
        resolutionMapper.insert(resolution);

        issue.setStatus(RdmConstants.ISSUE_RESOLVED);
        issueMapper.updateById(issue);
        log.info("問題已按證據關閉: issueNo={}, resolutionId={}, testRoundId={}, productAcceptanceId={}, operator={}",
                issue.getIssueNo(), resolution.getId(), dto.getTestRoundId(), dto.getProductAcceptanceId(), actorId);
        return resolution;
    }

    /* ==================== 取消 / 合并 / 改派（保留承接与历史） ==================== */

    /** 取消问题（幂等入口，规则6）：保留已有承接关系与历史，仅置终态 cancelled。 */
    public void cancelIssue(Long issueId, RdmIssueDTO.IssueAction dto) {
        issueAction(issueId, dto, "cancel");
    }

    /** 合并问题到目标问题（幂等入口，规则6）：保留承接与历史，置终态 merged 并记录目标。 */
    public void mergeIssue(Long issueId, RdmIssueDTO.IssueAction dto) {
        issueAction(issueId, dto, "merge");
    }

    /** 改派问题负责人（幂等入口，规则6）：保留承接与历史，不因改派丢失承接。 */
    public void reassignIssue(Long issueId, RdmIssueDTO.IssueAction dto) {
        issueAction(issueId, dto, "reassign");
    }

    private void issueAction(Long issueId, RdmIssueDTO.IssueAction dto, String action) {
        Long actorId = currentUserIdOrThrow();
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(issueId), action,
                String.valueOf(dto == null ? null : dto.getTargetIssueId()),
                String.valueOf(dto == null ? null : dto.getNewOwnerUserId()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_ISSUE_ACTION)
                .resourceKey("issue:" + issueId)
                .clientRequestId(deriveClientRequestId(action, dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        idempotentService.executeOnce(key,
                () -> { doIssueAction(issueId, dto, action, actorId); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doIssueAction(Long issueId, RdmIssueDTO.IssueAction dto, String action, Long actorId) {
        RdmIssue issue = requireIssue(issueId);
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("執行" + action + "必須填寫理由");
        }
        checkExpectedVersion(dto.getExpectedVersion(), issue.getVersion(), "問題");
        requireIssueOperator(issue, actorId, action);
        String reason = dto.getReason().trim();

        switch (action) {
            case "cancel" -> {
                if (RdmConstants.ISSUE_CLOSED_STATUSES.contains(issue.getStatus())) {
                    throw new BusinessException("問題已處於終態（" + issue.getStatus() + "），無法取消");
                }
                // 保留承接与历史：不触碰 followup/defer，仅置终态
                issue.setStatus(RdmConstants.ISSUE_CANCELLED);
                issue.setImpact(appendNote(issue.getImpact(), "取消", reason, actorId));
                issueMapper.updateById(issue);
                log.info("問題已取消（承接與歷史保留）: issueNo={}, operator={}", issue.getIssueNo(), actorId);
            }
            case "merge" -> {
                Long targetId = dto.getTargetIssueId();
                if (targetId == null) {
                    throw new BusinessException("合併必須指定目標問題ID（數值）");
                }
                if (targetId.equals(issueId)) {
                    throw new BusinessException("問題不能合併到自身");
                }
                RdmIssue target = requireIssue(targetId);
                if (RdmConstants.ISSUE_CLOSED_STATUSES.contains(issue.getStatus())) {
                    throw new BusinessException("問題已處於終態（" + issue.getStatus() + "），無法合併");
                }
                if (RdmConstants.ISSUE_CLOSED_STATUSES.contains(target.getStatus())) {
                    throw new BusinessException("目標問題已關閉（" + target.getStatus() + "），不能作為合併目標");
                }
                // 保留承接与历史：源问题置 merged，目标以「来源」记录在 impact（不覆盖 sourceType/sourceId 溯源）
                issue.setStatus(RdmConstants.ISSUE_MERGED);
                issue.setImpact(appendNote(issue.getImpact(),
                        "合併至問題 #" + target.getIssueNo() + "(id=" + targetId + ")", reason, actorId));
                issueMapper.updateById(issue);
                log.info("問題已合併（承接與歷史保留）: sourceIssueNo={}, targetIssueNo={}, operator={}",
                        issue.getIssueNo(), target.getIssueNo(), actorId);
            }
            case "reassign" -> {
                Long newOwner = dto.getNewOwnerUserId();
                if (newOwner == null) {
                    throw new BusinessException("改派必須指定新負責人ID（數值）");
                }
                issue.setOwnerUserId(newOwner);
                if (StringUtils.hasText(dto.getNewOwnerUserName())) {
                    issue.setOwnerUserName(dto.getNewOwnerUserName().trim());
                }
                issue.setImpact(appendNote(issue.getImpact(), "改派負責人", reason, actorId));
                issueMapper.updateById(issue);
                // 保留承接：生效承接行不删除、不失效，仅同步责任人，避免「因改派丢失承接」
                RdmIssueFollowup activeFollowup = findActiveFollowup(issueId);
                if (activeFollowup != null) {
                    activeFollowup.setOwnerUserId(newOwner);
                    followupMapper.updateById(activeFollowup);
                }
                log.info("問題已改派（承接與歷史保留）: issueNo={}, newOwner={}, operator={}",
                        issue.getIssueNo(), newOwner, actorId);
            }
            default -> throw new BusinessException("不支持的問題動作: " + action);
        }
    }

    /* ==================== 逾期升级（真实工作日日历） ==================== */

    /**
     * 评估并落库单张延期单的逾期升级（规则6）。用<b>真实工作日日历</b>（含请假/周末支援/按人例外）
     * 计算超过修复期限的工作日数，分级提升 {@code escalationLevel} 并记 {@code escalatedAt}。
     *
     * @return 评估后的升级级别（0 表示未逾期）
     */
    public int evaluateDeferEscalation(Long deferId, LocalDateTime now) {
        RdmIssueDefer defer = requireDefer(deferId);
        return applyEscalation(defer, now);
    }

    /**
     * 扫描所有未终结（非 rejected）延期单做逾期升级；供定时任务/门禁调用。
     * @return 本次发生升级的延期单数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int escalateOverdueDefers(LocalDateTime now) {
        LocalDateTime ts = now == null ? LocalDateTime.now() : now;
        List<RdmIssueDefer> defers = deferMapper.selectList(new LambdaQueryWrapper<RdmIssueDefer>()
                .ne(RdmIssueDefer::getStatus, RdmConstants.DEFER_REJECTED));
        int escalated = 0;
        for (RdmIssueDefer defer : defers) {
            RdmIssue issue = defer.getIssueId() == null ? null : issueMapper.selectById(defer.getIssueId());
            if (issue != null && RdmConstants.ISSUE_CLOSED_STATUSES.contains(issue.getStatus())) {
                continue; // 问题已关闭，无需升级
            }
            int before = defer.getEscalationLevel() == null ? 0 : defer.getEscalationLevel();
            int after = applyEscalation(defer, ts);
            if (after > before) {
                escalated++;
            }
        }
        if (escalated > 0) {
            log.info("延期逾期升級完成: 升級 {} 張延期單", escalated);
        }
        return escalated;
    }

    /** 按真实工作日日历计算逾期级别并落库；仅在级别提升时写 escalatedAt。 */
    private int applyEscalation(RdmIssueDefer defer, LocalDateTime now) {
        int currentLevel = defer.getEscalationLevel() == null ? 0 : defer.getEscalationLevel();
        if (defer.getDueAt() == null) {
            return currentLevel;
        }
        LocalDateTime ts = now == null ? LocalDateTime.now() : now;
        // 真实工作日：按承接/修复责任人的日历（含请假/周末支援）计逾期工作日数，而非简单周一至周五
        int overdueDays = workingDayCalculator.overdueWorkingDays(defer.getDueAt(), ts.toLocalDate(), defer.getOwnerUserId());
        int targetLevel = escalationLevelFor(overdueDays);
        if (targetLevel > currentLevel) {
            defer.setEscalationLevel(targetLevel);
            defer.setEscalatedAt(ts);
            deferMapper.updateById(defer);
            notifyEscalation(defer, targetLevel, overdueDays);
            log.info("延期逾期升級: deferId={}, overdueWorkingDays={}, level {} -> {}",
                    defer.getId(), overdueDays, currentLevel, targetLevel);
        }
        return Math.max(currentLevel, targetLevel);
    }

    private int escalationLevelFor(int overdueWorkingDays) {
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L3_OVERDUE_DAYS) {
            return RdmConstants.ESCALATION_LEVEL_MAX;
        }
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L2_OVERDUE_DAYS) {
            return 2;
        }
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L1_OVERDUE_DAYS) {
            return 1;
        }
        return 0;
    }

    /* ==================== 阻断门禁（供任务27 发布门禁消费） ==================== */

    /**
     * 交付项是否存在<b>阻断性开放问题</b>（供任务27 发布门禁消费）。
     * <p>阻断口径：严重度 ∈ {critical, major} 且问题未关闭（非 resolved/cancelled/merged）
     * 且<b>无「已获批准」的延期</b>（{@link RdmConstants#DEFER_APPROVED_STATUSES}）。
     * 待决/被拒的延期不解除阻断——延期不得绕过严重缺陷阻断。
     */
    public boolean hasBlockingOpenIssue(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return false;
        }
        List<RdmIssue> candidates = issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getDeliveryItemId, deliveryItemId)
                .in(RdmIssue::getSeverity, RdmConstants.SEV_CRITICAL, RdmConstants.SEV_MAJOR)
                .notIn(RdmIssue::getStatus, RdmConstants.ISSUE_CLOSED_STATUSES));
        return anyWithoutApprovedDefer(candidates);
    }

    /**
     * 需求是否存在<b>阻断性开放问题</b>（供任务27 发布门禁消费，口径同 {@link #hasBlockingOpenIssue}）。
     */
    public boolean hasBlockingOpenIssueByReq(Long reqId) {
        if (reqId == null) {
            return false;
        }
        List<RdmIssue> candidates = issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getReqId, reqId)
                .in(RdmIssue::getSeverity, RdmConstants.SEV_CRITICAL, RdmConstants.SEV_MAJOR)
                .notIn(RdmIssue::getStatus, RdmConstants.ISSUE_CLOSED_STATUSES));
        return anyWithoutApprovedDefer(candidates);
    }

    /**
     * 放行闸门（既有消费点 {@code RdmReleaseBatchService} 沿用此名）：交付项是否存在阻断性问题。
     * <p>任务21 起委托 {@link #hasBlockingOpenIssue}，修正为「approved-defer 感知」口径：
     * 旧实现把任何 deferred 一律当非阻断，会让「刚申请未获批」的严重缺陷绕过门禁。
     */
    public boolean hasBlockingIssues(Long deliveryItemId) {
        return hasBlockingOpenIssue(deliveryItemId);
    }

    /** 候选严重问题中，只要有一条无「已获批准」的延期即阻断。 */
    private boolean anyWithoutApprovedDefer(List<RdmIssue> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return false;
        }
        for (RdmIssue issue : candidates) {
            if (!hasApprovedDefer(issue.getId())) {
                return true; // 严重问题未关闭且无获批延期 → 阻断
            }
        }
        return false;
    }

    /** 该问题是否存在「已获批准」的延期（pending_bind/effective）——唯一能解除严重问题阻断的条件。 */
    private boolean hasApprovedDefer(Long issueId) {
        Long count = deferMapper.selectCount(new LambdaQueryWrapper<RdmIssueDefer>()
                .eq(RdmIssueDefer::getIssueId, issueId)
                .in(RdmIssueDefer::getStatus, RdmConstants.DEFER_APPROVED_STATUSES));
        return count != null && count > 0;
    }

    /* ==================== 查询 ==================== */

    /** 分页查询问题；非全量授权者只看与自己相关（负责/报告）的问题。 */
    public Page<RdmIssueVO.ListItem> listIssues(RdmIssueDTO.Query query, Long currentUserId) {
        RdmIssueDTO.Query q = query == null ? new RdmIssueDTO.Query() : query;
        Page<RdmIssue> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        LambdaQueryWrapper<RdmIssue> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(q.getReqId() != null, RdmIssue::getReqId, q.getReqId());
        wrapper.eq(q.getDeliveryItemId() != null, RdmIssue::getDeliveryItemId, q.getDeliveryItemId());
        wrapper.eq(StringUtils.hasText(q.getStatus()), RdmIssue::getStatus, q.getStatus());
        wrapper.eq(StringUtils.hasText(q.getSeverity()), RdmIssue::getSeverity, q.getSeverity());
        wrapper.eq(StringUtils.hasText(q.getSourceType()), RdmIssue::getSourceType, q.getSourceType());
        wrapper.eq(q.getOwnerUserId() != null, RdmIssue::getOwnerUserId, q.getOwnerUserId());
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmIssue::getIssueNo, kw).or().like(RdmIssue::getTitle, kw));
        }
        if (!canSeeAll() && currentUserId != null) {
            wrapper.and(w -> w.eq(RdmIssue::getOwnerUserId, currentUserId)
                    .or().eq(RdmIssue::getReporterUserId, currentUserId));
        }
        wrapper.orderByDesc(RdmIssue::getId);
        Page<RdmIssue> result = issueMapper.selectPage(page, wrapper);
        List<RdmIssue> rows = result.getRecords();

        Map<Long, RdmRequirement> reqMap = loadReqs(rows.stream().map(RdmIssue::getReqId).toList());
        Map<Long, String> itemTitleMap = loadItemTitles(rows.stream().map(RdmIssue::getDeliveryItemId).toList());

        Page<RdmIssueVO.ListItem> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(rows.stream().map(i -> toListItem(i, reqMap, itemTitleMap)).toList());
        return voPage;
    }

    /** 问题详情（含延期记录）。 */
    public RdmIssueVO.Detail getIssueDetail(Long issueId, Long currentUserId) {
        RdmIssue issue = requireIssue(issueId);
        RdmRequirement req = issue.getReqId() == null ? null : requirementMapper.selectById(issue.getReqId());
        String itemTitle = null;
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            itemTitle = item == null ? null : item.getTitle();
        }

        RdmIssueVO.Detail detail = new RdmIssueVO.Detail();
        detail.setId(issue.getId());
        detail.setIssueNo(issue.getIssueNo());
        detail.setTitle(issue.getTitle());
        detail.setSourceType(issue.getSourceType());
        detail.setReqId(issue.getReqId());
        detail.setReqTitle(req == null ? null : req.getTitle());
        detail.setReqNo(req == null ? null : req.getReqNo());
        detail.setDeliveryItemId(issue.getDeliveryItemId());
        detail.setDeliveryItemTitle(itemTitle);
        detail.setSeverity(issue.getSeverity());
        detail.setOwnerUserName(issue.getOwnerUserName());
        detail.setStatus(issue.getStatus());
        detail.setCreatedAt(DateTimeUtils.format(issue.getCreatedAt()));
        detail.setUpdatedAt(DateTimeUtils.format(issue.getUpdatedAt()));
        detail.setDescription(issue.getDescription());
        detail.setImpact(issue.getImpact());
        detail.setScopeVersion(issue.getScopeVersion());
        detail.setBuildId(issue.getBuildId());
        detail.setReporterUserName(issue.getReporterUserName());

        List<RdmIssueDefer> defers = deferMapper.selectList(new LambdaQueryWrapper<RdmIssueDefer>()
                .eq(RdmIssueDefer::getIssueId, issueId)
                .orderByDesc(RdmIssueDefer::getId));
        detail.setDeferRecords(defers.stream().map(this::toDeferRecord).toList());
        return detail;
    }

    /* ==================== 私有辅助 ==================== */

    /** 从认证主体解析当前登录人 ID（规则3：决定人身份来自认证主体，fail-closed）。 */
    private Long currentUserIdOrThrow() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return current.getId();
    }

    /**
     * 幂等 clientRequestId：优先客户端 requestId，否则用服务端派生判别子。
     * <p><b>必须适配 {@code rdm_idempotent_log.client_request_id VARCHAR(64) ascii}</b>：派生判别子本身就是
     * 64 位 hex（{@code hash}），与 {@code op+":"} 前缀拼接后会超出列宽（如 {@code applyDefer:<64hex>}≈75 字符）。
     * 这里直接复用中心归一化 {@link RdmIdempotentService#normalizeClientRequestId}，超长或含非 ASCII 时再取一次
     * SHA-256 得到定长 64 位 ASCII，且保持「同 op 同内容 → 同 id」的幂等语义不变；不依赖中心兜底才安全。
     */
    private String deriveClientRequestId(String op, String requestId, String discriminator) {
        String tail = StringUtils.hasText(requestId) ? requestId.trim()
                : (StringUtils.hasText(discriminator) ? discriminator : "na");
        return RdmIdempotentService.normalizeClientRequestId(op + ":" + tail);
    }

    /** 乐观锁预检：客户端回传版本与当前实体版本不一致即拒绝（真实并发由 @Version 兜底，任务24 验证）。 */
    private void checkExpectedVersion(Integer expected, Integer actual, String what) {
        if (expected != null && !expected.equals(actual)) {
            throw new BusinessException(what + "已被他人修改（版本不一致），請刷新後重試");
        }
    }

    /**
     * 是否需要业务侧裁决（规则2，服务端判定，不信任前端）。
     * <p>判据：严重度 critical/major，或来源为验收/线上（直接触达业务），或延期伴随范围变更。
     */
    private boolean requiresBizDecision(RdmIssue issue, RdmIssueDefer defer) {
        if (issue != null && (RdmConstants.SEV_CRITICAL.equals(issue.getSeverity())
                || RdmConstants.SEV_MAJOR.equals(issue.getSeverity()))) {
            return true;
        }
        if (issue != null && ("acceptance".equals(issue.getSourceType()) || "online".equals(issue.getSourceType()))) {
            return true;
        }
        return defer != null && defer.getScopeChangeId() != null;
    }

    /** 延期获批：置 pending_bind、记 effectiveAt、问题转 deferred（解除阻断）。 */
    private void markDeferApproved(RdmIssue issue, RdmIssueDefer defer) {
        defer.setStatus(RdmConstants.DEFER_PENDING_BIND);
        if (defer.getEffectiveAt() == null) {
            defer.setEffectiveAt(LocalDateTime.now());
        }
        deferMapper.updateById(defer);
        if (!RdmConstants.ISSUE_DEFERRED.equals(issue.getStatus())) {
            issue.setStatus(RdmConstants.ISSUE_DEFERRED);
            issueMapper.updateById(issue);
        }
    }

    /** 延期被拒：置 rejected；若问题曾被置 deferred 则回到 open（恢复阻断）。 */
    private void rejectDefer(RdmIssue issue, RdmIssueDefer defer) {
        defer.setStatus(RdmConstants.DEFER_REJECTED);
        deferMapper.updateById(defer);
        if (RdmConstants.ISSUE_DEFERRED.equals(issue.getStatus())) {
            issue.setStatus(RdmConstants.ISSUE_OPEN);
            issueMapper.updateById(issue);
        }
    }

    /** 四眼：裁决人不得是该延期申请人；管理员无代签/自批豁免。 */
    private void requireNotApplicant(RdmIssueDefer defer, Long actorId, String action) {
        if (actorId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (actorId.equals(defer.getApplicantUserId())) {
            throw new BusinessException("申請人不得自行" + action + "（四眼原則：決定人必須不同於申請人，管理員亦無豁免）");
        }
    }

    /** 验收记录校验：存在、类型匹配、结论通过。 */
    private void requirePassedAcceptance(RdmAcceptanceRecord record, String expectedType, String label) {
        if (record == null) {
            throw new BusinessException(label + "記錄不存在");
        }
        if (!expectedType.equals(record.getAcceptanceType())) {
            throw new BusinessException(label + "記錄類型不正確（應為 " + expectedType + "）");
        }
        if (!RdmConstants.ACCEPT_PASS.equals(record.getConclusion())) {
            throw new BusinessException(label + "結論必須為通過（pass），當前：" + record.getConclusion());
        }
    }

    /** 关闭时的承接解析：优先用入参 followupId（须属本问题），否则取本问题的生效承接；都没有则拒绝关闭。 */
    private RdmIssueFollowup resolveFollowupForResolve(RdmIssue issue, Long followupId) {
        if (followupId != null) {
            RdmIssueFollowup followup = followupMapper.selectById(followupId);
            if (followup == null || !issue.getId().equals(followup.getIssueId())) {
                throw new BusinessException("承接記錄不存在或不屬於該問題");
            }
            return followup;
        }
        RdmIssueFollowup active = findActiveFollowup(issue.getId());
        if (active == null) {
            throw new BusinessException("關閉問題前必須先建立承接（修復）記錄");
        }
        return active;
    }

    private RdmIssueFollowup findActiveFollowup(Long issueId) {
        return followupMapper.selectOne(new LambdaQueryWrapper<RdmIssueFollowup>()
                .eq(RdmIssueFollowup::getIssueId, issueId)
                .eq(RdmIssueFollowup::getActive, RdmConstants.FOLLOWUP_ACTIVE)
                .orderByDesc(RdmIssueFollowup::getId).last("LIMIT 1"));
    }

    private RdmIssueDefer requireDeferPendingBind(Long issueId) {
        RdmIssueDefer defer = deferMapper.selectOne(new LambdaQueryWrapper<RdmIssueDefer>()
                .eq(RdmIssueDefer::getIssueId, issueId)
                .eq(RdmIssueDefer::getStatus, RdmConstants.DEFER_PENDING_BIND)
                .orderByDesc(RdmIssueDefer::getId).last("LIMIT 1"));
        if (defer == null) {
            throw new BusinessException("該問題沒有「已獲批待建立承接」的延期單，無法建立承接");
        }
        return defer;
    }

    /** 业务范围版本：优先问题自身，回落来源交付项。 */
    private Integer resolveScopeVersion(RdmIssue issue) {
        if (issue.getScopeVersion() != null && issue.getScopeVersion() > 0) {
            return issue.getScopeVersion();
        }
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null && item.getScopeVersion() != null) {
                return item.getScopeVersion();
            }
        }
        return issue.getScopeVersion();
    }

    /** 问题所属项目：优先来源需求，回落来源交付项。 */
    private Long resolveIssueProjectId(RdmIssue issue) {
        if (issue.getReqId() != null) {
            RdmRequirement req = requirementMapper.selectById(issue.getReqId());
            if (req != null && req.getProjectId() != null) {
                return req.getProjectId();
            }
        }
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null) {
                return item.getProjectId();
            }
        }
        return null;
    }

    /** 在 impact 追加一条不可变历史备注（保留原文，供 cancel/merge/reassign 留痕）。 */
    private String appendNote(String impact, String action, String reason, Long actorId) {
        String note = "[" + action + " by " + actorId + "] " + reason;
        return StringUtils.hasText(impact) ? impact + "\n" + note : note;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** 幂等检查：同一问题的在途延期申请（pending_product/pending_biz/pending_bind）。 */
    private RdmIssueDefer findActiveDefer(Long issueId) {
        return deferMapper.selectOne(new LambdaQueryWrapper<RdmIssueDefer>()
                .eq(RdmIssueDefer::getIssueId, issueId)
                .in(RdmIssueDefer::getStatus, RdmConstants.DEFER_OPEN_STATUSES)
                .orderByDesc(RdmIssueDefer::getId)
                .last("LIMIT 1"));
    }

    private boolean parseDecision(RdmIssueDTO.DeferDecision dto) {
        if (dto == null || !StringUtils.hasText(dto.getDecision())) {
            throw new BusinessException("請選擇裁決結果（approved/rejected）");
        }
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("裁決必須填寫理由");
        }
        String decision = dto.getDecision().trim();
        if (DECISION_APPROVED.equals(decision)) {
            return true;
        }
        if (DECISION_REJECTED.equals(decision)) {
            return false;
        }
        throw new BusinessException("非法的裁決結果: " + decision);
    }

    private RdmIssue requireIssue(Long issueId) {
        RdmIssue issue = issueId == null ? null : issueMapper.selectById(issueId);
        if (issue == null) {
            throw new BusinessException("問題不存在或已刪除");
        }
        return issue;
    }

    private RdmIssueDefer requireDefer(Long deferId) {
        RdmIssueDefer defer = deferId == null ? null : deferMapper.selectById(deferId);
        if (defer == null) {
            throw new BusinessException("延期申請不存在或已刪除");
        }
        return defer;
    }

    /** 延期申请人：问题负责人/报告人本人或所属交付项协调人（管理员协调放行）。 */
    private void requireDeferApplicant(RdmIssue issue, Long actorId, String action) {
        if (canSeeAll()) {
            return;
        }
        if (actorId != null && (actorId.equals(issue.getOwnerUserId()) || actorId.equals(issue.getReporterUserId()))) {
            return;
        }
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null && actorId != null && actorId.equals(item.getCoordinatorUserId())) {
                return;
            }
        }
        throw new BusinessException("僅問題負責人/報告人或交付協調人可以" + action);
    }

    /**
     * 产品裁决人：需求主责产品经理（回落交付项产品验收人）。
     * <p>规则3：<b>无 admin 直通</b>（签署/裁决类守卫取消管理员代签），actorId 为空 fail-closed。
     */
    private void requireProductManager(RdmIssue issue, Long actorId, String action) {
        Long pmUserId = null;
        if (issue.getReqId() != null) {
            RdmRequirement req = requirementMapper.selectById(issue.getReqId());
            if (req != null) {
                pmUserId = req.getAssigneePmUserId();
            }
        }
        if (pmUserId == null && issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null) {
                pmUserId = item.getProductAcceptorUserId();
            }
        }
        if (actorId == null || pmUserId == null || !actorId.equals(pmUserId)) {
            throw new BusinessException("僅需求主責產品經理可以" + action + "（管理員無代簽豁免）");
        }
    }

    /**
     * 业务确认人：所属交付项业务验收人。
     * <p>规则3：<b>无 admin 直通</b>，actorId 为空 fail-closed。
     */
    private void requireBizAcceptor(RdmIssue issue, Long actorId, String action) {
        Long bizUserId = null;
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null) {
                bizUserId = item.getBizAcceptorUserId();
            }
        }
        if (actorId == null || bizUserId == null || !actorId.equals(bizUserId)) {
            throw new BusinessException("僅交付項業務驗收人可以" + action + "（管理員無代簽豁免）");
        }
    }

    /**
     * 问题操作人（cancel/merge/reassign/resolve 等操作类动作，非四眼签署）：
     * 管理员/全量范围可协调，或问题负责人/报告人，或交付项协调人/产品验收人，或需求交付写权限者。
     */
    private void requireIssueOperator(RdmIssue issue, Long actorId, String action) {
        if (actorId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (canSeeAll()) {
            return;
        }
        if (actorId.equals(issue.getOwnerUserId()) || actorId.equals(issue.getReporterUserId())) {
            return;
        }
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null && (actorId.equals(item.getCoordinatorUserId())
                    || actorId.equals(item.getProductAcceptorUserId()))) {
                return;
            }
        }
        if (issue.getReqId() != null) {
            try {
                accessGuard.requireDeliveryWriter(issue.getReqId(), action);
                return;
            } catch (BusinessException ignore) {
                // 落到最终拒绝
            }
        }
        throw new BusinessException("無權對該問題執行「" + action + "」");
    }

    private void requireFlowV3(Long reqId) {
        RdmRequirement req = requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("關聯需求不存在或已刪除");
        }
        if (req.getFlowVersion() == null || req.getFlowVersion() != RdmConstants.FLOW_VERSION_3) {
            throw new BusinessException("該需求非新版交付流程（flow_version=3），無法登記問題");
        }
    }

    private void notifyProductManager(RdmIssue issue, String title, String text) {
        Long pmUserId = null;
        RdmRequirement req = null;
        if (issue.getReqId() != null) {
            req = requirementMapper.selectById(issue.getReqId());
            if (req != null) {
                pmUserId = req.getAssigneePmUserId();
            }
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_STATUS_CHANGED, req,
                pmUserId == null ? List.of() : List.of(pmUserId), title, text);
    }

    private void notifyBizAcceptor(RdmIssue issue, String title, String text) {
        Long bizUserId = null;
        RdmRequirement req = issue.getReqId() == null ? null : requirementMapper.selectById(issue.getReqId());
        if (issue.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(issue.getDeliveryItemId());
            if (item != null) {
                bizUserId = item.getBizAcceptorUserId();
            }
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_STATUS_CHANGED, req,
                bizUserId == null ? List.of() : List.of(bizUserId), title, text);
    }

    private void notifyEscalation(RdmIssueDefer defer, int level, int overdueDays) {
        RdmIssue issue = defer.getIssueId() == null ? null : issueMapper.selectById(defer.getIssueId());
        RdmRequirement req = (issue != null && issue.getReqId() != null)
                ? requirementMapper.selectById(issue.getReqId()) : null;
        List<Long> receivers = defer.getOwnerUserId() == null ? List.of() : List.of(defer.getOwnerUserId());
        String title = "問題延期已逾期升級（L" + level + "）";
        String text = "延期單 #" + defer.getId() + " 目標版本 " + defer.getTargetVersion()
                + " 已超過修復期限 " + overdueDays + " 個工作日，升級至 L" + level + "，請盡快承接處理。";
        notifyService.notifyUserIds(RdmConstants.EVENT_STATUS_CHANGED, req, receivers, title, text);
    }

    private boolean canSeeAll() {
        SysUser current = operatorResolver.currentUser();
        return accessGuard.canSeeAll(current);
    }

    private String generateIssueNo() {
        return bizSeqService.next(SEQ_ISSUE);
    }

    private Map<Long, RdmRequirement> loadReqs(List<Long> reqIds) {
        List<Long> ids = reqIds == null ? List.of()
                : reqIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .in(RdmRequirement::getId, ids)).stream()
                .collect(Collectors.toMap(RdmRequirement::getId, Function.identity(), (a, b) -> a));
    }

    private Map<Long, String> loadItemTitles(List<Long> itemIds) {
        List<Long> ids = itemIds == null ? List.of()
                : itemIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return deliveryItemMapper.selectList(new LambdaQueryWrapper<RdmDeliveryItem>()
                        .in(RdmDeliveryItem::getId, ids)).stream()
                .collect(Collectors.toMap(RdmDeliveryItem::getId,
                        i -> i.getTitle() == null ? "" : i.getTitle(), (a, b) -> a));
    }

    private RdmIssueVO.ListItem toListItem(RdmIssue i, Map<Long, RdmRequirement> reqMap,
                                           Map<Long, String> itemTitleMap) {
        RdmIssueVO.ListItem vo = new RdmIssueVO.ListItem();
        vo.setId(i.getId());
        vo.setIssueNo(i.getIssueNo());
        vo.setTitle(i.getTitle());
        vo.setSourceType(i.getSourceType());
        vo.setReqId(i.getReqId());
        RdmRequirement req = i.getReqId() == null ? null : reqMap.get(i.getReqId());
        vo.setReqTitle(req == null ? null : req.getTitle());
        vo.setReqNo(req == null ? null : req.getReqNo());
        vo.setDeliveryItemId(i.getDeliveryItemId());
        vo.setDeliveryItemTitle(i.getDeliveryItemId() == null ? null
                : itemTitleMap.getOrDefault(i.getDeliveryItemId(), null));
        vo.setSeverity(i.getSeverity());
        vo.setOwnerUserName(i.getOwnerUserName());
        vo.setStatus(i.getStatus());
        vo.setCreatedAt(DateTimeUtils.format(i.getCreatedAt()));
        return vo;
    }

    private RdmIssueVO.DeferRecord toDeferRecord(RdmIssueDefer d) {
        RdmIssueVO.DeferRecord vo = new RdmIssueVO.DeferRecord();
        vo.setId(d.getId());
        vo.setReason(d.getReason());
        vo.setImpactDesc(d.getImpactDesc());
        vo.setMitigation(d.getMitigation());
        vo.setTargetVersion(d.getTargetVersion());
        vo.setOwnerUserName(d.getOwnerUserName());
        vo.setDueAt(DateTimeUtils.format(d.getDueAt()));
        vo.setProductDecision(d.getProductDecision());
        vo.setProductDecideUserName(d.getProductDecideUserName());
        vo.setProductDecideTime(DateTimeUtils.format(d.getProductDecideTime()));
        vo.setProductDecideReason(d.getProductDecideReason());
        vo.setBizDecision(d.getBizDecision());
        vo.setBizDecideUserName(d.getBizDecideUserName());
        vo.setBizDecideTime(DateTimeUtils.format(d.getBizDecideTime()));
        vo.setBizDecideReason(d.getBizDecideReason());
        vo.setFollowUpReqId(d.getFollowUpReqId());
        vo.setFollowUpReqNo(d.getFollowUpReqNo());
        vo.setStatus(d.getStatus());
        vo.setApplicantUserName(d.getApplicantUserName());
        vo.setCreatedAt(DateTimeUtils.format(d.getCreatedAt()));
        return vo;
    }

    private static LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            throw new BusinessException("修復期限格式不正確：" + value + "（應為 YYYY-MM-DD）");
        }
    }

    private static long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1L : pageNo;
    }

    private static long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) {
            return 20L;
        }
        return Math.min(pageSize, 200L);
    }
}
