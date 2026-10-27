package com.mftb.admin.service.impl;

import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.CaptchaService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * AuthServiceImpl.checkSession 关键分支单测（Round 5 · 统一登出）。
 * <p>覆盖新增的 "active_token 为空 → SESSION_REVOKED" 判定，
 * 与已有的 force_logout / account_disabled / session_conflict / idle_timeout 分支互斥。
 */
class AuthServiceImplSessionTest {

    private SysUserMapper sysUserMapper;
    private SysConfigService sysConfigService;
    private AuthServiceImpl service;

    @BeforeEach
    void setUp() {
        sysUserMapper = mock(SysUserMapper.class);
        sysConfigService = mock(SysConfigService.class);
        service = new AuthServiceImpl(
                sysUserMapper,
                mock(PasswordEncoder.class),
                mock(JwtUtil.class),
                mock(RoleService.class),
                mock(DepartmentService.class),
                mock(LoginLogService.class),
                sysConfigService,
                mock(CaptchaService.class),
                mock(PermissionService.class));
        // 默认给一个足够长的空闲窗口，避免用例被空闲超时分支截胡
        org.mockito.Mockito.lenient().when(sysConfigService.getSessionIdleTimeoutMs()).thenReturn(3_600_000L);
    }

    @Test
    @DisplayName("activeToken=null → checkSession 返回 SESSION_REVOKED")
    void nullActiveTokenYieldsRevoked() {
        SysUser user = activeUser();
        user.setActiveToken(null);

        SessionCheckResult result = service.checkSession("any-token", "MF00001", user);

        assertFalse(result.isPassed());
        assertEquals(401, result.getCode());
        assertEquals("SESSION_REVOKED", result.getData().get("reason"));
    }

    @Test
    @DisplayName("activeToken 存在但与本次携带 token 不一致 → SESSION_CONFLICT（旧行为保留）")
    void conflictingActiveTokenYieldsSessionConflict() {
        SysUser user = activeUser();
        user.setActiveToken("current-token-on-server");

        SessionCheckResult result = service.checkSession("stale-token-on-client", "MF00001", user);

        assertFalse(result.isPassed());
        assertEquals("SESSION_CONFLICT", result.getData().get("reason"));
    }

    @Test
    @DisplayName("activeToken 与携带 token 一致 + 未空闲 → 通过")
    void matchingActiveTokenPasses() {
        SysUser user = activeUser();
        user.setActiveToken("the-token");
        user.setLastActiveAt(LocalDateTime.now());

        SessionCheckResult result = service.checkSession("the-token", "MF00001", user);

        assertTrue(result.isPassed());
    }

    private SysUser activeUser() {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("MF00001");
        user.setStatus(1);
        user.setLastActiveAt(LocalDateTime.now());
        return user;
    }
}
