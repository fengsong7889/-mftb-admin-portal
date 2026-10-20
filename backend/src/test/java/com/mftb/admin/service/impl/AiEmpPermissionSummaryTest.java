package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.dto.AiEmpPermissionDTO;
import com.mftb.admin.entity.AiDeptAuthGroup;
import com.mftb.admin.entity.AiDeptAuthGroupDept;
import com.mftb.admin.entity.AiDeptAuthGroupModel;
import com.mftb.admin.entity.AiEmpPosAuthStrategy;
import com.mftb.admin.entity.AiEmpQuotaPolicy;
import com.mftb.admin.entity.AiEmpRoleAuth;
import com.mftb.admin.entity.AiEmployeeAuth;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.entity.AiQuotaOverride;
import com.mftb.admin.entity.AiRoleQuotaPolicy;
import com.mftb.admin.entity.LlmUsage;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiDeptAuthGroupDeptMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupModelMapper;
import com.mftb.admin.mapper.AiEmpPosAuthStrategyMapper;
import com.mftb.admin.mapper.AiEmpQuotaAdjustLogMapper;
import com.mftb.admin.mapper.AiEmpQuotaPolicyMapper;
import com.mftb.admin.mapper.AiEmpRoleAuthMapper;
import com.mftb.admin.mapper.AiEmployeeAuthMapper;
import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.mapper.AiQuotaOverrideMapper;
import com.mftb.admin.mapper.AiRoleQuotaPolicyMapper;
import com.mftb.admin.mapper.LlmUsageMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 员工AI权额「列表聚合」测试。
 *
 * <p>锁死两类结论：
 * <ol>
 *   <li><b>口径不变</b>：四维模型并集（部门组启用才计入、个人授权要 status=1 且 hasPermission=1）、
 *       额度用量按 prompt+completion 分日/月、lastUpdated 取四表 MAX(updated_at) 且个人授权行
 *       的操作人一律记为 system（不筛 status）——批量预加载重构后必须与旧逐员工实现逐条一致；</li>
 *   <li><b>不再随人数放大</b>：小策略表与用量表每人只读一次。旧实现按员工循环查询（13+ 次/人），
 *       在远端共享库上 25 人即 ~11.7s，逼近前端 15s 超时并触发列表被误清空的竞态。</li>
 * </ol>
 */
class AiEmpPermissionSummaryTest {

