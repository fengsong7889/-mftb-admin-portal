package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmBatchSubmitterDTO;
import com.mftb.admin.dto.RdmRequirementAttrDTO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmStatusLog;
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
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryItemService;
import com.mftb.admin.service.RdmFlowVersionGuard;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.service.RdmIntakeRoundService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmPrdTaskService;
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 需求屬性欄變更與批量變更提出人測試。
 * <p>釘住四條口徑：
 * <ol>
 *   <li>提出人是權屬字段，只有分配權/全量權可改，普通參與人不能改；</li>
 *   <li>終態（已上線/已驗收/已關閉）不允許在屬性欄改，必須先 reopen；</li>
 *   <li>改提出人必須同步 SUBMITTER 角色行，否則 activeRoles 與主表口徑分裂；</li>
 *   <li>批量變更逐條寫主表 + 角色 + 流水，返回實際變更條數。</li>
 * </ol>
 */
class RdmRequirementAttrTest {

    private OperatorResolver operatorResolver;
    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private RdmStatusLogMapper statusLogMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private JdbcTemplate jdbcTemplate;
    private RdmConfigService configService;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        statusLogMapper = mock(RdmStatusLogMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        configService = mock(RdmConfigService.class);
        when(configService.stageMap()).thenReturn(Map.of());
        when(roleMapper.selectList(any())).thenReturn(List.of());

        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, statusLogMapper,
                mock(RdmCommentMapper.class),
                mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class),
                mock(RdmAcceptanceCaseMapper.class),
                userMapper,
                mock(SysDepartmentMapper.class), mock(BizSeqService.class),
                operatorResolver, configService,
                mock(RdmNotifyService.class), mock(OaRequestService.class),
                mock(RdmIntakeCallbackService.class),
                mock(PermissionService.class), jdbcTemplate, accessGuard,
                mock(com.mftb.admin.mapper.RdmWorkTaskMapper.class),
                mock(RdmIntakePolicyService.class),
                mock(RdmIntakeRoundService.class),
                mock(RdmReleaseService.class),
                mock(RdmFlowVersionGuard.class),
                mock(RdmRequirementStructureService.class),
                mock(RdmDeliveryItemService.class),
                mock(RdmAllowedActionsService.class),
                mock(RdmPrdTaskService.class));
    }

    private static SysUser user(long id, String name, String empNo) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setEmpId(empNo);
        user.setDepartmentId(13L);
        user.setDepartment("「外賣到家」事業部");
        user.setStatus(1);
        return user;
    }

    private static RdmRequirement req(String status) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610220001");
        req.setTitle("測試需求");
        req.setStatus(status);
        req.setSubmitterUserId(31L);
        req.setSubmitterName("原提出人");
        req.setSubmitterEmpNo("MF00031");
        return req;
    }

    private void stubOperator(SysUser operator) {
        when(operatorResolver.currentUser()).thenReturn(operator);
        when(operatorResolver.isAdmin(operator)).thenReturn(false);
        when(operatorResolver.operatorSignature(operator)).thenReturn(operator.getName());
    }

    @Test
    @DisplayName("终态需求不允许在属性栏修改，必须先 reopen")
    void rejectsLockedStatus() {
        SysUser operator = user(1L, "管理員", "MF00001");
        stubOperator(operator);
        when(accessGuard.canDispatch(operator)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(req(RdmConstants.STATUS_RELEASED));

        RdmRequirementAttrDTO dto = new RdmRequirementAttrDTO();
        dto.setPriority("P1");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.changeAttributes(1L, dto));
        assertTrue(ex.getMessage().contains("不允許修改屬性"));
        verify(requirementMapper, never()).updateById(any(RdmRequirement.class));
    }

    @Test
    @DisplayName("普通参与人不能改提出人（没有分配权/全量权）")
    void rejectsSubmitterChangeWithoutDispatch() {
        SysUser operator = user(41L, "產品經理", "MF00041");
        stubOperator(operator);
        when(requirementMapper.selectById(1L)).thenReturn(req(RdmConstants.STATUS_ASSIGNED));
        when(accessGuard.activeRoles(1L, operator)).thenReturn(Set.of(RdmConstants.ROLE_PM));

        RdmRequirementAttrDTO dto = new RdmRequirementAttrDTO();
        dto.setSubmitterUserId(2L);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.changeAttributes(1L, dto));
        assertTrue(ex.getMessage().contains("只有需求分配人/管理員可以變更提出人"));
        verify(requirementMapper, never()).updateById((RdmRequirement) any());
    }

    @Test
    @DisplayName("管理员改提出人：主表快照、SUBMITTER 角色行、状态流水同时落库")
    void changesSubmitterAndSyncsRole() {
        SysUser operator = user(1L, "管理員", "MF00001");
        SysUser next = user(2L, "冯松", "MF00002");
        stubOperator(operator);
        when(accessGuard.canDispatch(operator)).thenReturn(true);
        RdmRequirement target = req(RdmConstants.STATUS_ASSIGNED);
        when(requirementMapper.selectById(1L)).thenReturn(target);
        when(userMapper.selectById(2L)).thenReturn(next);
        when(jdbcTemplate.queryForList(contains("FROM rdm_requirement_role"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbcTemplate.update(contains("is_active = 0"), any(Object[].class))).thenReturn(1);

        RdmRequirementAttrDTO dto = new RdmRequirementAttrDTO();
        dto.setSubmitterUserId(2L);
        dto.setRemark("存量導入歸屬更正");

        service.changeAttributes(1L, dto);

        assertEquals(2L, target.getSubmitterUserId());
        assertEquals("MF00002", target.getSubmitterEmpNo());
        assertEquals("冯松", target.getSubmitterName());
        assertEquals(13L, target.getSubmitDeptId());
        assertEquals("「外賣到家」事業部", target.getSubmitDeptName());
        verify(requirementMapper).updateById(target);
        verify(roleMapper).insert((RdmRequirementRole) any());
        verify(statusLogMapper).insert((RdmStatusLog) any());
    }

    @Test
    @DisplayName("批量变更提出人：主表、角色、流水逐条写，返回实际变更条数")
    void batchChangeSubmitter() {
        SysUser operator = user(1L, "管理員", "MF00001");
        SysUser next = user(2L, "冯松", "MF00002");
        stubOperator(operator);
        when(accessGuard.canDispatch(operator)).thenReturn(true);
        RdmRequirement first = req(RdmConstants.STATUS_EVALUATING);
        RdmRequirement second = req(RdmConstants.STATUS_DEVELOPING);
        second.setId(2L);
        second.setReqNo("XQ202610220002");
        when(requirementMapper.selectById(1L)).thenReturn(first);
        when(requirementMapper.selectById(2L)).thenReturn(second);
        when(userMapper.selectById(2L)).thenReturn(next);
        when(jdbcTemplate.queryForList(contains("FROM rdm_requirement_role"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbcTemplate.update(contains("UPDATE rdm_requirement SET submitter_user_id"),
                any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.update(contains("is_active = 0"), any(Object[].class))).thenReturn(1);

        RdmBatchSubmitterDTO dto = new RdmBatchSubmitterDTO();
        dto.setIds(List.of(1L, 1L, 2L));
        dto.setSubmitterUserId(2L);
        dto.setRemark("導入批次歸屬糾正");

        int changed = service.batchChangeSubmitter(dto);

        // 兩條不同需求都改到新人；重複 id 去重不會重複寫
        assertEquals(2, changed);
        verify(jdbcTemplate, org.mockito.Mockito.times(2))
                .update(contains("UPDATE rdm_requirement SET submitter_user_id"), any(Object[].class));
        verify(roleMapper, org.mockito.Mockito.times(2)).insert((RdmRequirementRole) any());
        verify(statusLogMapper, org.mockito.Mockito.times(2)).insert((RdmStatusLog) any());
    }
}
