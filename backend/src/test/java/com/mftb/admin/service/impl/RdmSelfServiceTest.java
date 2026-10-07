package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.dto.RdmRequirementCreateDTO;
import com.mftb.admin.dto.RdmRequirementVO;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 提出人自助动作测试（阶段 2A）。
 * <p>锁死三件事：
 * <ol>
 *   <li>提交/重提/撤回只能由提出人本人发起，且不需要 rdm-requirement:edit；</li>
 *   <li>进入「待审批」时必须有本轮准入单，草稿提交不能只改状态；</li>
 *   <li>驳回后重提必须换新单号，沿用已终态的旧单等于本轮没有待办。</li>
 * </ol>
 */
class RdmSelfServiceTest {

    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private OaRequestService oaRequestService;
    private RdmConfigService configService;
    private OperatorResolver operatorResolver;
    private RdmIntakePolicyService policyService;
    private RdmIntakeRoundService roundService;
    private BizSeqService bizSeqService;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        oaRequestService = mock(OaRequestService.class);
        configService = mock(RdmConfigService.class);
        operatorResolver = mock(OperatorResolver.class);
        PermissionService permissionService = mock(PermissionService.class);
        RdmAccessGuard accessGuard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper);
        policyService = mock(RdmIntakePolicyService.class);
        roundService = mock(RdmIntakeRoundService.class);
        bizSeqService = mock(BizSeqService.class);

        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class), mock(RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class), mock(SysDepartmentMapper.class),
                bizSeqService, operatorResolver,
                configService, mock(RdmNotifyService.class),
                oaRequestService, mock(RdmIntakeCallbackService.class),
                permissionService, mock(JdbcTemplate.class), accessGuard, policyService, roundService,
                mock(com.mftb.admin.service.RdmReleaseService.class));

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

    @Test
    @DisplayName("草稿由提出人提交：进入待审批并发起本轮准入单")
    void draftSubmitCreatesIntakeFlow() {
        RdmRequirement draft = requirement(RdmConstants.STATUS_DRAFT, null);
        when(requirementMapper.selectById(1L)).thenReturn(draft);
        when(configService.findTransition(RdmConstants.STATUS_DRAFT, RdmConstants.ACTION_SUBMIT))
                .thenReturn(rule(RdmConstants.STATUS_DRAFT, RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.ACTION_SUBMIT));

        RdmRequirementVO vo = service.selfSubmit(1L, null);

        assertEquals(RdmConstants.STATUS_INTAKE_PENDING, vo.getStatus());
        assertEquals("OA-NEW-001", draft.getIntakeFlowNo());
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
        when(bizSeqService.next(any())).thenReturn("XQ202610060009");

        RdmRequirementVO vo = service.create(dto);

        assertEquals(RdmConstants.STATUS_INTAKE_PENDING, vo.getStatus());
        assertEquals(Integer.valueOf(1), vo.getNeedApproval());
        verify(oaRequestService, times(1)).submit(any());
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
