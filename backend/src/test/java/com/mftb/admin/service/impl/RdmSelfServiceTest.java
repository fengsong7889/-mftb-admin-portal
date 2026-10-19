package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.dto.RdmRequirementCreateDTO;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.service.RdmIntakeRoundService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 提出人自助动作测试（阶段 2A + 拆分批次 1 延迟发号）。
 * <p>锁死五件事：
 * <ol>
 *   <li>提交/重提/撤回只能由提出人本人发起，且不需要 rdm-requirement:edit；</li>
 *   <li>进入「待审批」时必须有本轮准入单，草稿提交不能只改状态；</li>
 *   <li>驳回后重提必须换新单号，沿用已终态的旧单等于本轮没有待办；</li>
 *   <li>要不要审只由服务端策略裁决，客户端传 needApproval=false 一律无效；</li>
 *   <li>正式需求编号只在首次准入成功时生成：审批前（含草稿提交后的待审）必须为 null
 *       且发号器一次都不被调用，免审批直送则必须落 pool/assigned 并拿到号码。</li>
 * </ol>
 */
class RdmSelfServiceTest {

    private static final String EXEMPT_REQ_NO = "XQ202610160009";

    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private OaRequestService oaRequestService;
    private RdmConfigService configService;
    private OperatorResolver operatorResolver;
    private RdmIntakePolicyService policyService;
    private RdmIntakeRoundService roundService;
    private BizSeqService bizSeqService;
    private SysUserMapper userMapper;
    private PermissionService permissionService;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        oaRequestService = mock(OaRequestService.class);
        configService = mock(RdmConfigService.class);
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        userMapper = mock(SysUserMapper.class);
        RdmAccessGuard accessGuard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper,
                mock(com.mftb.admin.mapper.RdmProjectMemberMapper.class),
                mock(com.mftb.admin.mapper.RdmDeliveryItemMapper.class),
                mock(com.mftb.admin.mapper.RdmTestBatchMapper.class),
                mock(com.mftb.admin.mapper.RdmReleaseBatchMapper.class));
        policyService = mock(RdmIntakePolicyService.class);
        roundService = mock(RdmIntakeRoundService.class);
        bizSeqService = mock(BizSeqService.class);

        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class), mock(RdmAcceptanceCaseMapper.class),
                userMapper, mock(SysDepartmentMapper.class),
                bizSeqService, operatorResolver,
                configService, mock(RdmNotifyService.class),
                oaRequestService, mock(RdmIntakeCallbackService.class),
                permissionService, mock(JdbcTemplate.class), accessGuard,
                mock(com.mftb.admin.mapper.RdmWorkTaskMapper.class),
                policyService, roundService,
                mock(com.mftb.admin.service.RdmReleaseService.class),
                mock(com.mftb.admin.service.RdmFlowVersionGuard.class),
                mock(com.mftb.admin.service.RdmRequirementStructureService.class),
                mock(com.mftb.admin.service.RdmDeliveryItemService.class),
                mock(com.mftb.admin.service.RdmAllowedActionsService.class));

        // 默认裁决：需审批、走上级主管；不预置时 service 会拿到 null 裁决并NPE，测试要的是真实分支
        when(policyService.decide(any(), any(), any())).thenReturn(approveDecision());

        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(operatorResolver.currentUser()).thenReturn(user(11L));
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00011|張三");
        when(configService.stageMap()).thenReturn(Map.of());
        when(configService.statusLabelMap()).thenReturn(Map.of());
        // 提出人在角色表里有行（提交时写入），有效角色集合必须包含 SUBMITTER
        when(roleMapper.selectList(any())).thenReturn(List.of(role(11L, RdmConstants.ROLE_SUBMITTER)));
        when(roleMapper.selectCount(any())).thenReturn(1L);
        when(oaRequestService.submit(any())).thenReturn("OA-NEW-001");
        // 只有准入完成点才会取号；断言「未调用」与「调用一次」均依赖这条桩
        when(bizSeqService.next(BizSeqService.RULE_RDM_REQUIREMENT)).thenReturn(EXEMPT_REQ_NO);
    }

    private static SysUser user(long id) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF000" + id);
        u.setName("員工" + id);
        return u;
    }

    private static RdmRequirementRole role(long userId, String roleCode) {
        RdmRequirementRole r = new RdmRequirementRole();
        r.setReqId(1L);
        r.setUserId(userId);
        r.setRoleCode(roleCode);
        r.setIsActive(1);
        return r;
    }

    private static RdmIntakeVO.Decision approveDecision() {
        RdmIntakeVO.Decision d = new RdmIntakeVO.Decision();
        d.setNeedApproval(true);
        d.setMode(RdmIntakePolicyService.MODE_APPROVE);
        d.setPolicyId(7L);
        d.setPolicyName("默准入策略");
        d.setPolicyVersion("v1");
        d.setApprovalNodes(List.of("直屬主管"));
        d.setExplain(List.of("命中策略「默准入策略」（優先級 5，版本 v1）"));
        return d;
    }

    /** 服务端免审批裁决：与真实 decide 一样由 mode=EXEMPT 推导 needApproval=false */
    private static RdmIntakeVO.Decision exemptDecision() {
        RdmIntakeVO.Decision d = new RdmIntakeVO.Decision();
        d.setNeedApproval(false);
        d.setMode(RdmIntakePolicyService.MODE_EXEMPT);
        d.setPolicyId(9L);
        d.setPolicyName("小需求免审策略");
        d.setPolicyVersion("v2");
        d.setExplain(List.of("命中策略「小需求免审策略」（版本 v2）：免准入审批"));
        return d;
    }

    private static RdmRequirement requirement(String status, String flowNo) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("推薦報表支持自定義時間區間導出");
        req.setReqType(RdmConstants.TYPE_OPTIMIZE);
        req.setStatus(status);
        req.setSubmitterUserId(11L);
        req.setSubmitterName("張三");
        req.setAcceptorUserId(11L);
        req.setNeedApproval(1);
        req.setIntakeFlowNo(flowNo);
        req.setRejectCount(0);
        req.setReopenCount(0);
        req.setReworkCount(0);
        req.setChangeCount(0);
        req.setProgress(0);
        req.setBlockedFlag(0);
        req.setOverdueFlag(0);
        return req;
    }

    /** 按状态机种子口径给一条可用流转规则 */
    private static RdmConfigVO.Transition rule(String from, String to, String actionCode) {
        RdmConfigVO.Transition t = new RdmConfigVO.Transition();
        t.setId(9L);
        t.setFromStatus(from);
        t.setToStatus(to);
        t.setActionCode(actionCode);
        t.setActionName("提交需求");
        t.setAllowedRoles(List.of(RdmConstants.ROLE_SUBMITTER));
        t.setRequiredFields(List.of());
        t.setEnabled(true);
        return t;
    }

    /**
     * 免审批直送的配置落点（rdm_transition 真值）。
     * <p>现在免审路径以配置为落点，不预置就会 fail-closed 拒提交（那才是另一条用例要的行为）。
     */
    private void stubExemptPoolRule() {
        when(configService.findTransition(RdmConstants.STATUS_DRAFT, RdmConstants.ACTION_SUBMIT_POOL))
                .thenReturn(rule(RdmConstants.STATUS_DRAFT, RdmConstants.STATUS_POOL, RdmConstants.ACTION_SUBMIT_POOL));
        when(configService.findTransition(RdmConstants.STATUS_INTAKE_REJECTED, RdmConstants.ACTION_RESUBMIT_POOL))
                .thenReturn(rule(RdmConstants.STATUS_INTAKE_REJECTED, RdmConstants.STATUS_POOL,
                        RdmConstants.ACTION_RESUBMIT_POOL));
    }

    @Test
    @DisplayName("草稿由提出人提交：进入待审批并发起本轮准入单")
    void draftSubmitCreatesIntakeFlow() {
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        // 新延迟发号口径下的草稿：没有正式需求编号
        draft.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(draft);
        when(configService.findTransition(RdmConstants.STATUS_DRAFT, RdmConstants.ACTION_SUBMIT))
                .thenReturn(rule(RdmConstants.STATUS_DRAFT, RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_SUBMIT));

        RdmRequirementVO vo = service.selfSubmit(1L, null);

        assertEquals(RdmConstants.STATUS_INTAKE_PENDING, vo.getStatus());
        assertEquals("OA-NEW-001", draft.getIntakeFlowNo());
        // 审批前不得有正式需求编号，也不得消费发号流水（不只是界面上藏起来）
        assertNull(draft.getReqNo(), "待审批阶段 req_no 必须为 NULL");
        verify(bizSeqService, never()).next(anyString());
        verify(oaRequestService, times(1)).submit(any());
    }

    @Test
    @DisplayName("驳回后重提：清掉终态旧单号并发起新的一轮")
    void resubmitStartsNewFlow() {
        RdmRequirement rejected = requirement(RdmConstants.STATUS_INTAKE_REJECTED, "OA-OLD-900");
        when(requirementMapper.selectById(1L)).thenReturn(rejected);
        when(configService.findTransition(RdmConstants.STATUS_INTAKE_REJECTED, RdmConstants.ACTION_RESUBMIT))
                .thenReturn(rule(RdmConstants.STATUS_INTAKE_REJECTED, RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_RESUBMIT));

        service.selfSubmit(1L, null);

        assertNotEquals("OA-OLD-900", rejected.getIntakeFlowNo());
        assertEquals("OA-NEW-001", rejected.getIntakeFlowNo());
        verify(oaRequestService, times(1)).submit(any());
    }

    @Test
    @DisplayName("非提出人不能自助提交别人的需求")
    void strangerCannotSubmitOthers() {
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        draft.setSubmitterUserId(12L);
        when(requirementMapper.selectById(1L)).thenReturn(draft);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.selfSubmit(1L, null));
        assertTrue(ex.getMessage().contains("只有需求提出人可以提交"), ex.getMessage());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("已在流转中的需求不能被提出人重复提交")
    void inFlightRequirementCannotBeSubmitted() {
        RdmRequirement pending = requirement(RdmConstants.STATUS_INTAKE_PENDING, "OA-NEW-001");
        when(requirementMapper.selectById(1L)).thenReturn(pending);

        assertThrows(BusinessException.class, () -> service.selfSubmit(1L, null));
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("提出人可撤回自己的待审批需求（回归：以前传 null 角色被二次拒绝）")
    void submitterCanWithdraw() {
        RdmRequirement pending = requirement(RdmConstants.STATUS_INTAKE_PENDING, "OA-NEW-001");
        when(requirementMapper.selectById(1L)).thenReturn(pending);
        when(configService.findTransition(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_WITHDRAW))
                .thenReturn(rule(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_DRAFT, RdmConstants.ACTION_WITHDRAW));

        service.withdraw(1L);

        assertEquals(RdmConstants.STATUS_DRAFT, pending.getStatus());
        // 撤回必须同时收口 OA 侧，否则审批人手上还挂着一张已无效的待办
        verify(oaRequestService, times(1)).cancel("OA-NEW-001");
        verify(roundService, times(1)).withdrawRound(eq(1L), eq("OA-NEW-001"), any());
    }

    @Test
    @DisplayName("客户端传 needApproval=false 也不能免审：准入裁决只认服务端策略")
    void createIgnoresClientNeedApproval() {
        RdmRequirementCreateDTO dto = new RdmRequirementCreateDTO();
        dto.setTitle("門店自營活動報名後台");
        dto.setReqType(RdmConstants.TYPE_NEW_MENU);
        dto.setDescription("現有多個入口，活動規則分散，業務無法統一配置");
        // 故意传 false：这是阶段 2A 之前的绕过入口，2B 后必须被服务端结论覆盖
        dto.setNeedApproval(false);

        RdmRequirementVO vo = service.create(dto);

        assertEquals(RdmConstants.STATUS_INTAKE_PENDING, vo.getStatus());
        assertEquals(Integer.valueOf(1), vo.getNeedApproval());
        // 延迟发号：被服务端判为需审批的提交，req_no 必须仍为 NULL 且发号器未被调用
        assertNull(vo.getReqNo(), "审批中的需求不能有正式编号");
        verify(bizSeqService, never()).next(anyString());
        verify(oaRequestService, times(1)).submit(any());
    }

    @Test
    @DisplayName("直接提交命中免审批：直送需求池，延迟发号 v2 不立即生成编号")
    void createExemptLandsPoolAndAllocatesNumber() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        stubExemptPoolRule();
        RdmRequirementCreateDTO dto = new RdmRequirementCreateDTO();
        dto.setTitle("後台列表新增導出按鈕");
        dto.setReqType(RdmConstants.TYPE_OPTIMIZE);
        dto.setDescription("现有列表无法导出");

        RdmRequirementVO vo = service.create(dto);

        assertEquals(RdmConstants.STATUS_POOL, vo.getStatus(), "免审批不得停在待审批");
        assertEquals(Integer.valueOf(0), vo.getNeedApproval());
        assertNull(vo.getReqNo(), "延迟发号 v2：免审批提交不立即生成编号，认领时才发号");
        verify(bizSeqService, never()).next(BizSeqService.RULE_RDM_REQUIREMENT);
        // 免审批不生成 XQSP 审批单、不创建审批待办
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("直接提交免审批且已指定有效产品：直送受理，延迟发号 v2 不立即生成编号")
    void createExemptWithValidIntentPmLandsAssigned() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        stubExemptPoolRule();
        SysUser pm = user(31L);
        pm.setStatus(1);
        when(userMapper.selectById(31L)).thenReturn(pm);
        when(permissionService.hasPermission(pm, RdmConstants.MENU_REQUIREMENT, "edit")).thenReturn(true);

        RdmRequirementCreateDTO dto = new RdmRequirementCreateDTO();
        dto.setTitle("商家後台支持批量上架");
        dto.setReqType(RdmConstants.TYPE_NEW_FEATURE);
        dto.setDescription("逐条上架太慢");
        dto.setPmUserId(31L);

        RdmRequirementVO vo = service.create(dto);

        assertEquals(RdmConstants.STATUS_ASSIGNED, vo.getStatus());
        assertNull(vo.getReqNo(), "延迟发号 v2：免审批直送受理不立即生成编号");
        assertEquals("員工31", vo.getPmName());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("草稿提交命中免审批：直送落点，延迟发号 v2 不立即生成编号")
    void draftSubmitExemptLandsAdmittedAndAllocatesNumber() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        stubExemptPoolRule();
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        draft.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(draft);

        RdmRequirementVO vo = service.selfSubmit(1L, null);

        assertEquals(RdmConstants.STATUS_POOL, vo.getStatus(),
                "本轮不会发起 OA 准入单，停在 intake_pending 就是永久卡死");
        assertNull(vo.getReqNo(), "延迟发号 v2：免审批提交不立即生成编号，认领时才发号");
        verify(oaRequestService, never()).submit(any());
        verify(bizSeqService, never()).next(BizSeqService.RULE_RDM_REQUIREMENT);
    }

    @Test
    @DisplayName("驳回后重提改判免审批：走 resubmit_pool 配置落点，延迟发号 v2 不立即生成编号")
    void resubmitExemptAllocatesNumberOnce() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        stubExemptPoolRule();
        RdmRequirement rejected = requirement(RdmConstants.STATUS_INTAKE_REJECTED, "OA-OLD-900");
        rejected.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(rejected);

        service.selfSubmit(1L, null);

        assertEquals(RdmConstants.STATUS_POOL, rejected.getStatus());
        assertNull(rejected.getReqNo(), "延迟发号 v2：免审批重提不立即生成编号");
        // 免审批的新轮次不再受理审批单，也不能沿用已终态的旧单号
        assertNull(rejected.getIntakeFlowNo());
        verify(oaRequestService, never()).submit(any());
        verify(bizSeqService, never()).next(BizSeqService.RULE_RDM_REQUIREMENT);
    }

    @Test
    @DisplayName("免审批但意向产品已失效：保留免审结论，落需求池等技术负责人分配")
    void exemptWithStaleIntentPmFallsBackToPool() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        stubExemptPoolRule();
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        draft.setReqNo(null);
        draft.setIntentPmUserId(31L);
        draft.setIntentPmName("陳雅婷");
        SysUser retired = user(31L);
        retired.setStatus(0);
        when(requirementMapper.selectById(1L)).thenReturn(draft);
        when(userMapper.selectById(31L)).thenReturn(retired);

        RdmRequirementVO vo = service.selfSubmit(1L, null);

        assertEquals(RdmConstants.STATUS_POOL, vo.getStatus(), "不能把需求交给已停用的人");
        assertNull(vo.getReqNo(), "延迟发号 v2：意向失效不影响准入，但编号推迟到认领时生成");
        assertNotEquals("員工31", vo.getPmName());
    }

    @Test
    @DisplayName("无准入单时「審批通過」回退状态机直改：延迟发号 v2 不立即生成编号")
    void intakeApprovalWithoutFlowAllocatesNumber() {
        RdmRequirement pending = requirement(RdmConstants.STATUS_INTAKE_PENDING, null);
        pending.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(pending);
        // 回退分支走配置状态机，当前人必须命中 APPROVER 才能推 approve_intake
        when(roleMapper.selectList(any())).thenReturn(List.of(
                role(11L, RdmConstants.ROLE_SUBMITTER), role(11L, RdmConstants.ROLE_APPROVER)));
        when(configService.findTransition(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_APPROVE_INTAKE))
                .thenReturn(rule(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_POOL,
                        RdmConstants.ACTION_APPROVE_INTAKE));
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setActionCode(RdmConstants.ACTION_APPROVE_INTAKE);

        RdmRequirementVO vo = service.transition(1L, dto);

        assertEquals(RdmConstants.STATUS_POOL, vo.getStatus());
        assertNull(pending.getReqNo(), "延迟发号 v2：无单回退不立即生成编号，认领时才发号");
        verify(bizSeqService, never()).next(BizSeqService.RULE_RDM_REQUIREMENT);
        // 根本没有准入单，不能假装代理给了 OA 引擎
        verify(oaRequestService, never()).approve(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("无准入单时「審批駁回」回退直改也不能发号（未准入不得占正式流水）")
    void intakeRejectionWithoutFlowAllocatesNoNumber() {
        RdmRequirement pending = requirement(RdmConstants.STATUS_INTAKE_PENDING, null);
        pending.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(pending);
        when(roleMapper.selectList(any())).thenReturn(List.of(
                role(11L, RdmConstants.ROLE_SUBMITTER), role(11L, RdmConstants.ROLE_APPROVER)));
        when(configService.findTransition(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_REJECT_INTAKE))
                .thenReturn(rule(RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_INTAKE_REJECTED,
                        RdmConstants.ACTION_REJECT_INTAKE));
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setActionCode(RdmConstants.ACTION_REJECT_INTAKE);
        dto.setRemark("範圍不清，先補期望結果");

        service.transition(1L, dto);

        assertEquals(RdmConstants.STATUS_INTAKE_REJECTED, pending.getStatus());
        assertNull(pending.getReqNo(), "驳回后仍属准入前，不能有正式编号");
        verify(bizSeqService, never()).next(anyString());
    }

    @Test
    @DisplayName("免审批直送配置缺失/停用：拒绝提交，不得当免审放行也不得提前吹号")
    void exemptSubmissionFailsClosedWithoutPoolTransition() {
        when(policyService.decide(any(), any(), any())).thenReturn(exemptDecision());
        // 故意不 stubExemptPoolRule：findTransition 返回 null 就是「配置被停用/改坏」
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        draft.setReqNo(null);
        when(requirementMapper.selectById(1L)).thenReturn(draft);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.selfSubmit(1L, null));

        assertTrue(ex.getMessage().contains("免審批直送配置缺失"), ex.getMessage());
        assertEquals(RdmConstants.STATUS_DRAFT, draft.getStatus(), "配置缺失时不得旁路改状态");
        assertNull(draft.getReqNo(), "被拒绝的提交不得消费正式需求流水");
        verify(bizSeqService, never()).next(anyString());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("提交与重提都登记独立轮次并写入命中策略快照")
    void submitStartsRoundWithPolicySnapshot() {
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        when(requirementMapper.selectById(1L)).thenReturn(draft);
        when(configService.findTransition(RdmConstants.STATUS_DRAFT, RdmConstants.ACTION_SUBMIT))
                .thenReturn(rule(RdmConstants.STATUS_DRAFT, RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_SUBMIT));
        when(roundService.startRound(any(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(3);

        service.selfSubmit(1L, null);

        verify(roundService, times(1)).startRound(eq(1L), any(), any(), any(), eq(11L), any(),
                eq("OA-NEW-001"), any(), any());
        assertEquals(Integer.valueOf(3), draft.getIntakeRoundNo());
        assertEquals("默准入策略", draft.getIntakePolicyName());
        assertEquals("v1", draft.getIntakePolicyVersion());
    }
}
