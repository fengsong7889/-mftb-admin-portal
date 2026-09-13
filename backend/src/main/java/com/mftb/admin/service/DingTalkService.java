package com.mftb.admin.service;

import java.util.List;

/**
 * 钉钉机器人通知服务
 * 通过自定义机器人 Webhook 向钉钉群发送消息，支持 text / markdown / actionCard 三种格式
 * 配置项存储在 sys_config 表（dingtalk_webhook_url / dingtalk_secret / dingtalk_enabled）
 */
public interface DingTalkService {

    /**
     * 发送纯文本消息
     *
     * @param content  消息内容
     * @param atMobiles @手机号列表（可为 null）
     * @param isAtAll  是否 @所有人
     */
    void sendText(String content, List<String> atMobiles, boolean isAtAll);

    /**
     * 发送 Markdown 消息（推荐，排版美观）
     *
     * @param title    消息标题（在通知栏显示）
     * @param text     Markdown 格式正文
     * @param atMobiles @手机号列表（可为 null）
     * @param isAtAll  是否 @所有人
     */
    void sendMarkdown(String title, String text, List<String> atMobiles, boolean isAtAll);

    /**
     * 发送 ActionCard 卡片消息（带一个跳转按钮）
     *
     * @param title       卡片标题
     * @param text        Markdown 格式正文
     * @param singleTitle 按钮文案
     * @param singleURL   按钮跳转链接
     */
    void sendActionCard(String title, String text, String singleTitle, String singleURL);

    /**
     * 判断钉钉通知是否已启用（webhook 已配置且开关打开）
     */
    boolean isEnabled();

    /**
     * 发送测试消息（供前端「发送测试消息」按钮调用）
     * 优先使用传入的 webhook/secret，为空则回退到数据库配置
     *
     * @param webhook 前端表单中的 Webhook 地址（可为 null）
     * @param secret  前端表单中的加签密钥（可为 null）
     * @return 发送结果描述
     */
    String sendTestMessage(String webhook, String secret);
}