    /** 纯 Mockito 环境无 MyBatis-Plus 实体元数据，.select(Entity::field) 投影需先建 TableInfo 缓存 */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);
        TableInfoHelper.initTableInfo(assistant, AiModel.class);
        TableInfoHelper.initTableInfo(assistant, AiDeptAuthGroup.class);
        TableInfoHelper.initTableInfo(assistant, AiDeptAuthGroupDept.class);
        TableInfoHelper.initTableInfo(assistant, AiDeptAuthGroupModel.class);
        TableInfoHelper.initTableInfo(assistant, AiEmployeeAuth.class);
        TableInfoHelper.initTableInfo(assistant, AiEmpPosAuthStrategy.class);
        TableInfoHelper.initTableInfo(assistant, AiEmpRoleAuth.class);
        TableInfoHelper.initTableInfo(assistant, AiQuotaConfig.class);
        TableInfoHelper.initTableInfo(assistant, AiEmpQuotaPolicy.class);
        TableInfoHelper.initTableInfo(assistant, AiRoleQuotaPolicy.class);
        TableInfoHelper.initTableInfo(assistant, AiQuotaOverride.class);
        TableInfoHelper.initTableInfo(assistant, LlmUsage.class);
    }

    private SysUserMapper sysUserMapper;
    private AiModelMapper modelMapper;
    private AiQuotaConfigMapper quotaConfigMapper;
    private AiQuotaOverrideMapper quotaOverrideMapper;
    private AiEmpQuotaPolicyMapper empQuotaPolicyMapper;
    private AiRoleQuotaPolicyMapper roleQuotaPolicyMapper;
    private AiDeptAuthGroupMapper deptGroupMapper;
    private AiDeptAuthGroupDeptMapper deptGroupDeptMapper;
    private AiDeptAuthGroupModelMapper deptGroupModelMapper;
    private AiEmployeeAuthMapper employeeAuthMapper;
    private AiEmpPosAuthStrategyMapper empPosAuthStrategyMapper;
    private AiEmpRoleAuthMapper empRoleAuthMapper;
    private LlmUsageMapper llmUsageMapper;
    private AiEmpPermissionServiceImpl service;

    private static final Long DEPT_ID = 10L;
    private static final Long GROUP_ID = 7L;
    private static final Long MODEL_DEPT = 100L;
    private static final Long MODEL_EMP = 101L;
    private static final Long MODEL_DISABLED = 102L;

    @BeforeEach
    void setUp() {
        sysUserMapper = mock(SysUserMapper.class);
        modelMapper = mock(AiModelMapper.class);
        quotaConfigMapper = mock(AiQuotaConfigMapper.class);
        quotaOverrideMapper = mock(AiQuotaOverrideMapper.class);
        empQuotaPolicyMapper = mock(AiEmpQuotaPolicyMapper.class);
        roleQuotaPolicyMapper = mock(AiRoleQuotaPolicyMapper.class);
        deptGroupMapper = mock(AiDeptAuthGroupMapper.class);
        deptGroupDeptMapper = mock(AiDeptAuthGroupDeptMapper.class);
        deptGroupModelMapper = mock(AiDeptAuthGroupModelMapper.class);
        employeeAuthMapper = mock(AiEmployeeAuthMapper.class);
        empPosAuthStrategyMapper = mock(AiEmpPosAuthStrategyMapper.class);
        empRoleAuthMapper = mock(AiEmpRoleAuthMapper.class);
        llmUsageMapper = mock(LlmUsageMapper.class);
        service = new AiEmpPermissionServiceImpl(
                sysUserMapper, modelMapper, quotaConfigMapper, quotaOverrideMapper,
                empQuotaPolicyMapper, roleQuotaPolicyMapper, deptGroupMapper, deptGroupDeptMapper,
                deptGroupModelMapper, employeeAuthMapper, empPosAuthStrategyMapper, empRoleAuthMapper,
                llmUsageMapper, mock(AiEmpQuotaAdjustLogMapper.class));
    }

    private SysUser employee(long id, String username, String name, boolean withPosition) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setName(name);
        user.setEmpId("MF0000" + id);
        user.setDepartment("行政部");
        user.setDepartmentId(DEPT_ID);
        user.setStatus(1);
        user.setUpdatedAt(LocalDateTime.of(2026, 1, 1, 0, 0));
        if (withPosition) {
            user.setSequence("S1");
            user.setJobLevel("L1");
        }
        return user;
    }

    private AiModel model(long id, int status) {
        AiModel m = new AiModel();
        m.setId(id);
        m.setName("模型" + id);
        m.setModelKey("k" + id);
        m.setStatus(status);
        return m;
    }

    private AiEmployeeAuth empAuth(long employeeId, Long modelId, int status, int hasPermission, LocalDateTime updatedAt) {
        AiEmployeeAuth a = new AiEmployeeAuth();
        a.setEmployeeId(employeeId);
        a.setModelId(modelId);
        a.setStatus(status);
        a.setHasPermission(hasPermission);
        a.setUpdatedAt(updatedAt);
        return a;
    }

    private LlmUsage usage(String username, int prompt, int completion, LocalDateTime at) {
        LlmUsage u = new LlmUsage();
        u.setUsername(username);
        u.setPromptTokens(prompt);
        u.setCompletionTokens(completion);
        u.setCreatedAt(at);
        return u;
    }

    /** 两个员工：一个带职位序列/职级（命中职位策略），一个不带。 */
    private void stubHappyPath() {
        SysUser emp1 = employee(1L, "u1", "張三", true);
        SysUser emp2 = employee(2L, "u2", "李四", false);
        when(sysUserMapper.selectList(any())).thenReturn(List.of(emp1, emp2));
        when(modelMapper.selectList(any())).thenReturn(List.of(
                model(MODEL_DEPT, 1), model(MODEL_EMP, 1), model(MODEL_DISABLED, 0)));

        // 部门维度：部门 10 → 策略组 7（启用）→ 模型 100
        AiDeptAuthGroupDept link = new AiDeptAuthGroupDept();
        link.setDepartmentId(DEPT_ID);
        link.setGroupId(GROUP_ID);
        when(deptGroupDeptMapper.selectList(any())).thenReturn(List.of(link));
        AiDeptAuthGroup group = new AiDeptAuthGroup();
        group.setId(GROUP_ID);
        group.setStatus(1);
        group.setUpdatedAt(LocalDateTime.of(2026, 2, 1, 0, 0));
        group.setUpdatedBy("deptAdmin");
        when(deptGroupMapper.selectList(any())).thenReturn(List.of(group));
        AiDeptAuthGroupModel gm = new AiDeptAuthGroupModel();
        gm.setGroupId(GROUP_ID);
        gm.setModelId(MODEL_DEPT);
        when(deptGroupModelMapper.selectList(any())).thenReturn(List.of(gm));

        // 职位维度：(S1, L1) → 模型 100（与部门维度重复，并集后仍只算一个模型）
        AiEmpPosAuthStrategy pos = new AiEmpPosAuthStrategy();
        pos.setSequences("[\"S1\"]");
        pos.setJobLevels("[\"L1\"]");
        pos.setModelConfigs("[{\"modelId\":" + MODEL_DEPT + "}]");
        pos.setStatus(1);
        pos.setUpdatedAt(LocalDateTime.of(2026, 3, 1, 0, 0));
        pos.setUpdatedBy("posAdmin");
        when(empPosAuthStrategyMapper.selectList(any())).thenReturn(List.of(pos));

        when(empRoleAuthMapper.selectList(any())).thenReturn(List.of());

        // 个人维度：emp1 有一条有效授权(101) + 一条 status=0 的失效授权(102)
        // 失效行不计入模型数，但 lastUpdated 仍要看到它（旧实现此处不筛 status）
        when(employeeAuthMapper.selectList(any())).thenReturn(List.of(
                empAuth(1L, MODEL_EMP, 1, 1, LocalDateTime.of(2026, 10, 5, 0, 0)),
                empAuth(1L, MODEL_DISABLED, 0, 1, LocalDateTime.of(2026, 10, 9, 0, 0))));

        AiQuotaConfig config = new AiQuotaConfig();
        config.setQuotaType("employee");
        config.setTargetId(1L);
        config.setDailyQuota(1000);
        config.setMonthlyQuota(5000);
        config.setStatus(1);
        when(quotaConfigMapper.selectList(any())).thenReturn(List.of(config));

        when(empQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(roleQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(quotaOverrideMapper.selectList(any())).thenReturn(List.of());

        // 用量：emp1 当日 300、本月累计 1000（含当日）
        LocalDateTime today = LocalDate.now().atStartOfDay();
        when(llmUsageMapper.selectList(any())).thenReturn(List.of(
                usage("u1", 100, 200, today.plusHours(2)),
                usage("u1", 400, 300, today.minusDays(3))));
    }

    @Test
    @DisplayName("四维并集与额度用量口径在批量化后保持不变")
    void aggregatesFourDimensionsWithoutBehaviourChange() {
        stubHappyPath();

        List<AiEmpPermissionDTO.SummaryVO> rows = service.listSummaries(
                null, null, null, null, null);

        assertEquals(2, rows.size());
        AiEmpPermissionDTO.SummaryVO emp1 = rows.get(0);
        AiEmpPermissionDTO.SummaryVO emp2 = rows.get(1);

        // 部门(100) ∪ 职位(100) ∪ 个人(101) = 2 个启用模型；status=0 的 102 既不计入也不显示
        assertEquals(2, emp1.getModelCount());
        assertEquals(List.of(MODEL_DEPT, MODEL_EMP),
                emp1.getModels().stream().map(AiEmpPermissionDTO.ModelBrief::getModelId).toList());
        // emp2 无职位信息 → 只拿部门模型
        assertEquals(1, emp2.getModelCount());

        // 额度：日/月各一条，用量分别取当日与当月
        assertEquals(2, emp1.getQuotas().size());
        AiEmpPermissionDTO.QuotaBrief daily = emp1.getQuotas().get(0);
        AiEmpPermissionDTO.QuotaBrief monthly = emp1.getQuotas().get(1);
        assertEquals("daily", daily.getQuotaPeriod());
        assertEquals(new BigDecimal("1000"), daily.getQuotaValue());
        assertEquals(0, new BigDecimal("300").compareTo(daily.getUsedValue()));
        assertEquals("monthly", monthly.getQuotaPeriod());
        assertEquals(0, new BigDecimal("1000").compareTo(monthly.getUsedValue()));
        // 无用量记录的员工额度概览为 0，而不是 null（前端要直接渲染）
        assertEquals(0, emp2.getQuotas().size());

        // lastUpdated：个人授权行 updatedAt 最大（2026-10-09），且操作人按旧口径记为 system
        assertEquals("system", emp1.getLastUpdatedBy());
        assertEquals("2026-10-09 00:00:00", emp1.getLastUpdatedAt());
        // emp2 无职位命中，但部门策略组的 updatedAt 仍计入（旧实现这一段不筛 status），
        // 所以不会回落到员工自身的 updatedAt
        assertEquals("2026-02-01 00:00:00", emp2.getLastUpdatedAt());
        assertEquals("deptAdmin", emp2.getLastUpdatedBy());
    }

    @Test
    @DisplayName("小策略表与用量表按整批读一次，不随员工数放大")
    void loadsPolicyTablesOnceRegardlessOfEmployeeCount() {
        stubHappyPath();

        service.listSummaries(null, null, null, null, null);

        // 2 个员工下这些 mapper 各只应被调用 1 次；旧实现是 1 次/人（职位策略、角色授权、
        // 额度策略、部门关联、个人授权、用量表都会重复扫表）
        verify(empPosAuthStrategyMapper, times(1)).selectList(any());
        verify(empRoleAuthMapper, times(1)).selectList(any());
        verify(employeeAuthMapper, times(1)).selectList(any());
        verify(deptGroupDeptMapper, times(1)).selectList(any());
        verify(deptGroupMapper, times(1)).selectList(any());
        verify(deptGroupModelMapper, times(1)).selectList(any());
        verify(quotaConfigMapper, times(1)).selectList(any());
        verify(empQuotaPolicyMapper, times(1)).selectList(any());
        verify(roleQuotaPolicyMapper, times(1)).selectList(any());
        verify(quotaOverrideMapper, times(1)).selectList(any());
        verify(llmUsageMapper, times(1)).selectList(any());
        verify(modelMapper, times(1)).selectList(any());
    }

    @Test
    @DisplayName("无额度配置的员工不会因预加载改动而多出条目")
    void employeeWithoutQuotaConfigHasNoQuotaBriefs() {
        stubHappyPath();

        List<AiEmpPermissionDTO.SummaryVO> rows = service.listSummaries(
                null, null, null, null, null);

        AiEmpPermissionDTO.SummaryVO emp2 = rows.get(1);
        assertEquals(0, emp2.getQuotas().size());
        assertNull(emp2.getQuotas().stream().filter(q -> "employee".equals(q.getSource())).findFirst().orElse(null));
    }
}
