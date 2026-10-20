package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.entity.AiDeptAuthGroup;
import com.mftb.admin.entity.AiDeptAuthGroupDept;
import com.mftb.admin.entity.AiDeptAuthGroupModel;
import com.mftb.admin.entity.AiDeptQuotaPolicy;
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
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * AI 额度闸门测试：额度必须显式授予才能使用 AI 助手。
 *
 * <p>旧实现「无任何适用额度维度 → allowed=true（無額度限制，放行）」等于「没人配额度 = 不限量」，
 * 与项目「默认拒绝」的安全基线相反，且让首页早已写好的「暫無可用額度，請提交申請」拦截文案永远走不到。
 *
 * <p>锁死三条口径：
 * <ol>
 *   <li>普通员工无额度维度 → reject，且 quotaConfigured=false（前端据此显示「去申请」而非「额度用尽」）；</li>
 *   <li>内置系统管理员 admin 无额度维度 → 仍放行（唯一豁免，且它本就没有员工身份）；</li>
 *   <li>已配额度且未用尽的人 → 正常放行且 quotaConfigured=true（闸门不得误伤）。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiMyCenterQuotaGateTest {

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

    /** 纯 Mockito 环境无实体元数据，LambdaQueryWrapper 的 .select(Entity::field) 需先建 TableInfo 缓存 */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant asst = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        for (Class<?> entity : List.of(SysUser.class, AiModel.class, AiQuotaConfig.class, AiQuotaOverride.class,
                AiEmpQuotaPolicy.class, AiRoleQuotaPolicy.class, AiDeptQuotaPolicy.class, LlmUsage.class,
                AiDeptAuthGroup.class, AiDeptAuthGroupDept.class, AiDeptAuthGroupModel.class,
                AiEmployeeAuth.class, AiEmpPosAuthStrategy.class, AiEmpRoleAuth.class)) {
            TableInfoHelper.initTableInfo(asst, entity);
        }
    }

    private void loginAs(long userId, String username) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setUsername(username);
        user.setName(username);
        user.setDepartmentId(9L);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(username, null);
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /** 默认所有额度来源都为空 —— 即「该员工没有被任何额度维度覆盖」 */
    @BeforeEach
    void stubEmptySources() {
        when(quotaOverrideMapper.selectList(any())).thenReturn(List.of());
        when(quotaConfigMapper.selectList(any())).thenReturn(List.of());
        when(empQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(roleQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(deptQuotaPolicyMapper.selectList(any())).thenReturn(List.of());
        when(deptGroupDeptMapper.selectList(any())).thenReturn(List.of());
        when(deptGroupMapper.selectList(any())).thenReturn(List.of());
        when(deptGroupModelMapper.selectList(any())).thenReturn(List.of());
        when(employeeAuthMapper.selectList(any())).thenReturn(List.of());
        when(empPosAuthStrategyMapper.selectList(any())).thenReturn(List.of());
        when(empRoleAuthMapper.selectList(any())).thenReturn(List.of());
        when(llmUsageMapper.selectList(any())).thenReturn(List.of());
        when(llmUsageMapper.selectPage(any(), any())).thenReturn(new Page<>(1, 8));
        when(sysUserMapper.selectList(any())).thenReturn(List.of());
    }

    @Test
    @DisplayName("普通员工无任何额度维度：默认拒绝，并标记 quotaConfigured=false")
    void employeeWithoutAnyQuotaIsRejected() {
        loginAs(100L, "MF00001");

        AiMyCenterDTO.QuotaCheckVO vo = service.checkQuota(null, null);

        assertFalse(vo.isAllowed(), "未配置额度的员工不得被放行");
        assertEqualsReject(vo);
        assertFalse(vo.isQuotaConfigured(), "必须能区分「从未配过额度」与「额度用尽」");
        assertNotNull(vo.getMessage());
        assertTrue(vo.getMessage().contains("AI 使用申請"), "提示应引导员工去提交申请：" + vo.getMessage());
    }

    @Test
    @DisplayName("内置系统管理员 admin 无额度维度：唯一豁免，仍然放行")
    void builtinAdminIsExemptFromQuotaGate() {
        loginAs(32L, "admin");

        AiMyCenterDTO.QuotaCheckVO vo = service.checkQuota(null, null);

        assertTrue(vo.isAllowed(), "内置系统管理员不受额度管控");
        assertTrue("allow".equals(vo.getAction()), "实际 action=" + vo.getAction());
        assertFalse(vo.isQuotaConfigured(), "豁免不等于已配额度，标记仍应为未配置");
    }

    @Test
    @DisplayName("已配额度且未用尽：正常放行，闸门不得误伤")
    void employeeWithQuotaStillPasses() {
        loginAs(101L, "MF00002");

        AiQuotaConfig config = new AiQuotaConfig();
        config.setQuotaType("employee");
        config.setTargetId(101L);
        config.setDailyQuota(1000);
        config.setStatus(1);
        when(quotaConfigMapper.selectList(any())).thenReturn(List.of(config));

        AiMyCenterDTO.QuotaCheckVO vo = service.checkQuota(null, null);

        assertTrue(vo.isAllowed(), "已配额度且未用尽必须放行");
        assertTrue(vo.isQuotaConfigured());
        assertTrue("allow".equals(vo.getAction()), "实际 action=" + vo.getAction());
    }

    private static void assertEqualsReject(AiMyCenterDTO.QuotaCheckVO vo) {
        assertTrue("reject".equals(vo.getAction()),
                "action 必须是 reject，网关/编排/RDM 助手三处调用点都只认 reject，实际=" + vo.getAction());
    }
}
