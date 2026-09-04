package com.mftb.admin.service;

/**
 * 系统配置服务
 * 提供通用的 key-value 配置读取与更新能力，配置值持久化到 sys_config 表
 * 高频读取场景内置内存缓存（5 分钟自动刷新）
 */
public interface SysConfigService {

    /** 默认空闲超时常量（毫秒），60 分钟 — 与原有环境变量默认值保持一致 */
    long DEFAULT_IDLE_TIMEOUT_MS = 3600000L;

    /**
     * 获取会话空闲超时时间（毫秒）
     * 带内存缓存，5 分钟内直接返回缓存值
     */
    long getSessionIdleTimeoutMs();

    /**
     * 获取广告点击加购锁定时长（秒）
     * 规则配置页「广告销售规则」中配置，存于 sys_config（key=ad_click_cart_lock_seconds）；
     * 未配置或格式非法时返回默认 60 秒
     */
    long getAdClickCartLockSeconds();

    /**
     * 读取指定 key 的配置值
     *
     * @param configKey 配置项标识
     * @return 配置值字符串，不存在时返回 null
     */
    String getConfigValue(String configKey);

    /**
     * 读取指定 key 的配置值（带 5 分钟内存缓存，供高频读取场景使用，如 LLM 计价）
     *
     * @param configKey 配置项标识
     * @return 配置值字符串，不存在时返回 null；updateConfig 后立即失效
     */
    String getConfigValueCached(String configKey);

    /**
     * 更新配置值（同时刷新内存缓存）
     *
     * @param configKey   配置项标识
     * @param configValue 新值
     */
    void updateConfig(String configKey, String configValue);
}
