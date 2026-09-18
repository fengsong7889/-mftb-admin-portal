package com.mftb.admin.service;

/**
 * 钉钉企业内部应用服务
 * 负责获取 access_token、按 userId 定向发送工作通知
 * 配置读取 sys_config：dingtalk_app_key / dingtalk_app_secret / dingtalk_agent_id
 */
public interface DingTalkAppService {

    String APP_KEY = "dingtalk_app_key";
    String APP_SECRET = "dingtalk_app_secret";
    String AGENT_ID = "dingtalk_agent_id";
    String BASE_URL = "dingtalk_notify_base_url";
    String SIGN_SECRET = "dingtalk_sign_token_secret";
    java.util.List<String> APP_CONFIG_KEYS = java.util.List.of(APP_KEY, APP_SECRET, AGENT_ID, BASE_URL, SIGN_SECRET);

    /** 保存事务提交后失效 token 缓存 */
    void invalidateAccessToken();

    /** 使用已保存凭证重新获取 token；仅校验连接，不发送消息、不返回 token */
    void testConnection();

    /**
     * 是否已配置企业内部应用（app_key/app_secret/agent_id 均非空）
     */
    boolean isConfigured();

    /**
     * 发送工作通知（异步）
     *
     * @param userIds 接收人的钉钉 userId 列表（最多 20 个）
     * @param title   通知标题
     * @param content 通知正文（纯文本）
     * @return 是否成功提交发送
     */
    java.util.concurrent.CompletableFuture<Boolean> sendWorkNotification(java.util.List<String> userIds, String title, String content);
}
