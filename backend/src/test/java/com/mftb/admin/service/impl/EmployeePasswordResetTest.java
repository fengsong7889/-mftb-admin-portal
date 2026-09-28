package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理员重置密码的账号安全副作用测试。
 * <p>重置后的密码属于「他人设定的初始密码」，必须同时满足两件事：
 * 置强制改密标记（首次登录被门禁拦住）+ 立即作废当前会话（不能继续用旧登录态摸数据）。
 */
class EmployeePasswordResetTest {

    private static final long USER_ID = 7L;
    private static final String NEW_RAW = "Init88#ab";

    private SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private EmployeeServiceImpl service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysUser.class);
        sysUserMapper = mock(SysUserMapper.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("管理員");
        service = new EmployeeServiceImpl(sysUserMapper, mock(SysDepartmentMapper.class),
                mock(SysPositionMapper.class), mock(SysLoginLogMapper.class), mock(EmpPositionRecordMapper.class),
                passwordEncoder, mock(JdbcTemplate.class), operatorResolver,
                mock(com.mftb.admin.service.PermissionService.class), mock(BizSeqService.class));
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysUserMapper.update(isNull(), any())).thenReturn(1);
    }

    private SysUser user() {
        SysUser u = new SysUser();
        u.setId(USER_ID);
        u.setUsername("MF00007");
        u.setEmpId("MF00007");
        u.setName("李四");
        u.setPassword(passwordEncoder.encode("111222"));
        u.setActiveToken("old-jwt-token");
        u.setMustChangePassword(false);
        return u;
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("重置密码：置强制改密标记并作废当前会话，密码以 BCrypt 密文写入")
    void resetForcesPasswordChangeAndKillsSession() {
        service.resetPassword(USER_ID, NEW_RAW);

        ArgumentCaptor<LambdaUpdateWrapper<SysUser>> captor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(sysUserMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SysUser> wrapper = captor.getValue();
        String setClause = wrapper.getSqlSet();

        assertTrue(setClause.contains("must_change_password"), "应置强制改密标记: " + setClause);
        assertTrue(setClause.contains("active_token"), "应作废当前会话: " + setClause);
        assertTrue(setClause.contains("password"), "应更新密码: " + setClause);
        assertTrue(wrapper.getParamNameValuePairs().values().stream()
                        .filter(v -> v instanceof String)
                        .map(v -> (String) v)
                        .anyMatch(v -> v.startsWith("$2") && passwordEncoder.matches(NEW_RAW, v)),
                "新密码必须以 BCrypt 密文写入: " + wrapper.getParamNameValuePairs());
        // 定向更新而非整实体回写，避免覆盖并发变更
        verify(sysUserMapper, never()).updateById(any(SysUser.class));
    }
}
