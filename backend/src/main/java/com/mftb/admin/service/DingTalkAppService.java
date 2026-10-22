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

    /**
     * 发送工作通知卡片（action_card，异步）。
     *
     * <p><b>与 markdown 的差别不是“好看”而是信息密度</b>：工作通知的 markdown 是一段长文本，
     * 手机上一屏只能看到前几行；卡片有独立标题区与底部按钮，读者能先看到结论、再决定是否点进详情。
     *
     * <p><b>字段是工作通知协议</b>：正文 {@code markdown}、按钮 {@code single_title/single_url}（下划线），
     * 与群机器人卡片的 {@code text/singleTitle/singleURL} 不同。
     *
     * @param markdown 卡片正文（钉钉建议 ≤ 1000 字符，超出易被折叠）
     * @param btnTitle 按钮文案（≤ 20 字符）
     * @param btnUrl   按钮跳转地址（≤ 500 字符）
     */
    java.util.concurrent.CompletableFuture<Boolean> sendWorkActionCard(String scenario, long appId,
            java.util.List<String> userIds, String title, String markdown, String btnTitle, String btnUrl);

    /**
     * 用指定应用的凭证调用钉钉服务端 API（企业内部应用 topapi）。
     * <p>access_token 由实现内部获取与缓存，**不向调用方返回**，避免凭据在业务层与日志里扩散。
     * <p>apiPath 必须是白名单形态（{@code topapi/} 开头的相对路径），不接受外部拼接完整 URL，
     * 否则这个口子会变成 SSRF。
     *
     * @return 钉钉原始响应（已确认 errcode=0）
     * @throws com.mftb.admin.common.BusinessException 凭据不可用、网络失败或 errcode 非 0；消息不回显 token 与原始 URL
     */
    java.util.Map<String, Object> callApi(long appId, String apiPath, java.util.Map<String, Object> body);
}
