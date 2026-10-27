package com.mftb.admin.service.impl;

import com.mftb.admin.dto.AiMyCenterDTO;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiDeptQuotaPolicy;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiDeptAuthGroupDeptMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupModelMapper;
import com.mftb.admin.mapper.AiDeptQuotaPolicyMapper;
import com.mftb.admin.mapper.AiEmpPosAuthStrategyMapper;
import com.mftb.admin.mapper.AiEmpQuotaPolicyMapper;
import com.mftb.admin.mapper.AiEmpRoleAuthMapper;
import com.mftb.admin.mapper.AiEmployeeAuthMapper;
import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.mapper.AiQuotaOverrideMapper;
import com.mftb.admin.mapper.AiRoleQuotaPolicyMapper;
import com.mftb.admin.mapper.LlmUsageMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * V0 §B.3：ai_dept_quota_policy 接入 AiMyCenter 维度聚合的回归测试。
 * 断言新策略参与 myQuotaUsage；per_capita 只算本人；与旧 ai_quota_config 取并集。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiMyCenterDeptPolicyTest {

    @Mock private AiQuotaConfigMapper quotaConfigMapper;
    @Mock private AiQuotaOverrideMapper quotaOverrideMapper;
    @Mock private AiEmpQuotaPolicyMapper empQuotaPolicyMapper;
    @Mock private AiRoleQuotaPolicyMapper roleQuotaPolicyMapper;
    @Mock private AiDeptQuotaPolicyMapper deptQuotaPolicyMapper;
    @Mock private LlmUsageMapper llmUsageMapper;
    @Mock private AiModelMapper modelMapper;
    @Mock private AiProviderMapper providerMapper;
    @Mock private AiDeptAuthGroupMapper deptGroupMapper;
    @Mock private AiDeptAuthGroupDeptMapper deptGroupDeptMapper;
    @Mock private AiDeptAuthGroupModelMapper deptGroupModelMapper;
    @Mock private AiEmployeeAuthMapper employeeAuthMapper;
    @Mock private SysUserMapper sysUserMapper;
    @Mock private AiEmpPosAuthStrategyMapper empPosAuthStrategyMapper;
    @Mock private AiEmpRoleAuthMapper empRoleAuthMapper;

    @InjectMocks private AiMyCenterServiceImpl service;

    /** MyBatis-Plus 无 Spring 容器时需手动预热 lambda cache，否则 LambdaQueryWrapper 报 未快致实体 */
    @BeforeAll
    static void primeLambdaCache() {
        org.apache.ibatis.builder.MapperBuilderAssistant asst =
                new org.apache.ibatis.builder.MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(asst, SysUser.class);
        TableInfoHelper.initTableInfo(asst, AiDeptQuotaPolicy.class);
        TableInfoHelper.initTableInfo(asst, AiQuotaConfig.class);
    }

    @BeforeEach
    void setUpAuth() {
        SysUser user = new SysUser();
        user.setId(100L);
        user.setUsername("alice");
        user.setDepartmentId(9L);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("alice", null);
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
        // 默认各 mapper 返回空，测试内单独覆盖关心的
        when(quotaOverrideMapper.selectList(any())).thenReturn(List.of());
        when(quotaConfigMapper.selectList(any())).thenReturn(List.of());
        when(empQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(roleQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(empPosAuthStrategyMapper.selectList(any())).thenReturn(List.of());
        when(empRoleAuthMapper.selectList(any())).thenReturn(List.of());
        when(llmUsageMapper.selectList(any())).thenReturn(List.of());
        when(llmUsageMapper.selectPage(any(), any())).thenReturn(new Page<>(1, 8));
        when(sysUserMapper.selectList(any())).thenReturn(List.of());
    }

    @Test
    void deptPolicySharedPoolAppearsInDimensions() {
        AiDeptQuotaPolicy policy = new AiDeptQuotaPolicy();
        policy.setDeptIds("[9]");
        policy.setName("研发部门共享");
        policy.setAllocateMode("total");
        policy.setPeriod("monthly");
        policy.setQuotaType("token");
        policy.setQuotaValue(new BigDecimal("1000000"));
        policy.setStatus(1);
        when(deptQuotaPolicyMapper.selectList(any())).thenReturn(List.of(policy));

        AiMyCenterDTO.MyQuotaUsageVO vo = service.myQuotaUsage();
        AiMyCenterDTO.QuotaDimensionVO hit = vo.getDimensions().stream()
                .filter(d -> "department".equals(d.getSource()) && "研发部门共享".equals(d.getSourceName()))
                .findFirst().orElseThrow(() -> new AssertionError("新部门额度策略未参与聚合"));
        assertEquals(new BigDecimal("1000000"), hit.getQuotaValue());
        assertEquals("monthly", hit.getPeriod());
        assertEquals("token", hit.getQuotaType());
    }

    @Test
    void deptPolicyNotTargetingUserDeptIsSkipped() {
        AiDeptQuotaPolicy other = new AiDeptQuotaPolicy();
        other.setDeptIds("[11]");
        other.setName("其它部门");
        other.setAllocateMode("total");
        other.setPeriod("monthly");
        other.setQuotaType("token");
        other.setQuotaValue(new BigDecimal("100"));
        other.setStatus(1);
        when(deptQuotaPolicyMapper.selectList(any())).thenReturn(List.of(other));

        AiMyCenterDTO.MyQuotaUsageVO vo = service.myQuotaUsage();
        assertTrue(vo.getDimensions().stream().noneMatch(d -> "其它部门".equals(d.getSourceName())),
                "非目标部门的策略不应参与");
    }

    @Test
    void oldAndNewDeptConfigUnionBothEmitted() {
        // 旧 ai_quota_config 保留一条 department 数据
        AiQuotaConfig legacy = new AiQuotaConfig();
        legacy.setQuotaType("department");
        legacy.setTargetId(9L);
        legacy.setStatus(1);
        legacy.setModelId(null);
        legacy.setMonthlyQuota(500000);
        legacy.setResetDayOfMonth(1);
        when(quotaConfigMapper.selectList(any())).thenReturn(List.of(legacy));

        AiDeptQuotaPolicy policy = new AiDeptQuotaPolicy();
        policy.setDeptIds("[9]");
        policy.setName("新策略");
        policy.setAllocateMode("per_capita");
        policy.setPeriod("monthly");
        policy.setQuotaType("token");
        policy.setQuotaValue(new BigDecimal("100000"));
        policy.setStatus(1);
        when(deptQuotaPolicyMapper.selectList(any())).thenReturn(List.of(policy));

        AiMyCenterDTO.MyQuotaUsageVO vo = service.myQuotaUsage();
        long deptDims = vo.getDimensions().stream()
                .filter(d -> "department".equals(d.getSource()))
                .count();
        assertTrue(deptDims >= 2, "新旧两套 department 维度应并存展示，实际=" + deptDims);
    }
}
