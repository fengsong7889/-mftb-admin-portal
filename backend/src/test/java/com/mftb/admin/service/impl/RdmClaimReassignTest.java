package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.RdmRequirement;
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

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 认领与改派测试（阶段 2C）。
 * <p>锁死三件事：
 * <ol>
 *   <li>认领是原子抢单：条件更新拿不到行就必须失败，不能覆盖别人的认领；</li>
 *   <li>认领人与改派目标都必须有受理资格（在职 + rdm-requirement:edit）；</li>
 *   <li>改派只停用旧受理人的操作资格，不删他的历史参与记录。</li>
 * </ol>
 */
class RdmClaimReassignTest {

    private JdbcTemplate jdbcTemplate;
    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private SysUserMapper userMapper;
    private PermissionService permissionService;
    private OperatorResolver operatorResolver;
    private RdmNotifyService notifyService;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        userMapper = mock(SysUserMapper.class);
        permissionService = mock(PermissionService.class);
        operatorResolver = mock(OperatorResolver.class);
        notifyService = mock(RdmNotifyService.class);
        RdmConfigService configService = mock(RdmConfigService.class);
        RdmAccessGuard accessGuard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper);

        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class), mock(RdmAcceptanceCaseMapper.class),
                userMapper, mock(SysDepartmentMapper.class),
                mock(BizSeqService.class), operatorResolver,
                configService, notifyService,
                mock(OaRequestService.class), mock(RdmIntakeCallbackService.class),
                permissionService, jdbcTemplate, accessGuard,
                mock(RdmIntakePolicyService.class), mock(RdmIntakeRoundService.class),
                mock(com.mftb.admin.service.RdmReleaseService.class));

        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(operatorResolver.currentUser()).thenReturn(user(31L, "陳雅婷"));
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00031|陳雅婷");
        when(configService.stageMap()).thenReturn(Map.of());
        when(configService.statusLabelMap()).thenReturn(Map.of());
        when(roleMapper.selectOne(any())).thenReturn(null);
        when(roleMapper.selectList(any())).thenReturn(List.of());
        when(requirementMapper.selectById(1L)).thenReturn(poolRequirement());
    }

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF000" + id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }

    private static RdmRequirement poolRequirement() {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店自營活動報名後台");
        req.setReqType(RdmConstants.TYPE_NEW_MENU);
        req.setPriority("P2");
        req.setStatus(RdmConstants.STATUS_POOL);
        req.setSubmitterUserId(11L);
        req.setSubmitterName("張三");
        req.setNeedApproval(1);
        req.setRejectCount(0);
        req.setReopenCount(0);
        req.setReworkCount(0);
        req.setChangeCount(0);
        req.setProgress(0);
        req.setBlockedFlag(0);
        req.setOverdueFlag(0);
        return req;
    }

    /** 给某个用户挂上产品经理受理权 */
    private void grantPmRight(long userId) {
        SysUser target = user(userId, userId == 31L ? "陳雅婷" : "李四");
        when(userMapper.selectById(userId)).thenReturn(target);
        when(permissionService.hasPermission(target, RdmConstants.MENU_REQUIREMENT, "edit")).thenReturn(true);
    }

    @Test
    @DisplayName("无受理资格的人不能认领")
    void withoutEligibilityCannotClaim() {
        // 31 号没有 rdm-requirement:edit
        assertThrows(BusinessException.class, () -> service.claim(1L));
        verify(jdbcTemplate, never())
                .update(contains("UPDATE rdm_requirement SET status = ?"), any(Object[].class));
    }

    @Test
    @DisplayName("抢单失败（已被他人认领）必须报错而不是覆盖")
    void lostClaimIsRejected() {
        grantPmRight(31L);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.claim(1L));
        assertTrue(ex.getMessage().contains("已被他人認領"), ex.getMessage());
        verify(notifyService, never()).notifyUserIds(anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("认领成功：需求换受理人并通知提出人")
    void claimSucceeds() {
        grantPmRight(31L);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        assertDoesNotThrow(() -> service.claim(1L));

        verify(jdbcTemplate, atLeastOnce()).update(
                contains("AND (assignee_pm_user_id IS NULL OR assignee_pm_user_id = 0)"), any(Object[].class));
        verify(roleMapper, atLeastOnce()).insert(any(com.mftb.admin.entity.RdmRequirementRole.class));
        verify(notifyService, atLeastOnce()).notifyUserIds(eq(RdmConstants.EVENT_ASSIGNED), any(),
                eq(List.of(11L)), anyString(), anyString());
    }

    @Test
    @DisplayName("无分配权不能改派")
    void withoutDispatchRightCannotReassign() {
        grantPmRight(31L);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setPmUserId(41L);

        assertThrows(BusinessException.class, () -> service.reassignPm(1L, dto));
    }

    @Test
    @DisplayName("改派给同一人没有意义，直接拒绝")
    void reassignToSamePmRejected() {
        RdmRequirement assigned = poolRequirement();
        assigned.setStatus(RdmConstants.STATUS_ASSIGNED);
        assigned.setAssigneePmUserId(31L);
        assigned.setAssigneePmName("陳雅婷");
        when(requirementMapper.selectById(1L)).thenReturn(assigned);
        when(permissionService.hasPermission(any(), eq(RdmConstants.MENU_INTAKE), eq("edit"))).thenReturn(true);
        grantPmRight(31L);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setPmUserId(31L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.reassignPm(1L, dto));
        assertTrue(ex.getMessage().contains("無需改派"), ex.getMessage());
    }

    @Test
    @DisplayName("改派成功：停用旧受理人资格而非删除，并通知三方")
    void reassignKeepsHistoryAndNotifies() {
        RdmRequirement assigned = poolRequirement();
        assigned.setStatus(RdmConstants.STATUS_EVALUATING);
        assigned.setAssigneePmUserId(31L);
        assigned.setAssigneePmName("陳雅婷");
        when(requirementMapper.selectById(1L)).thenReturn(assigned);
        when(permissionService.hasPermission(any(), eq(RdmConstants.MENU_INTAKE), eq("edit"))).thenReturn(true);
        grantPmRight(41L);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setPmUserId(41L);
        dto.setRemark("該需求屬交易域");

        assertDoesNotThrow(() -> service.reassignPm(1L, dto));

        // 旧受理人角色是「置为失效」，不是删除：历史贡献必须留着
        verify(jdbcTemplate, atLeastOnce()).update(
                contains("UPDATE rdm_requirement_role SET is_active = 0"), any(Object[].class));
        verify(notifyService, atLeastOnce()).notifyUserIds(eq(RdmConstants.EVENT_ASSIGNED), any(),
                eq(List.of(31L, 41L, 11L)), anyString(), anyString());
    }
}
