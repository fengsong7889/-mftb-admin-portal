package com.mftb.admin.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JwtUtil 单元测试（不依赖 Spring 容器，通过反射注入配置）
 */
class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        // HMAC-SHA 至少需要 32 字节密钥
        ReflectionTestUtils.setField(jwtUtil, "secret", "unit-test-secret-key-must-be-at-least-32-bytes");
        ReflectionTestUtils.setField(jwtUtil, "expiration", 3600000L);
        jwtUtil.init();
    }

    @Test
    @DisplayName("生成 Token 后可解析出用户名与用户ID")
    void generateAndParse() {
        String token = jwtUtil.generateToken(88L, "MF00001");

        assertThat(jwtUtil.validateToken(token)).isTrue();
        assertThat(jwtUtil.getUsername(token)).isEqualTo("MF00001");
        assertThat(jwtUtil.getUserId(token)).isEqualTo(88L);
    }

    @Test
    @DisplayName("篡改/非法 Token 校验失败")
    void invalidToken() {
        String token = jwtUtil.generateToken(1L, "admin");

        assertThat(jwtUtil.validateToken("not-a-jwt")).isFalse();
        // 篡改签名部分
        assertThat(jwtUtil.validateToken(token + "x")).isFalse();
    }

    @Test
    @DisplayName("过期 Token 校验失败")
    void expiredToken() {
        ReflectionTestUtils.setField(jwtUtil, "expiration", -1000L);
        jwtUtil.init();
        String token = jwtUtil.generateToken(1L, "admin");

        assertThat(jwtUtil.validateToken(token)).isFalse();
    }
}
