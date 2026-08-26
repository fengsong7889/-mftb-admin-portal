package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicLong;

/**
 * 系统配置服务实现
 * 内置内存缓存，避免每次请求都查库；缓存 5 分钟自动刷新，更新时立即失效
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysConfigServiceImpl implements SysConfigService {

    private final SysConfigMapper sysConfigMapper;

    /** 缓存的空闲超时值（毫秒） */
    private final AtomicLong cachedIdleTimeoutMs = new AtomicLong(DEFAULT_IDLE_TIMEOUT_MS);

    /** 缓存上次加载时间戳 */
    private volatile long lastLoadTime = 0;

    /** 缓存有效期：5 分钟 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    /** 空闲超时的配置 key */
    private static final String KEY_IDLE_TIMEOUT = "session_idle_timeout_ms";

    /** 广告点击加购锁定时长的配置 key */
    private static final String KEY_AD_CART_LOCK_SECONDS = "ad_click_cart_lock_seconds";

    /** 加购锁定时长默认值（秒），与原有硬编码保持一致 */
    private static final long DEFAULT_AD_CART_LOCK_SECONDS = 60L;

    @Override
    public long getSessionIdleTimeoutMs() {
        long now = System.currentTimeMillis();
        if (now - lastLoadTime > CACHE_TTL_MS) {
            loadIdleTimeoutFromDb();
        }
        return cachedIdleTimeoutMs.get();
    }

    @Override
    public long getAdClickCartLockSeconds() {
        try {
            String value = getConfigValue(KEY_AD_CART_LOCK_SECONDS);
            if (value != null && !value.isBlank()) {
                long seconds = Long.parseLong(value.trim());
                // 限制在前端可选范围 1~3600 秒内，避免非法值影响业务
                return Math.min(Math.max(seconds, 1L), 3600L);
            }
        } catch (NumberFormatException e) {
            log.warn("加购锁定时长配置值格式错误，使用默认 {} 秒", DEFAULT_AD_CART_LOCK_SECONDS);
        } catch (Exception e) {
            log.warn("读取加购锁定时长配置失败，使用默认 {} 秒: {}", DEFAULT_AD_CART_LOCK_SECONDS, e.getMessage());
        }
        return DEFAULT_AD_CART_LOCK_SECONDS;
    }

    @Override
    public String getConfigValue(String configKey) {
        SysConfig config = sysConfigMapper.selectOne(
                new LambdaQueryWrapper<SysConfig>()
                        .eq(SysConfig::getConfigKey, configKey));
        return config != null ? config.getConfigValue() : null;
    }

    @Override
    public void updateConfig(String configKey, String configValue) {
        // 尝试更新（UPSERT 语义）
        int rows = sysConfigMapper.update(null,
                new LambdaUpdateWrapper<SysConfig>()
                        .eq(SysConfig::getConfigKey, configKey)
                        .set(SysConfig::getConfigValue, configValue));
        if (rows == 0) {
            // key 不存在，插入新记录
            try {
                SysConfig config = new SysConfig();
                config.setConfigKey(configKey);
                config.setConfigValue(configValue);
                sysConfigMapper.insert(config);
            } catch (Exception e) {
                // 并发写入时可能触发唯一键冲突，回退到更新
                log.warn("插入配置 {} 失败（可能已存在），回退更新: {}", configKey, e.getMessage());
                sysConfigMapper.update(null,
                        new LambdaUpdateWrapper<SysConfig>()
                                .eq(SysConfig::getConfigKey, configKey)
                                .set(SysConfig::getConfigValue, configValue));
            }
        }
        // 立即刷新缓存
        if (KEY_IDLE_TIMEOUT.equals(configKey)) {
            try {
                cachedIdleTimeoutMs.set(Long.parseLong(configValue));
                lastLoadTime = System.currentTimeMillis();
            } catch (NumberFormatException e) {
                log.warn("空闲超时配置值格式错误，使用默认值: {}", configValue);
                cachedIdleTimeoutMs.set(DEFAULT_IDLE_TIMEOUT_MS);
            }
        }
        log.info("系统配置已更新: {} = {}", configKey, configValue);
    }

    /** 从数据库加载空闲超时配置并刷新缓存 */
    private synchronized void loadIdleTimeoutFromDb() {
        // 双重检查，避免并发重复加载
        if (System.currentTimeMillis() - lastLoadTime <= CACHE_TTL_MS) {
            return;
        }
        try {
            String value = getConfigValue(KEY_IDLE_TIMEOUT);
            if (value != null) {
                cachedIdleTimeoutMs.set(Long.parseLong(value));
            } else {
                // DB 中无记录，使用默认值并写入 DB
                cachedIdleTimeoutMs.set(DEFAULT_IDLE_TIMEOUT_MS);
                SysConfig config = new SysConfig();
                config.setConfigKey(KEY_IDLE_TIMEOUT);
                config.setConfigValue(String.valueOf(DEFAULT_IDLE_TIMEOUT_MS));
                config.setDescription("会话空闲超时时间（毫秒）");
                try {
                    sysConfigMapper.insert(config);
                } catch (Exception e) {
                    // 并发初始化时可能已存在，忽略或回退更新
                    log.warn("初始化空闲超时配置插入失败，回退更新: {}", e.getMessage());
                    sysConfigMapper.update(null,
                            new LambdaUpdateWrapper<SysConfig>()
                                    .eq(SysConfig::getConfigKey, KEY_IDLE_TIMEOUT)
                                    .set(SysConfig::getConfigValue, String.valueOf(DEFAULT_IDLE_TIMEOUT_MS)));
                }
                log.info("初始化空闲超时配置到 DB: {} ms", DEFAULT_IDLE_TIMEOUT_MS);
            }
            lastLoadTime = System.currentTimeMillis();
        } catch (Exception e) {
            log.warn("从 DB 加载空闲超时配置失败，使用缓存值: {}", e.getMessage());
        }
    }
}
