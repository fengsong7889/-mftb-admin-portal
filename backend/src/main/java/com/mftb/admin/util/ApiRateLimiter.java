package com.mftb.admin.util;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 基于 Bucket4j 令牌桶算法的 API 速率限制器（内存级，单实例部署适用）。
 * <p>
 * 按「用户名 + 操作标识」维度做令牌桶限流，超出阈值时拒绝操作。
 * 多实例部署请替换为 Redis 方案（如 Bucket4j-Redis / Redisson）。
 */
@Slf4j
@Component
public class ApiRateLimiter {

    /** 操作维度 → { 用户名:action → Bucket } */
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /** 默认窗口大小 */
    private static final Duration DEFAULT_WINDOW = Duration.ofMinutes(1);

    /** 默认窗口内最大次数 */
    private static final int DEFAULT_MAX_REQUESTS = 10;

    /**
     * 尝试获取一次操作许可。
     *
     * @param action       操作标识（如 "ad:refund"、"ad:cancel"）
     * @param maxPerWindow 窗口内最大次数
     * @param windowMs     窗口大小（毫秒）
     * @return true=允许，false=已超限
     */
    public boolean tryAcquire(String action, int maxPerWindow, long windowMs) {
        String username = currentUsername();
        if (username == null) {
            return true; // 未认证场景由 Security 层拦截
        }
        String key = username + ":" + action;
        Bucket bucket = buckets.computeIfAbsent(key, k -> buildBucket(maxPerWindow, windowMs));

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return true;
        }
        log.warn("API 速率限制触发: user={}, action={}, remaining={}, refillMs={}",
                username, action, probe.getRemainingTokens(), probe.getNanosToWaitForRefill() / 1_000_000);
        return false;
    }

    /** 使用默认配置尝试获取（10次/分钟） */
    public boolean tryAcquire(String action) {
        return tryAcquire(action, DEFAULT_MAX_REQUESTS, DEFAULT_WINDOW.toMillis());
    }

    /**
     * 构建 Bucket4j 令牌桶。
     * 使用 greedy refill 策略：令牌尽可能快地补充到上限。
     */
    private Bucket buildBucket(int capacity, long windowMs) {
        Bandwidth limit = Bandwidth.simple(capacity, Duration.ofMillis(windowMs));
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
    }
}
