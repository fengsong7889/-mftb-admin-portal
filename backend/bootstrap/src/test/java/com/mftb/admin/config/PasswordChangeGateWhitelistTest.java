package com.mftb.admin.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 强制改密门禁的放行清单测试。
 * <p>清单只能包含「改密流程自身需要的接口」：多放一个业务接口，就等于给未改密账号开了后门；
 * 少放一个（如会话轮询），用户会在改密前被判定登录失效而卡死。
 */
class PasswordChangeGateWhitelistTest {

    @Test
    @DisplayName("改密流程接口放行")
    void authFlowEndpointsAreAllowed() {
        assertTrue(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/auth/password"));
        assertTrue(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/auth/logout"));
        // 会话轮询必须放行，否则强制改密期间会被判成登录失效
        assertTrue(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/auth/check"));
        assertTrue(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/auth/info"));
    }

    @Test
    @DisplayName("业务接口一律拦住，且前缀匹配不得误放行 authorization 域")
    void businessEndpointsAreBlocked() {
        assertFalse(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/eam/claims/my"));
        assertFalse(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/portal/context"));
        // /api/authorization/* 以 /api/auth 开头，但不属于白名单
        assertFalse(JwtAuthenticationFilter.isPasswordChangeWhitelisted("/api/authorization/menus"));
        assertFalse(JwtAuthenticationFilter.isPasswordChangeWhitelisted(null));
    }
}
