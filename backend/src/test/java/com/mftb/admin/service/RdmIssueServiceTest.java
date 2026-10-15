package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmIssueDTO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmIssueResolution;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmIssueResolutionMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务21「延期承接与问题解决闭环」服务测试（纯 Mockito 离线，不连库）。
 *
 * <p>锁死 7 条不可让的口径：延期不得绕过严重缺陷阻断、bizDecisionRequired 服务端判定、
 * 四眼/拒绝自批、唯一有效承接与双向来源、按证据关闭、cancel/merge/reassign 保留承接与历史 +
 * 真实工作日逾期升级、executeOnce 幂等。
 *
 * <p><b>重要声明</b>：本类为纯 Mockito 单测，<b>不等价于真实数据库并发证明</b>。
 * {@code @Version} 乐观锁、{@code executeOnce} 占位唯一约束、{@code uk_rdm_followup_active_issue}
 * 生成列唯一索引在真实并发下的兜底能力，留待任务24 的集成/并发验证；此处只验证服务层的判定分支与调用契约。
 */
class RdmIssueServiceTest {

    private static final long OWNER = 41L;
    private static final long PM = 21L;
    private static final long BIZ = 32L;
    private static final long ADMIN = 9L;
    private static final long NEW_OWNER = 55L;
    private static final long STRANGER = 77L;

    private static final long ISSUE_ID = 1001L;
    private static final long TARGET_ISSUE_ID = 1002L;
    private static final long DEFER_ID = 2001L;
    private static final long REQ_ID = 100L;
    private static final long ITEM_ID = 500L;
    private static final long FOLLOWUP_REQ_ID = 200L;
    private static final long PROJECT_ID = 10L;
    private static final long FOLLOWUP_ID = 5001L;
    private static final long ROUND_ID = 3001L;
    private static final long PROD_ACC = 4001L;
    private static final long BIZ_ACC = 4002L;

    private static final LocalDate MON = LocalDate.of(2026, 1, 5);
    private static final LocalDate WED = LocalDate.of(2026, 1, 7);
    private static final LocalDate NEXT_MON = LocalDate.of(2026, 1, 12);

    private RdmIssueMapper issueMapper;
    private RdmIssueDeferMapper deferMapper;
    private RdmIssueFollowupMapper followupMapper;
    private RdmIssueResolutionMapper resolutionMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmTestRoundMapper testRoundMapper;
    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmWorkCalendarMapper calendarMapper;
    private RdmNotifyService notifyService;
    private RdmAccessGuard accessGuard;
    private BizSeqService bizSeqService;
    private OperatorResolver operatorResolver;
    private RdmIdempotentService idempotentService;

    private RdmIssueService service;

