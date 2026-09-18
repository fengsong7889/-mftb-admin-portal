package com.mftb.admin.service;

import java.util.List;

/**
 * 钉钉机器人通知服务
 * 通过自定义机器人 Webhook 向钉钉群发送消息，支持 text / markdown / actionCard 三种格式
 * 配置项从 sys_notification_channel 表按场景路由读取
 */
public interface DingTalkService {

    /**
     * 发送纯文本消息（按场景路由）
     *
     * @param scenario 场景标识（如 oa_approval / ai_assistant / general）
     * @param content  消息内容
     * @param atMobiles @手机号列表（可为 null）
     * @param isAtAll  是否 @所有人
     */
    void sendText(String scenario, String content, List<String> atMobiles, boolean isAtAll);

    /**
     * 发送 Markdown 消息（按场景路由，推荐）
     *
     * @param scenario 场景标识
     * @param title    消息标题
     * @param text     Markdown 格式正文
     * @param atMobiles @手机号列表（可为 null）
     * @param isAtAll  是否 @所有人
     */
    void sendMarkdown(String scenario, String title, String text, List<String> atMobiles, boolean isAtAll);

    /**
     * 发送 ActionCard 卡片消息（按场景路由）
     *
     * @param scenario    场景标识
     * @param title       卡片标题
     * @param text        Markdown 格式正文
     * @param singleTitle 按钮文案
     * @param singleURL   按钮跳转链接
     */
    void sendActionCard(String scenario, String title, String text, String singleTitle, String singleURL);

    /**
     * 发送纯文本消息（兼容旧调用，走 general 场景）
     */
    default void sendText(String content, List<String> atMobiles, boolean isAtAll) {
        sendText("general", content, atMobiles, isAtAll);
    }

    /**
     * 发送 Markdown 消息（兼容旧调用，走 general 场景）
     */
    default void sendMarkdown(String title, String text, List<String> atMobiles, boolean isAtAll) {
        sendMarkdown("general", title, text, atMobiles, isAtAll);
    }

    /**
     * 发送 ActionCard 消息（兼容旧调用，走 general 场景）
     */
    default void sendActionCard(String title, String text, String singleTitle, String singleURL) {
        sendActionCard("general", title, text, singleTitle, singleURL);
    }

    /**
     * 判断钉钉通知是否已启用（至少有一个已启用的 dingtalk 渠道）
     */
    boolean isEnabled();

    /**
     * 发送测试消息（使用指定渠道的 webhook/secret）
     *
     * @param channelId 通知渠道 ID
     * @return 发送结果描述
     */
    String sendTestMessage(Long channelId);
}
