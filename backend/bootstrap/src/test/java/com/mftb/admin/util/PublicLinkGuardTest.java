package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 免登链接可达性判断：把“看起来只有内网能到”的站点地址挑出来。
 *
 * <p>线上事故回放：卡片里的链接被拼成 {@code http://192.168.31.88:3000/#/meeting-minutes-view?token=...}，
 * 开发机上点得开，手机点开只看到“网络不给力”。这类地址必须在发送前被识别并明确警告。
 */
class PublicLinkGuardTest {

    @Test
    @DisplayName("公网 HTTPS 站点视为可达")
    void publicHttpsIsReachable() {
        assertTrue(PublicLinkGuard.isPubliclyReachable("https://fengsong7889.github.io/-mftb-admin-portal"));
        assertTrue(PublicLinkGuard.isPubliclyReachable("https://admin.example.com"));
        assertTrue(PublicLinkGuard.isPubliclyReachable("http://8.8.8.8:8080"));
    }

    @Test
    @DisplayName("localhost / 127.x / 0.0.0.0 不可达")
    void loopbackIsNotReachable() {
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://localhost:3000"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://app.localhost:3000/#/x"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://127.0.0.1:8080"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://0.0.0.0:8080"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://[::1]:8080"));
    }

    @Test
    @DisplayName("RFC1918 私网地址不可达（本次事故的 192.168.31.88 正在此列）")
    void privateIpv4IsNotReachable() {
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://192.168.31.88:3000/#/meeting-minutes-view?token=x"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://10.0.0.12:3000"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://172.16.0.9:3000"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://172.31.255.1:3000"));
        // 172.32 已离开 172.16/12，属于公网段
        assertTrue(PublicLinkGuard.isPubliclyReachable("http://172.32.0.1:3000"));
    }

    @Test
    @DisplayName("链路本地与运营商级 NAT 地址不可达")
    void linkLocalAndCgnatAreNotReachable() {
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://169.254.1.1"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://100.64.0.1"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("http://100.127.255.1"));
        assertTrue(PublicLinkGuard.isPubliclyReachable("http://100.128.0.1"));
    }

    @Test
    @DisplayName("非 http/https 或空值一律不可达")
    void invalidSchemesAreNotReachable() {
        assertFalse(PublicLinkGuard.isPubliclyReachable(null));
        assertFalse(PublicLinkGuard.isPubliclyReachable(""));
        assertFalse(PublicLinkGuard.isPubliclyReachable("ftp://admin.example.com"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("javascript:alert(1)"));
        assertFalse(PublicLinkGuard.isPubliclyReachable("https://"));
    }
}