    @BeforeEach
    void setUp() {
        issueMapper = mock(RdmIssueMapper.class);
        deferMapper = mock(RdmIssueDeferMapper.class);
        followupMapper = mock(RdmIssueFollowupMapper.class);
        resolutionMapper = mock(RdmIssueResolutionMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        testRoundMapper = mock(RdmTestRoundMapper.class);
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        notifyService = mock(RdmNotifyService.class);
        accessGuard = mock(RdmAccessGuard.class);
        bizSeqService = mock(BizSeqService.class);
        operatorResolver = mock(OperatorResolver.class);
        idempotentService = mock(RdmIdempotentService.class);

        when(calendarMapper.selectList(any())).thenReturn(List.of());
        when(idempotentService.stableRequestHash(any())).thenReturn("stable-hash");
        // 默认：executeOnce 直接执行业务动作（首次执行路径）
        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        when(deliveryItemMapper.selectById(ITEM_ID)).thenReturn(item());

        service = new RdmIssueService(issueMapper, deferMapper, followupMapper, resolutionMapper,
                deliveryItemMapper, requirementMapper, testRoundMapper, acceptanceRecordMapper,
                notifyService, accessGuard, bizSeqService, operatorResolver, idempotentService,
                new RdmWorkingDayCalculator(calendarMapper));
    }

    /* ==================== 辅助构造 ==================== */

    private void loginAs(long userId) {
        SysUser u = new SysUser();
        u.setId(userId);
        when(operatorResolver.currentUser()).thenReturn(u);
    }

    private RdmIssue issue(String severity, String status, String sourceType) {
        RdmIssue i = new RdmIssue();
        i.setId(ISSUE_ID);
        i.setIssueNo("WT-1001");
        i.setSourceType(sourceType);
        i.setReqId(REQ_ID);
        i.setDeliveryItemId(ITEM_ID);
        i.setScopeVersion(1);
        i.setBuildId("BUILD-1");
        i.setTitle("严重缺陷");
        i.setSeverity(severity);
        i.setOwnerUserId(OWNER);
        i.setOwnerUserName("owner");
        i.setReporterUserId(OWNER);
        i.setReporterUserName("owner");
        i.setStatus(status);
        i.setVersion(0);
        return i;
    }

    private RdmIssueDefer defer(String status) {
        RdmIssueDefer d = new RdmIssueDefer();
        d.setId(DEFER_ID);
        d.setIssueId(ISSUE_ID);
        d.setReason("延期原因");
        d.setTargetVersion("v2.0");
        d.setOwnerUserId(OWNER);
        d.setOwnerUserName("owner");
        d.setDueAt(MON);
        d.setStatus(status);
        d.setApplicantUserId(OWNER);
        d.setApplicantUserName("owner");
        d.setProductDecision("pending");
        d.setBizDecision("not_required");
        d.setEscalationLevel(0);
        d.setVersion(0);
        return d;
    }

    private RdmRequirement req(long id, int flowVersion, String status, long projectId, Long pmId) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setReqNo("REQ-" + id);
        r.setFlowVersion(flowVersion);
        r.setStatus(status);
        r.setProjectId(projectId);
        r.setAssigneePmUserId(pmId);
        return r;
    }

    private RdmDeliveryItem item() {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(ITEM_ID);
        it.setReqId(REQ_ID);
        it.setProjectId(PROJECT_ID);
        it.setTitle("交付项");
        it.setScopeVersion(1);
        it.setCoordinatorUserId(OWNER);
        it.setProductAcceptorUserId(PM);
        it.setBizAcceptorUserId(BIZ);
        return it;
    }

    private RdmTestRound round(long id, boolean frozen) {
        RdmTestRound r = new RdmTestRound();
        r.setId(id);
        r.setFrozenAt(frozen ? LocalDateTime.now() : null);
        return r;
    }

    private RdmAcceptanceRecord acceptance(long id, String type, String conclusion) {
        RdmAcceptanceRecord a = new RdmAcceptanceRecord();
        a.setId(id);
        a.setDeliveryItemId(ITEM_ID);
        a.setAcceptanceType(type);
        a.setConclusion(conclusion);
        return a;
    }

    private RdmIssueDTO.DeferApply deferApplyDto() {
        RdmIssueDTO.DeferApply d = new RdmIssueDTO.DeferApply();
        d.setReason("需要延期修复");
        d.setTargetVersion("v2.0");
        d.setDueAt("2026-01-05");
        return d;
    }

    private RdmIssueDTO.DeferDecision decision(String decision) {
        RdmIssueDTO.DeferDecision d = new RdmIssueDTO.DeferDecision();
        d.setDecision(decision);
        d.setReason("裁决理由");
        return d;
    }

    private RdmIssueDTO.Bind bindDto() {
        RdmIssueDTO.Bind b = new RdmIssueDTO.Bind();
        b.setIssueId(ISSUE_ID);
        b.setFollowUpReqId(FOLLOWUP_REQ_ID);
        return b;
    }

    private RdmIssueDTO.Resolve resolveDto() {
        RdmIssueDTO.Resolve r = new RdmIssueDTO.Resolve();
        r.setFollowupId(FOLLOWUP_ID);
        r.setRepairEvidenceJson("{\"fix\":\"commit-abc\"}");
        r.setTestRoundId(ROUND_ID);
        r.setProductAcceptanceId(PROD_ACC);
        r.setReason("已修复并复测通过");
        return r;
    }

    private RdmIssueDTO.IssueAction actionDto(String reason) {
        RdmIssueDTO.IssueAction a = new RdmIssueDTO.IssueAction();
        a.setReason(reason);
        return a;
    }

