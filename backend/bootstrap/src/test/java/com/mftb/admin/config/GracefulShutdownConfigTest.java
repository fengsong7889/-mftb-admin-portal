package com.mftb.admin.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 优雅退出配置的守卫测试（方案 §六「发布保留就绪/存活检查、优雅退出和请求排空」）。
 *
 * <p>为什么用文本断言而不是起 Spring 上下文：这里要守住的是「配置项没被删」，
 * 不是容器行为；起上下文还会依赖数据库与迁移状态，反而让这条保护变脆。
 */
class GracefulShutdownConfigTest {

    private String applicationYaml() throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("application.yml")) {
            assertNotNull(in, "bootstrap 资源里必须存在 application.yml");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    @DisplayName("server.shutdown=graceful：SIGTERM 后停止接新请求并等在途请求完成")
    void enablesGracefulShutdown() throws Exception {
        String yml = applicationYaml();
        assertTrue(yml.contains("shutdown: graceful"),
                "application.yml 缺少 server.shutdown: graceful，滚动发布可能切断在途写请求");
    }

    @Test
    @DisplayName("spring.lifecycle.timeout-per-shutdown-phase=30s：与 K8s 宽限期配套")
    void setsShutdownPhaseTimeout() throws Exception {
        String yml = applicationYaml();
        assertTrue(yml.contains("timeout-per-shutdown-phase: 30s"),
                "application.yml 缺少 spring.lifecycle.timeout-per-shutdown-phase: 30s");
    }
}
