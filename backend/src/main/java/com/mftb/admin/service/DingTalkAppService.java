package com.mftb.admin.service;

/**
 * 钉钉企业内部应用服务
 * 负责获取 access_token、按 userId 定向发送工作通知
 * 配置读取 sys_config：dingtalk_app_key / dingtalk_app_secret / dingtalk_agent_id
 */
public interface DingTalkAppService {

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
    boolean sendWorkNotification(java.util.List<String> userIds, String title, String content);
}
