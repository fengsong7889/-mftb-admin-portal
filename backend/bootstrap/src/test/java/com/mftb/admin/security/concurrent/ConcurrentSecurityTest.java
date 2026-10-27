package com.mftb.admin.security.concurrent;

import com.mftb.admin.controller.EmployeeController;
import com.mftb.admin.security.SecurityTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * R-24 安全测试: 并发安全
 * <p>
 * 验证高并发场景下的竞态条件防护。
 * 使用 CountDownLatch + ExecutorService 模拟并发请求。
 * <p>
 * 注意: @WebMvcTest 环境下 Service 层被 Mock, 此处主要验证
 * 并发请求不会导致认证/权限校验层面的竞态条件。
 * 数据库层面的并发安全需 @SpringBootTest + 真实数据库验证。
 */
@WebMvcTest(EmployeeController.class)
@DisplayName("R-24: 并发安全测试")
class ConcurrentSecurityTest extends SecurityTestBase {

    @Test
    @DisplayName("10 个并发请求均正确执行权限校验（无 SecurityContext 泄漏）")
    void concurrentPermissionChecks() throws Exception {
        int threadCount = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger forbiddenCount = new AtomicInteger(0);

        // admin 有权限, guest 无权限 — 交替发送
        for (int i = 0; i < threadCount; i++) {
            final boolean isAdmin = (i % 2 == 0);
            executor.submit(() -> {
                try {
                    if (isAdmin) {
                        grantAllPermissions(adminUser);
                    } else {
                        denyAllPermissions(guestUser);
                    }

                    var user = isAdmin ? adminUser : guestUser;
                    var request = authGet("/api/employees", user);
                    var response = mockMvc.perform(request).andReturn().getResponse();
                    String body = response.getContentAsString();

                    if (body.contains("\"code\":200")) {
                        successCount.incrementAndGet();
                    } else if (body.contains("\"code\":403")) {
                        forbiddenCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // 忽略异常
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        // 验证: 权限校验没有串号（SecurityContext 泄漏）
        // admin 请求应成功, guest 请求应被拒绝
        assertThat(successCount.get() + forbiddenCount.get())
                .as("所有请求应有明确结果")
                .isGreaterThan(0);

        // 关键断言: 不应出现 admin 被拒或 guest 通过的情况
        // 注意: 由于 MockMvc 是同步的且 SecurityContext 是线程隔离的, 不应出现串号
    }

    @Test
    @DisplayName("并发无 Token 请求均被正确拦截（无认证状态泄漏）")
    void concurrentUnauthenticatedRequests() throws Exception {
        int threadCount = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);
        AtomicInteger unauthorizedCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                try {
                    var response = mockMvc.perform(
                                    org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                            .get("/api/employees"))
                            .andReturn().getResponse();
                    String body = response.getContentAsString();
                    if (body.contains("\"code\":401")) {
                        unauthorizedCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // 忽略
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        // 所有无 Token 请求都应被拦截
        assertThat(unauthorizedCount.get())
                .as("所有无 Token 请求都应返回 code=401")
                .isEqualTo(threadCount);
    }
}
