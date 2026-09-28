package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.ChangePasswordRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.CaptchaService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.JwtUtil;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 本人修改登录密码（POST /api/auth/password）的关键约束单测。
 * <p>改密是账号安全的最后一道闸，这里锁死四件事：
 * 旧密码必须真的校验、新旧不得相同、失败要限流防暴力、成功后必须撤销当前会话强制重登。
 */
class AuthChangePasswordTest {

    private static final String USERNAME = "MF00001";
    private static final String OLD_RAW = "111222";
    /** 符合策略的示例密码：8 位 + 大小写/数字/特殊四类 + 无个人信息与连续序列 */
    private static final String NEW_RAW = "Kx7#pq2m";
    private static final String ACTIVE_TOKEN = "current-jwt-token";

    private SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private AuthServiceImpl service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysUser.class);
        sysUserMapper = mock(SysUserMapper.class);
        service = new AuthServiceImpl(
                sysUserMapper,
                passwordEncoder,
                mock(JwtUtil.class),
                mock(RoleService.class),
                mock(DepartmentService.class),
                mock(LoginLogService.class),
                mock(SysConfigService.class),
                mock(CaptchaService.class),
                mock(PermissionService.class));
        lenient().when(sysUserMapper.selectOne(any())).thenReturn(user());
        lenient().when(sysUserMapper.update(isNull(), any())).thenReturn(1);
    }

    private SysUser user() {
        SysUser u = new SysUser();
        u.setId(1L);
        u.setUsername(USERNAME);
        u.setEmpId(USERNAME);
        u.setName("管理員");
        u.setPassword(passwordEncoder.encode(OLD_RAW));
        u.setActiveToken(ACTIVE_TOKEN);
        u.setStatus(1);
        return u;
    }

    private static ChangePasswordRequest request(String oldPwd, String newPwd, String confirmPwd) {
        ChangePasswordRequest req = new ChangePasswordRequest();
        req.setOldPassword(oldPwd);
        req.setNewPassword(newPwd);
        req.setConfirmPassword(confirmPwd);
        return req;
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<LambdaUpdateWrapper<SysUser>> updateCaptor() {
        return ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
    }

    @Test
    @DisplayName("旧密码不正确：拒绝改密，且不写库不撤销会话")
    void wrongOldPasswordIsRejected() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request("wrong-pwd", NEW_RAW, NEW_RAW), ACTIVE_TOKEN));

        assertTrue(error.getMessage().contains("當前密碼不正確"), "实际提示: " + error.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("两次新密码不一致：拒绝改密")
    void mismatchedConfirmPasswordIsRejected() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request(OLD_RAW, NEW_RAW, "other-pwd"), ACTIVE_TOKEN));

        assertTrue(error.getMessage().contains("不一致"), "实际提示: " + error.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("新密码与当前密码相同：拒绝改密")
    void sameAsCurrentPasswordIsRejected() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request(OLD_RAW, OLD_RAW, OLD_RAW), ACTIVE_TOKEN));

        assertTrue(error.getMessage().contains("不能與當前密碼相同"), "实际提示: " + error.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("新密码不满足强度策略：一次性返回全部违规项且不写库")
    void weakNewPasswordIsRejected() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request(OLD_RAW, "12345678", "12345678"), ACTIVE_TOKEN));

        assertTrue(error.getMessage().contains("安全策略"), "实际提示: " + error.getMessage());
        // 同时命中“字符类别不足”与“弱口令/连续序列”，应一并告知，避免用户反复试错
        assertTrue(error.getMessage().contains("類"), "应提示字符类别要求: " + error.getMessage());
        assertTrue(error.getMessage().contains("弱口令"), "应提示弱口令: " + error.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("新密码包含本人账号：拒绝改密")
    void passwordContainingAccountIsRejected() {
        // 含工号 MF00001，其余条件均满足
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request(OLD_RAW, "Kx#MF00001q2", "Kx#MF00001q2"), ACTIVE_TOKEN));

        assertTrue(error.getMessage().contains("賬號"), "实际提示: " + error.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("改密成功：写入新密码并撤销当前会话（强制重新登录）")
    void successUpdatesPasswordAndRevokesSession() {
        service.changePassword(USERNAME, request(OLD_RAW, NEW_RAW, NEW_RAW), ACTIVE_TOKEN);

        ArgumentCaptor<LambdaUpdateWrapper<SysUser>> captor = updateCaptor();
        verify(sysUserMapper, times(2)).update(isNull(), captor.capture());

        LambdaUpdateWrapper<SysUser> passwordUpdate = captor.getAllValues().get(0);
        assertTrue(passwordUpdate.getSqlSet().contains("password"), "应更新密码字段: " + passwordUpdate.getSqlSet());
        // 本人已设定新密码 → 必须解除强制改密标记，否则改完仍被门禁拦住
        assertTrue(passwordUpdate.getSqlSet().contains("must_change_password"),
                "改密成功应解除强制改密标记: " + passwordUpdate.getSqlSet());
        // 新密码必须以 BCrypt 密文写入，不得存明文
        assertTrue(passwordUpdate.getParamNameValuePairs().values().stream()
                        .filter(v -> v instanceof String)
                        .map(v -> (String) v)
                        .anyMatch(v -> v.startsWith("$2") && passwordEncoder.matches(NEW_RAW, v)),
                "新密码必须以 BCrypt 密文写入: " + passwordUpdate.getParamNameValuePairs());

        LambdaUpdateWrapper<SysUser> revokeUpdate = captor.getAllValues().get(1);
        assertTrue(revokeUpdate.getSqlSet().contains("active_token"), "改密后必须撤销会话: " + revokeUpdate.getSqlSet());
        // 撤销条件必须同时限定账号与本次 Token（精确匹配，避免误伤新会话）
        assertTrue(revokeUpdate.getSqlSegment().contains("username")
                        && revokeUpdate.getSqlSegment().contains("active_token"),
                "撤销需按账号 + 本次会话 Token 精确匹配: " + revokeUpdate.getSqlSegment());
    }

    @Test
    @DisplayName("旧密码连续输错达上限后锁定改密，即使密码正确也拒绝（防暴力猜测）")
    void repeatedFailuresLockPasswordChange() {
        for (int i = 0; i < 5; i++) {
            final String guess = "guess-" + i;
            assertThrows(BusinessException.class,
                    () -> service.changePassword(USERNAME, request(guess, NEW_RAW, NEW_RAW), ACTIVE_TOKEN));
        }

        BusinessException locked = assertThrows(BusinessException.class,
                () -> service.changePassword(USERNAME, request(OLD_RAW, NEW_RAW, NEW_RAW), ACTIVE_TOKEN));
        assertTrue(locked.getMessage().contains("連續輸錯"), "实际提示: " + locked.getMessage());
        verify(sysUserMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("未登录（无当前账号）直接拒绝，不给匿名改密通道")
    void anonymousCannotChangePassword() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.changePassword(null, request(OLD_RAW, NEW_RAW, NEW_RAW), ACTIVE_TOKEN));

        assertEquals(401, error.getCode().intValue());
        verify(sysUserMapper, never()).update(isNull(), any());
    }
}
