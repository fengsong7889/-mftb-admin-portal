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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 内置系统管理员在 AI 权额上的豁免口径：
 * 默认拥有全部启用模型（myModels）、不受额度管控（checkQuota）、用量视图标记不限额（myQuotaUsage）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiMyCenterServiceAdminExemptionTest {

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

    @InjectMocks
    private AiMyCenterServiceImpl service;

    /** MyBatis-Plus 的 Lambda 列解析依赖 TableInfo 缓存，纯 Mockito 用例需手工初始化 */
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

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** 把指定账号写入 SecurityContext（服务内部 currentUser() 从这里取） */
    private void loginAs(String username) {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername(username);
        user.setName(username);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(username, null, List.of());
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private AiModel model(long id, String modelKey, String name) {
        AiModel m = new AiModel();
        m.setId(id);
        m.setModelKey(modelKey);
        m.setName(name);
        m.setStatus(1);
        m.setSortOrder((int) id);
        return m;
    }

    @Test
    @DisplayName("管理员默认拥有全部启用模型，不再走四维授权收集")
    void adminGetsAllEnabledModels() {
        loginAs("admin");
        when(modelMapper.selectList(any())).thenReturn(List.of(
                model(1L, "qwen-max", "Qwen Max"),
                model(2L, "deepseek-chat", "DeepSeek Chat")));
        when(providerMapper.selectList(any())).thenReturn(List.of());

        List<AiMyCenterDTO.MyModelVO> result = service.myModels();

        assertEquals(2, result.size());
        assertTrue(result.stream().anyMatch(m -> "qwen-max".equals(m.getModelKey())));
        assertTrue(result.stream().allMatch(m -> m.getSources().contains("system")));
        // 管理员不应再查询部门/职位/角色/员工授权，避免被人为未配授权挡在外面
        verify(deptGroupDeptMapper, never()).selectList(any());
        verify(empPosAuthStrategyMapper, never()).selectList(any());
        verify(empRoleAuthMapper, never()).selectList(any());
        verify(employeeAuthMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("普通账号无任何授权时仍返回空（豁免不外溢）")
    void normalUserWithoutGrantsGetsEmpty() {
        loginAs("MF00002");
        when(empRoleAuthMapper.selectList(any())).thenReturn(List.of());
        when(employeeAuthMapper.selectList(any())).thenReturn(List.of());

        assertTrue(service.myModels().isEmpty());
        verify(modelMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("管理员配额校验直接放行，且不汇总任何额度维度")
    void adminQuotaAlwaysAllowed() {
        loginAs("admin");
        when(modelMapper.selectOne(any())).thenReturn(model(1L, "qwen-max", "Qwen Max"));

        AiMyCenterDTO.QuotaCheckVO vo = service.checkQuota(null, "qwen-max");

        assertTrue(vo.isAllowed());
        assertEquals("allow", vo.getAction());
        assertFalse(vo.isQuotaConfigured());
        verify(quotaConfigMapper, never()).selectList(any());
        verify(quotaOverrideMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("管理员用量视图标记 unlimited，维度为空属预期")
    void adminUsageMarkedUnlimited() {
        loginAs("admin");
        when(llmUsageMapper.selectList(any())).thenReturn(List.of());
        when(llmUsageMapper.selectPage(any(), any())).thenReturn(new Page<>());

        AiMyCenterDTO.MyQuotaUsageVO vo = service.myQuotaUsage();

        assertTrue(vo.getUnlimited());
        assertTrue(vo.getDimensions().isEmpty());
        verify(quotaConfigMapper, never()).selectList(any());
    }
}
