package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.SysUser;
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
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * RDM 状态流转守卫测试（角色 + 必填字段）。
 * <p>状态机的可执行性只认数据库配置，本用例锁死三条口径：
 * <ol>
 *   <li>非该环节允许角色的人不能推进（fail-closed，超管例外）；</li>
 *   <li>配置了必填字段而前端未填时必须拒绝，且提示中文字段名而非英文 key；</li>
 *   <li>技术负责人可用「持有需求池编辑权」兜底执行分配动作。</li>
 * </ol>
 */
class RdmTransitionGuardTest {

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private com.mftb.admin.mapper.RdmRequirementRoleMapper roleMapper;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        roleMapper = mock(com.mftb.admin.mapper.RdmRequirementRoleMapper.class);
        // 默认无参与人记录（避免拆箱 null），相关与否由主数据字段判定
        when(roleMapper.selectCount(any())).thenReturn(0L);
        service = new RdmRequirementServiceImpl(
                mock(RdmRequirementMapper.class), mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class), mock(com.mftb.admin.mapper.RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class),
                mock(SysDepartmentMapper.class), mock(BizSeqService.class),
                operatorResolver, mock(RdmConfigService.class),
                mock(RdmNotifyService.class), mock(OaRequestService.class),
                mock(com.mftb.admin.service.RdmIntakeCallbackService.class),
                permissionService, mock(JdbcTemplate.class));
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        return u;
    }

    private static RdmConfigVO.Transition rule(List<String> roles, List<String> requiredFields) {
        RdmConfigVO.Transition t = new RdmConfigVO.Transition();
        t.setId(1L);
        t.setFromStatus(RdmConstants.STATUS_EVALUATING);
        t.setToStatus(RDM_STATUS_ACCEPTED);
        t.setActionCode(RdmConstants.ACTION_ACCEPT);
        t.setActionName("接受需求");
        t.setAllowedRoles(roles);
        t.setRequiredFields(requiredFields);
        t.setEnabled(true);
        return t;
    }

    /** 目标状态字面量（避免测试内硬编码与常量表耦合） */
    private static final String RDM_STATUS_ACCEPTED = "accepted";

    @Test
    @DisplayName("超管不受角色限制")
    void adminBypassesRoleGuard() {
        SysUser admin = user(1L, "MF00001", "馮宋");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        assertTrue(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), admin, null));
    }

    @Test
    @DisplayName("角色命中允许列表才可推进，未命中一律拒绝")
    void roleMustBeAllowed() {
        SysUser pm = user(2L, "MF00002", "陳雅婷");
        SysUser qa = user(3L, "MF00003", "黃嘉欣");
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertTrue(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), pm, RdmConstants.ROLE_PM));
        assertFalse(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), qa, RdmConstants.ROLE_QA));
    }

    @Test
    @DisplayName("未登录或规则未配角色时拒绝（不得 fail-open）")
    void failClosedWhenContextMissing() {
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertFalse(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), null, RDM_STATUS_ACCEPTED));
        assertFalse(service.canPerform(rule(List.of(), List.of()), user(2L, "MF00002", "陳雅婷"), RdmConstants.ROLE_PM));
    }

    @Test
    @DisplayName("分配动作可按「需求池编辑权」兜底放行")
    void dispatchFallsBackToIntakeMenuPermission() {
        SysUser techLead = user(4L, "MF00004", "李海濤");
        when(operatorResolver.isAdmin(techLead)).thenReturn(false);
        when(permissionService.hasPermission(techLead, RdmConstants.MENU_INTAKE, "edit")).thenReturn(true);
        RdmConfigVO.Transition dispatch = rule(List.of(RdmConstants.ROLE_DISPATCHER), List.of("pm"));
        assertTrue(service.canPerform(dispatch, techLead, null));
    }

    @Test
    @DisplayName("必填字段缺失时拒绝，并提示中文字段名")
    void requiredFieldMustBeFilled() {
        RdmConfigVO.Transition accept = rule(List.of(RdmConstants.ROLE_PM), List.of("promisedDate"));
        RdmTransitionDTO empty = new RdmTransitionDTO();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.applyRequiredGuard(accept, empty));
        assertTrue(ex.getMessage().contains("承諾出 PRD 日期"), ex.getMessage());

        RdmTransitionDTO filled = new RdmTransitionDTO();
        filled.setPromisedDate("2026-10-15");
        assertDoesNotThrow(() -> service.applyRequiredGuard(accept, filled));
    }

    @Test
    @DisplayName("驳回理由与产品经理同为必填口径")
    void remarkAndPmAreRequired() {
        RdmConfigVO.Transition reject = rule(List.of(RdmConstants.ROLE_PM), List.of("remark"));
        RdmTransitionDTO blank = new RdmTransitionDTO();
        blank.setRemark("   ");
        assertThrows(BusinessException.class, () -> service.applyRequiredGuard(reject, blank));

        RdmConfigVO.Transition dispatch = rule(List.of(RdmConstants.ROLE_DISPATCHER), List.of("pm"));
        RdmTransitionDTO noPm = new RdmTransitionDTO();
        noPm.setPmUserId(null);
        assertThrows(BusinessException.class, () -> service.applyRequiredGuard(dispatch, noPm));

        when(permissionService.hasPermission(any(), eq(RdmConstants.MENU_INTAKE), eq("edit"))).thenReturn(true);
        RdmTransitionDTO withPm = new RdmTransitionDTO();
        withPm.setPmUserId(9L);
        assertDoesNotThrow(() -> service.applyRequiredGuard(dispatch, withPm));
    }

    /* ==================== 单条需求可见性（防猜 id 越权） ==================== */

    private static com.mftb.admin.entity.RdmRequirement requirement(long id, long submitterId, Long acceptorId) {
        com.mftb.admin.entity.RdmRequirement r = new com.mftb.admin.entity.RdmRequirement();
        r.setId(id);
        r.setReqNo("XQ20260930000" + id);
        r.setStatus(RdmConstants.STATUS_POOL);
        r.setSubmitterUserId(submitterId);
        r.setAcceptorUserId(acceptorId);
        return r;
    }

    @Test
    @DisplayName("提出人能看自己的需求详情")
    void submitterCanViewOwnRequirement() {
        SysUser me = user(11L, "MF00011", "張三") ;
        when(operatorResolver.isAdmin(me)).thenReturn(false);
        assertDoesNotThrow(() -> service.requireVisible(requirement(1L, 11L, 11L), me, "查看詳情"));
    }

    @Test
    @DisplayName("无关员工猜 id 也不能读别人的需求")
    void strangerCannotViewOtherRequirement() {
        SysUser me = user(12L, "MF00012", "李四");
        when(operatorResolver.isAdmin(me)).thenReturn(false);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.requireVisible(requirement(2L, 11L, 11L), me, "查看詳情"));
        assertTrue(ex.getMessage().contains("查看詳情"), ex.getMessage());
    }

    @Test
    @DisplayName("超管与 PMO（持有删除/导出权）可跨部门查看")
    void privilegedUsersSeeAll() {
        SysUser admin = user(13L, "MF00013", "王五");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        assertDoesNotThrow(() -> service.requireVisible(requirement(3L, 11L, 11L), admin, "查看詳情"));

        SysUser pmo = user(14L, "MF00014", "趙六");
        when(operatorResolver.isAdmin(pmo)).thenReturn(false);
        when(permissionService.hasPermission(pmo, "rdm-requirement", "export")).thenReturn(true);
        assertDoesNotThrow(() -> service.requireVisible(requirement(3L, 11L, 11L), pmo, "查看詳情"));
    }
}
