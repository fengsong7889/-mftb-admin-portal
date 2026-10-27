package com.mftb.admin.service.agent.impl;

import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 基于 {@code sys_config} 的 AI 熔断实现。
 * <p>5 秒本地缓存 + 显式 toggle 立即失效；{@code updateConfig} 也会顺带刷新
 * {@link SysConfigService} 内部缓存，跨实例最迟 5 秒收敛。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiKillSwitchServiceImpl implements AiKillSwitchService {

    private static final String KEY_ENABLED = "ai_kill_switch";
    private static final String KEY_OPERATOR = "ai_kill_switch_operator";
    private static final String KEY_REASON = "ai_kill_switch_reason";
    private static final String KEY_UPDATED_AT = "ai_kill_switch_updated_at";
    private static final long CACHE_TTL_MS = 5_000L;
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SysConfigService sysConfigService;

    private final AtomicReference<Cached> cache = new AtomicReference<>(new Cached(false, 0L));

    @Override
    public boolean isEngaged() {
        Cached c = cache.get();
        long now = System.currentTimeMillis();
        if (c != null && now - c.at < CACHE_TTL_MS) {
            return c.engaged;
        }
        boolean engaged = readBoolean();
        cache.set(new Cached(engaged, now));
        return engaged;
    }

    @Override
    public void toggle(boolean engaged, String operator, String reason) {
        sysConfigService.updateConfig(KEY_ENABLED, String.valueOf(engaged));
        sysConfigService.updateConfig(KEY_OPERATOR, operator == null ? "" : operator);
        sysConfigService.updateConfig(KEY_REASON, reason == null ? "" : reason);
        sysConfigService.updateConfig(KEY_UPDATED_AT, LocalDateTime.now().format(TS));
        cache.set(new Cached(engaged, System.currentTimeMillis()));
        log.warn("AI 紧急开关切换：engaged={} operator={} reason={}", engaged, operator, reason);
    }

    @Override
    public Status current() {
        return new Status(
                readBoolean(),
                orDash(sysConfigService.getConfigValue(KEY_OPERATOR)),
                orDash(sysConfigService.getConfigValue(KEY_REASON)),
                orDash(sysConfigService.getConfigValue(KEY_UPDATED_AT)));
    }

    private boolean readBoolean() {
        String raw = sysConfigService.getConfigValue(KEY_ENABLED);
        return raw != null && "true".equalsIgnoreCase(raw.trim());
    }

    private static String orDash(String v) {
        return (v == null || v.isEmpty()) ? "-" : v;
    }

    private record Cached(boolean engaged, long at) {}
}
