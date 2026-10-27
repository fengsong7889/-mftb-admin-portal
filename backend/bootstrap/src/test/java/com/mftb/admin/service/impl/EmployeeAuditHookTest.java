package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 人事写入口的审计钩子测试。
 * <p>单独测这一层的原因：审计表与查询接口都可以各自工作正常，但**写入口漏挂钩子**时
 * 整套审计会静默变成空表 —— 那是最坏形态（看起来有审计能力，实际一条都没有）。
 * 因此这里断言的是「调用员工服务 = 必然落审计」，而不是审计内容细节。
 */
class EmployeeAuditHookTest {

    private static final long USER_ID = 33L;

    private SysUserMapper sysUserMapper;
    private HrAuditService hrAuditService;
    private EmployeeServiceImpl service;
    private SysUser user;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);

        sysUserMapper = mock(SysUserMapper.class);
        hrAuditService = mock(HrAuditService.class);
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        // lookupRoleIdByCode('admin') 走原生 SQL：返回空列表即「库里没有超管角色行」，绑角色校验自然放行
        when(jdbcTemplate.queryForList(anyString(), any(), any(Class.class))).thenReturn(List.of());
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");

        service = new EmployeeServiceImpl(sysUserMapper, mock(SysDepartmentMapper.class),
                mock(SysPositionMapper.class), mock(SysLoginLogMapper.class),
                mock(EmpPositionRecordMapper.class), mock(HrAssignmentQuery.class),
                mock(HrMasterDataResolver.class), mock(HrEmploymentPeriodService.class), hrAuditService,
                mock(PasswordEncoder.class), jdbcTemplate, operatorResolver,
                mock(PermissionService.class), mock(BizSeqService.class));

        user = new SysUser();
        user.setId(USER_ID);
        user.setEmpId("MF00033");
        user.setUsername("MF00033");
        user.setName("李大仁");
        user.setMobile("13800001111");
        user.setEmail("old@example.com");
        user.setFunctionRoles(JsonUtils.toJson(List.of(9L)));
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user);
        when(sysUserMapper.updateById(any(SysUser.class))).thenReturn(1);
    }

    @Test
    @DisplayName("保存基本资料会落一条 PROFILE_UPDATE 审计")
    void saveBasicInfoRecordsProfileUpdate() {
        BasicInfoRequest request = new BasicInfoRequest();
        request.setMobile("13900002222");

        service.saveBasicInfo(USER_ID, request);

        ArgumentCaptor<com.mftb.admin.dto.HrAuditEntry> captor =
                ArgumentCaptor.forClass(com.mftb.admin.dto.HrAuditEntry.class);
        verify(hrAuditService).record(captor.capture());
        com.mftb.admin.dto.HrAuditEntry entry = captor.getValue();
        assertEquals(HrAuditAction.PROFILE_UPDATE, entry.getAction());
        assertEquals(USER_ID, entry.getUserId());
        // 只记真正变了的字段：mobile 改了，没传的字段不构成变更
        assertTrue(entry.getChanges().stream().anyMatch(c -> c.field().equals("mobile")),
                "未记录 mobile 变更: " + entry.getChanges());
        assertTrue(entry.getChanges().stream().noneMatch(c -> c.field().equals("name")),
                "没改的姓名不该进审计");
    }

    @Test
    @DisplayName("什么都没改时不调用审计（让服务层的「无变更不落行」规则不被噪声触达）")
    void unchangedSaveStillCallsAuditButNoFieldChange() {
        BasicInfoRequest request = new BasicInfoRequest();
        request.setMobile(user.getMobile());

        service.saveBasicInfo(USER_ID, request);

        ArgumentCaptor<com.mftb.admin.dto.HrAuditEntry> captor =
                ArgumentCaptor.forClass(com.mftb.admin.dto.HrAuditEntry.class);
        verify(hrAuditService).record(captor.capture());
        assertTrue(captor.getValue().getChanges().isEmpty(),
                "值没变就不该有变更行: " + captor.getValue().getChanges());
    }

    @Test
    @DisplayName("查看明文要留痕；只看脱敏版不留痕")
    void sensitiveViewIsTracedOnlyWhenRevealing() {
        service.getBasicInfo(USER_ID, true);
        verify(hrAuditService).record(org.mockito.ArgumentMatchers.argThat(
                entry -> HrAuditAction.SENSITIVE_VIEW.equals(entry.getAction())
                        && entry.getDetail() != null && !entry.getDetail().isBlank()));

        org.mockito.Mockito.clearInvocations(hrAuditService);
        service.getBasicInfo(USER_ID, false);
        verify(hrAuditService, never()).record(any());
    }

    @Test
    @DisplayName("调整功能角色会落 ROLE_BIND 并带前后角色集合")
    void bindRolesRecordsRoleBind() {
        service.bindRoles(USER_ID, List.of(11L, 12L));

        ArgumentCaptor<com.mftb.admin.dto.HrAuditEntry> captor =
                ArgumentCaptor.forClass(com.mftb.admin.dto.HrAuditEntry.class);
        verify(hrAuditService).record(captor.capture());
        com.mftb.admin.dto.HrAuditEntry entry = captor.getValue();
        assertEquals(HrAuditAction.ROLE_BIND, entry.getAction());
        assertEquals(1, entry.getChanges().size(), "提权动作必须有且只有一条 functionRoles 前后值");
        assertEquals("functionRoles", entry.getChanges().get(0).field());
        assertEquals(List.of(9L), entry.getChanges().get(0).before());
        assertEquals(List.of(11L, 12L), entry.getChanges().get(0).after());
    }

    @Test
    @DisplayName("冻结与解冻用不同动作码（审计要能区分「停权」和「复权」）")
    void statusChangeUsesDistinctActions() {
        user.setStatus(1);
        service.updateStatus(USER_ID, 0);
        service.updateStatus(USER_ID, 1);

        ArgumentCaptor<com.mftb.admin.dto.HrAuditEntry> captor =
                ArgumentCaptor.forClass(com.mftb.admin.dto.HrAuditEntry.class);
        verify(hrAuditService, org.mockito.Mockito.times(2)).record(captor.capture());
        List<String> actions = captor.getAllValues().stream()
                .map(com.mftb.admin.dto.HrAuditEntry::getAction).toList();
        assertEquals(List.of(HrAuditAction.ACCOUNT_DISABLE, HrAuditAction.ACCOUNT_ENABLE), actions);
        // 旧值必须是变更前那个：user.setStatus 是就地改对象，事后取会前后一样
        assertEquals(1, captor.getAllValues().get(0).getChanges().get(0).before());
        verify(sysUserMapper, never()).selectById(eq(0L));
    }
}