    /** 一条属于本问题的生效承接。 */
    private RdmIssueFollowup activeFollowup() {
        RdmIssueFollowup f = new RdmIssueFollowup();
        f.setId(FOLLOWUP_ID);
        f.setIssueId(ISSUE_ID);
        f.setDeferId(DEFER_ID);
        f.setFollowUpReqId(FOLLOWUP_REQ_ID);
        f.setSourceReqId(REQ_ID);
        f.setSourceDeliveryItemId(ITEM_ID);
        f.setOwnerUserId(OWNER);
        f.setActive(RdmConstants.FOLLOWUP_ACTIVE);
        return f;
    }

    /* ==================== 规则1：延期不得绕过严重缺陷阻断 ==================== */

    @Test
    @DisplayName("申请延期不解除严重缺陷阻断：问题不置 deferred、不改状态、仍阻断")
    void applyDeferDoesNotUnblockSevereIssue() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_CRITICAL, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(deferMapper.selectOne(any())).thenReturn(null); // 无在途延期

        RdmIssueDefer created = service.applyDefer(ISSUE_ID, deferApplyDto(), OWNER, "owner");

        assertNotNull(created);
        assertEquals(RdmConstants.DEFER_PENDING_PRODUCT, created.getStatus());
        // 关键：申请阶段问题状态未变（未置 deferred），且未落库修改
        assertEquals(RdmConstants.ISSUE_OPEN, issue.getStatus());
        verify(issueMapper, never()).updateById(any(RdmIssue.class));
        verify(deferMapper).insert(any(RdmIssueDefer.class));

