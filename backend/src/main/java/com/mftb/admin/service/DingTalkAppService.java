package com.mftb.admin.service;

/**
 * 钉钉企业内部应用服务
 * 负责获取 access_token、按 userId 定向发送工作通知
 * 通过独立应用记录和场景路由发送，旧 sys_config 凭据仅用于迁移
 */
public interface DingTalkAppService {

    String APP_KEY = "dingtalk_app_key";
    String APP_SECRET = "dingtalk_app_secret";
    String AGENT_ID = "dingtalk_agent_id";
    String BASE_URL = "dingtalk_notify_base_url";
    String SIGN_SECRET = "dingtalk_sign_token_secret";
    java.util.List<String> APP_CONFIG_KEYS = java.util.List.of(APP_KEY, APP_SECRET, AGENT_ID, BASE_URL, SIGN_SECRET);

    /** 使用指定应用已保存的凭证校验连接，不发送消息、不返回 token。 */
    void testConnection(long appId);

    /**
     * 发送工作通知（异步）
     *
     * @param userIds 接收人的钉钉 userId 列表（最多 20 个）
     * @param title   通知标题
     * @param content 通知正文（纯文本）
     * @return 是否成功提交发送
     */
    java.util.concurrent.CompletableFuture<Boolean> sendWorkNotification(String scenario, long appId,
            java.util.List<String> userIds, String title, String content);
}