        // 严重问题仍阻断门禁
        when(issueMapper.selectList(any())).thenReturn(List.of(issue));
        when(deferMapper.selectCount(any())).thenReturn(0L);
        assertTrue(service.hasBlockingOpenIssue(ITEM_ID));
    }

    @Test
    @DisplayName("仅完全批准的延期解除阻断：产品批准(需业务)仍阻断，业务批准后解除")
    void onlyFullyApprovedDeferUnblocks() {
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(issueMapper.selectList(any())).thenReturn(List.of(issue));
        when(deferMapper.selectCount(any())).thenReturn(0L);

        // 阶段A：产品批准，但严重问题服务端判定需业务确认 → 仍待业务、仍阻断
        loginAs(PM);
        service.productDecide(DEFER_ID, decision("approved"), PM, "pm");
        assertEquals(RdmConstants.DEFER_PENDING_BIZ, defer.getStatus());
        assertEquals(RdmConstants.ISSUE_OPEN, issue.getStatus()); // 未解除阻断
        assertNull(defer.getEffectiveAt());
        assertTrue(service.hasBlockingOpenIssue(ITEM_ID));

        // 阶段B：业务批准 → 延期获批、问题转 deferred、记 effectiveAt、解除阻断
        loginAs(BIZ);
        service.bizDecide(DEFER_ID, decision("approved"), BIZ, "biz");
        assertEquals(RdmConstants.DEFER_PENDING_BIND, defer.getStatus());
        assertEquals(RdmConstants.ISSUE_DEFERRED, issue.getStatus());
        assertNotNull(defer.getEffectiveAt());
        when(deferMapper.selectCount(any())).thenReturn(1L); // 已有获批延期
        assertFalse(service.hasBlockingOpenIssue(ITEM_ID));
    }

    @Test
    @DisplayName("被拒的延期不解除阻断：问题回到/保持 open，仍阻断")
    void rejectedDeferKeepsBlocking() {
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));

        loginAs(PM);
        service.productDecide(DEFER_ID, decision("rejected"), PM, "pm");

        assertEquals(RdmConstants.DEFER_REJECTED, defer.getStatus());
        assertEquals(RdmConstants.ISSUE_OPEN, issue.getStatus());
        when(issueMapper.selectList(any())).thenReturn(List.of(issue));
        when(deferMapper.selectCount(any())).thenReturn(0L);
        assertTrue(service.hasBlockingOpenIssue(ITEM_ID));
    }

    /* ==================== 规则2：bizDecisionRequired 服务端判定 ==================== */

    @Test
    @DisplayName("服务端自行判定需业务确认，忽略前端传入的 bizDecisionRequired=false")
    void serverIgnoresClientBizRequiredFalsePositive() {
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));

        RdmIssueDTO.DeferDecision dto = decision("approved");
        dto.setBizDecisionRequired(false); // 前端谎称不需要业务确认

        loginAs(PM);
        service.productDecide(DEFER_ID, dto, PM, "pm");

        // 服务端依据严重度判定需业务：进入 pending_biz，而非直接获批
        assertEquals(RdmConstants.DEFER_PENDING_BIZ, defer.getStatus());
        assertEquals("pending", defer.getBizDecision());
        assertEquals(RdmConstants.ISSUE_OPEN, issue.getStatus());
    }

    /* ==================== 规则3：四眼 / 拒绝自批 / 身份来自认证主体 ==================== */

    @Test
    @DisplayName("申请人不得裁决自己的延期（四眼）")
    void applicantCannotDecideOwnDefer() {
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        defer.setApplicantUserId(PM); // 申请人就是产品经理本人
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));

        loginAs(PM);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.productDecide(DEFER_ID, decision("approved"), PM, "pm"));
        assertTrue(ex.getMessage().contains("四眼"));
        verify(deferMapper, never()).updateById(any(RdmIssueDefer.class));
    }

    @Test
    @DisplayName("管理员无代签豁免：非主责产品经理即便 canSeeAll 也不能裁决")
    void adminCannotDecideWithoutRole() {
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(accessGuard.canSeeAll(any())).thenReturn(true); // 管理员全量可见

        loginAs(ADMIN);
        assertThrows(BusinessException.class,
                () -> service.productDecide(DEFER_ID, decision("approved"), ADMIN, "admin"));
        verify(deferMapper, never()).updateById(any(RdmIssueDefer.class));
    }

    @Test
    @DisplayName("决定人身份取自认证主体，而非入参 currentUserId")
    void deciderIdentityFromAuthPrincipal() {
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));

        loginAs(PM); // 认证主体是 PM
        // 入参传 STRANGER，服务端应忽略之，以认证主体 PM 记录决定人
        service.productDecide(DEFER_ID, decision("approved"), STRANGER, "stranger");

        assertEquals(PM, defer.getProductDecideUserId().longValue());
    }

    /* ==================== 规则4：唯一有效承接 + 双向来源 ==================== */

    @Test
    @DisplayName("重复承接被拒：一个问题同一时刻只能有一条生效承接")
    void duplicateActiveFollowupRejected() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_DEFERRED, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectOne(any())).thenReturn(defer(RdmConstants.DEFER_PENDING_BIND));
        when(followupMapper.selectCount(any())).thenReturn(1L); // 已有生效承接

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.bindFollowUp(bindDto()));
        assertTrue(ex.getMessage().contains("生效承接"));
        verify(followupMapper, never()).insert(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("承接需求必须 V3 + 已准入 + 同项目")
    void followupMustBeV3AdmittedSameProject() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_DEFERRED, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectOne(any())).thenReturn(defer(RdmConstants.DEFER_PENDING_BIND));
        when(followupMapper.selectCount(any())).thenReturn(0L);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));

        // 非 V3
        when(requirementMapper.selectById(FOLLOWUP_REQ_ID)).thenReturn(req(FOLLOWUP_REQ_ID, 2, "developing", PROJECT_ID, PM));
        assertThrows(BusinessException.class, () -> service.bindFollowUp(bindDto()));

        // 未准入（草稿）
        when(requirementMapper.selectById(FOLLOWUP_REQ_ID)).thenReturn(req(FOLLOWUP_REQ_ID, 3, RdmConstants.STATUS_DRAFT, PROJECT_ID, PM));
        assertThrows(BusinessException.class, () -> service.bindFollowUp(bindDto()));

        // 不同项目
        when(requirementMapper.selectById(FOLLOWUP_REQ_ID)).thenReturn(req(FOLLOWUP_REQ_ID, 3, "developing", 999L, PM));
        assertThrows(BusinessException.class, () -> service.bindFollowUp(bindDto()));

        verify(followupMapper, never()).insert(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("发起人对承接需求须有交付写权限")
    void followupRequiresWritePermission() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_DEFERRED, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectOne(any())).thenReturn(defer(RdmConstants.DEFER_PENDING_BIND));
        when(followupMapper.selectCount(any())).thenReturn(0L);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(requirementMapper.selectById(FOLLOWUP_REQ_ID)).thenReturn(req(FOLLOWUP_REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(accessGuard.requireDeliveryWriter(FOLLOWUP_REQ_ID, "建立問題承接"))
                .thenThrow(new BusinessException("無交付寫權限"));

        assertThrows(BusinessException.class, () -> service.bindFollowUp(bindDto()));
        verify(followupMapper, never()).insert(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("承接成功建立双向来源：问题侧记承接、承接需求侧记 parentReqId（非结构父）")
    void bindCreatesBidirectionalSource() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_DEFERRED, "test");
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_BIND);
        RdmRequirement followUpReq = req(FOLLOWUP_REQ_ID, 3, "developing", PROJECT_ID, PM);
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(deferMapper.selectOne(any())).thenReturn(defer);
        when(followupMapper.selectCount(any())).thenReturn(0L);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(requirementMapper.selectById(FOLLOWUP_REQ_ID)).thenReturn(followUpReq);

        RdmIssueFollowup saved = service.bindFollowUp(bindDto());

        assertNotNull(saved);
        ArgumentCaptor<RdmIssueFollowup> fc = ArgumentCaptor.forClass(RdmIssueFollowup.class);
        verify(followupMapper).insert(fc.capture());
        RdmIssueFollowup inserted = fc.getValue();
        assertEquals(ISSUE_ID, inserted.getIssueId().longValue());
        assertEquals(REQ_ID, inserted.getSourceReqId().longValue());
        assertEquals(ITEM_ID, inserted.getSourceDeliveryItemId().longValue());
        assertEquals(FOLLOWUP_REQ_ID, inserted.getFollowUpReqId().longValue());
        assertEquals(RdmConstants.FOLLOWUP_ACTIVE, inserted.getActive().intValue());

        // 延期单转生效
        assertEquals(RdmConstants.DEFER_EFFECTIVE, defer.getStatus());

        // 双向来源：承接需求侧写 parentReqId 来源，绝不写结构父 structureParentReqId
        verify(requirementMapper).updateById(followUpReq);
        assertEquals(REQ_ID, followUpReq.getParentReqId().longValue());
        assertNull(followUpReq.getStructureParentReqId());
    }

    /* ==================== 规则5：按证据关闭问题 ==================== */

    @Test
    @DisplayName("证据齐全方可关闭：写入 RdmIssueResolution，问题转 resolved")
    void resolveWithFullEvidenceCloses() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(testRoundMapper.selectById(ROUND_ID)).thenReturn(round(ROUND_ID, true));
        when(acceptanceRecordMapper.selectById(PROD_ACC))
                .thenReturn(acceptance(PROD_ACC, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, RdmConstants.ACCEPT_PASS));
        when(followupMapper.selectById(FOLLOWUP_ID)).thenReturn(activeFollowup());

        RdmIssueResolution resolution = service.resolveIssue(ISSUE_ID, resolveDto());

        assertNotNull(resolution);
        assertEquals(RdmConstants.ISSUE_RESOLVED, issue.getStatus());
        ArgumentCaptor<RdmIssueResolution> rc = ArgumentCaptor.forClass(RdmIssueResolution.class);
        verify(resolutionMapper).insert(rc.capture());
        RdmIssueResolution r = rc.getValue();
        assertEquals(ISSUE_ID, r.getIssueId().longValue());
        assertEquals(FOLLOWUP_ID, r.getFollowupId().longValue());
        assertEquals(ITEM_ID, r.getDeliveryItemId().longValue());
        assertEquals(ROUND_ID, r.getTestRoundId().longValue());
        assertEquals(PROD_ACC, r.getProductAcceptanceId().longValue());
        assertEquals(OWNER, r.getSignerUserId().longValue());
        assertNotNull(r.getRequestId());
    }

    @Test
    @DisplayName("无修复证据不得关闭")
    void resolveRejectsWithoutEvidence() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);

        RdmIssueDTO.Resolve dto = resolveDto();
        dto.setRepairEvidenceJson(null); // 缺修复证据

        assertThrows(BusinessException.class, () -> service.resolveIssue(ISSUE_ID, dto));
        verify(resolutionMapper, never()).insert(any(RdmIssueResolution.class));
        assertEquals(RdmConstants.ISSUE_OPEN, issue.getStatus());
    }

    @Test
    @DisplayName("复测轮次未冻结（无执行事实）不得作为关闭证据")
    void resolveRejectsUnfrozenRound() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(testRoundMapper.selectById(ROUND_ID)).thenReturn(round(ROUND_ID, false)); // 未冻结

        assertThrows(BusinessException.class, () -> service.resolveIssue(ISSUE_ID, resolveDto()));
        verify(resolutionMapper, never()).insert(any(RdmIssueResolution.class));
    }

    @Test
    @DisplayName("涉业务问题关闭必须关联业务验收")
    void resolveBizIssueRequiresBizAcceptance() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_OPEN, "test"); // 严重→需业务
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(testRoundMapper.selectById(ROUND_ID)).thenReturn(round(ROUND_ID, true));
        when(acceptanceRecordMapper.selectById(PROD_ACC))
                .thenReturn(acceptance(PROD_ACC, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, RdmConstants.ACCEPT_PASS));

        RdmIssueDTO.Resolve dto = resolveDto();
        dto.setBusinessAcceptanceId(null); // 缺业务验收

        BusinessException ex = assertThrows(BusinessException.class, () -> service.resolveIssue(ISSUE_ID, dto));
        assertTrue(ex.getMessage().contains("業務驗收"));
        verify(resolutionMapper, never()).insert(any(RdmIssueResolution.class));
    }

    @Test
    @DisplayName("延期 ≠ 解决：获批延期只解除门禁阻断，问题仍是 deferred 而非 resolved")
    void deferIsNotResolve() {
        RdmIssue issue = issue(RdmConstants.SEV_MAJOR, RdmConstants.ISSUE_DEFERRED, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(issueMapper.selectList(any())).thenReturn(List.of(issue));
        when(deferMapper.selectCount(any())).thenReturn(1L); // 有获批延期

        // 门禁不阻断（延期已批），但问题并未解决
        assertFalse(service.hasBlockingOpenIssue(ITEM_ID));
        assertEquals(RdmConstants.ISSUE_DEFERRED, issue.getStatus());
        assertFalse(RdmConstants.ISSUE_CLOSED_STATUSES.contains(issue.getStatus()));
        verify(resolutionMapper, never()).insert(any(RdmIssueResolution.class));
    }

    /* ==================== 规则6：cancel/merge/reassign 保留承接与历史 + 逾期升级 ==================== */

    @Test
    @DisplayName("改派保留承接：同步承接责任人，不失效、不删除承接")
    void reassignPreservesFollowup() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssueFollowup followup = activeFollowup();
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(followupMapper.selectOne(any())).thenReturn(followup);

        RdmIssueDTO.IssueAction dto = actionDto("负责人变更");
        dto.setNewOwnerUserId(NEW_OWNER);
        dto.setNewOwnerUserName("newOwner");
        service.reassignIssue(ISSUE_ID, dto);

        assertEquals(NEW_OWNER, issue.getOwnerUserId().longValue());
        ArgumentCaptor<RdmIssueFollowup> fc = ArgumentCaptor.forClass(RdmIssueFollowup.class);
        verify(followupMapper).updateById(fc.capture());
        assertEquals(NEW_OWNER, fc.getValue().getOwnerUserId().longValue());
        assertEquals(RdmConstants.FOLLOWUP_ACTIVE, fc.getValue().getActive().intValue()); // 承接仍生效
        verify(followupMapper, never()).deleteById(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("合并保留历史：源问题转 merged 并记目标，承接不被触碰")
    void mergePreservesHistory() {
        loginAs(OWNER);
        RdmIssue source = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        RdmIssue target = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        target.setId(TARGET_ISSUE_ID);
        target.setIssueNo("WT-1002");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(source);
        when(issueMapper.selectById(TARGET_ISSUE_ID)).thenReturn(target);

        RdmIssueDTO.IssueAction dto = actionDto("重复问题合并");
        dto.setTargetIssueId(TARGET_ISSUE_ID);
        service.mergeIssue(ISSUE_ID, dto);

        assertEquals(RdmConstants.ISSUE_MERGED, source.getStatus());
        assertTrue(source.getImpact().contains("WT-1002"));
        assertTrue(source.getImpact().contains("id=" + TARGET_ISSUE_ID));
        verify(followupMapper, never()).updateById(any(RdmIssueFollowup.class));
        verify(followupMapper, never()).deleteById(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("取消置终态并保留承接与历史")
    void cancelSetsTerminalState() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_MINOR, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);

        service.cancelIssue(ISSUE_ID, actionDto("无效问题"));

        assertEquals(RdmConstants.ISSUE_CANCELLED, issue.getStatus());
        assertTrue(RdmConstants.ISSUE_CLOSED_STATUSES.contains(issue.getStatus()));
        verify(followupMapper, never()).deleteById(any(RdmIssueFollowup.class));
    }

    @Test
    @DisplayName("逾期升级用真实工作日日历：请假日不算逾期，级别随真实工作日变化")
    void escalationUsesRealWorkingDays() {
        RdmIssueDefer defer = defer(RdmConstants.DEFER_PENDING_BIND);
        defer.setDueAt(MON);
        defer.setOwnerUserId(OWNER);
        defer.setEscalationLevel(0);
        when(deferMapper.selectById(DEFER_ID)).thenReturn(defer);
        // 周三请假：MON→NEXT_MON 逾期工作日由 5 降为 4，级别由 L3 降为 L2，证明用的是真实日历
        RdmWorkCalendar leave = new RdmWorkCalendar();
        leave.setUserId(OWNER);
        leave.setDay(WED);
        leave.setDayType(RdmWorkCalendar.TYPE_LEAVE);
        leave.setAvailableHours(BigDecimal.ZERO);
        when(calendarMapper.selectList(any())).thenReturn(List.of(leave));

        int level = service.evaluateDeferEscalation(DEFER_ID, NEXT_MON.atStartOfDay());

        assertEquals(2, level);
        assertEquals(2, defer.getEscalationLevel().intValue());
        assertNotNull(defer.getEscalatedAt());
        verify(deferMapper).updateById(defer);
    }

    /* ==================== 规则7：幂等（executeOnce 派生天然键） ==================== */

    @Test
    @DisplayName("写操作经 executeOnce，键由服务端派生（bizType/resourceKey/userId/clientRequestId）")
    void writesGoThroughExecuteOnceWithDerivedKey() {
        loginAs(OWNER);
        RdmIssue issue = issue(RdmConstants.SEV_CRITICAL, RdmConstants.ISSUE_OPEN, "test");
        when(issueMapper.selectById(ISSUE_ID)).thenReturn(issue);
        when(requirementMapper.selectById(REQ_ID)).thenReturn(req(REQ_ID, 3, "developing", PROJECT_ID, PM));
        when(deferMapper.selectOne(any())).thenReturn(null);

        service.applyDefer(ISSUE_ID, deferApplyDto(), OWNER, "owner");

        ArgumentCaptor<IdempotentKey> kc = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(kc.capture(), any(), any());
        IdempotentKey key = kc.getValue();
        assertEquals("rdm_issue_defer", key.getBizType());
        assertEquals("issue:" + ISSUE_ID, key.getResourceKey());
        assertEquals(OWNER, key.getUserId().longValue());
        assertTrue(key.getClientRequestId().startsWith("applyDefer:"));
        assertNotNull(key.getRequestHash());
    }

    @Test
    @DisplayName("幂等回放：executeOnce 命中缓存时不重跑业务")
    void executeOnceReplayDoesNotRerunBusiness() {
        loginAs(OWNER);
        RdmIssueDefer cached = defer(RdmConstants.DEFER_PENDING_PRODUCT);
        // 覆盖默认桩：直接返回缓存结果，不执行 supplier（用 doReturn 避免重新触发 setUp 的 thenAnswer）
        doReturn(cached).when(idempotentService).executeOnce(any(), any(), any());

        RdmIssueDefer result = service.applyDefer(ISSUE_ID, deferApplyDto(), OWNER, "owner");

        assertEquals(cached, result);
        verify(deferMapper, never()).insert(any(RdmIssueDefer.class));
        verify(issueMapper, never()).selectById(any());
    }
}
