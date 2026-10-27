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
     * V0 §八 V0-6：同步发送文本消息（不走 @Async），返回渠道实际受理状态。
     * 供 AI 通知工具 handler 使用；业务通知继续走 {@link #sendText} 保持异步非阻塞。
     */
    SendOutcome sendTextSync(String scenario, String content, java.util.List<String> atMobiles, boolean isAtAll);

    /** V0 §八 V0-6：同步发送 Markdown 消息，返回渠道实际受理状态。 */
    SendOutcome sendMarkdownSync(String scenario, String title, String text, java.util.List<String> atMobiles, boolean isAtAll);

    /**
     * 同步发送群机器人 ActionCard 卡片（带一个整体跳转按钮），返回渠道受理状态。
     *
     * <p><b>为何不用 {@link #sendActionCard}</b>：那个是发完就忘的异步方法，没有结果；
     * 日报走 outbox，必须知道渠道是否真的受理，否则无法决定重试还是放弃。
     *
     * <p><b>与工作通知 action_card 的差异</b>：群机器人正文键是 {@code text}、按钮是驼峰
     * {@code singleTitle/singleURL}；工作通知则是 {@code markdown} 与下划线 {@code single_title/single_url}。
     * 两套协议不能复用同一个 body 构造器。
     *
     * <p>ActionCard 不支持 @ 指定人，故不接收 atMobiles。
     *
     * @param text       Markdown 正文（群机器人卡片建议 ≤ 1000 字符，过长会发送失败）
     * @param singleTitle 按钮文案（≤ 20 字符）
     * @param singleURL   按钮跳转地址（≤ 500 字符）
     */
    SendOutcome sendActionCardSync(String scenario, String title, String text, String singleTitle,
                                   String singleURL);

    /**
     * 按渠道 id 精确同步发送 Markdown，返回渠道受理状态。
     *
     * <p>与 {@link #sendMarkdownSync} 的区别是存在意义：场景路由拿不到目标时**会回退到平台默认渠道**，
     * 而会议纪要是要把内部结论发进一个具体的群——回退等于把纪要发进一个谁都没确认过的群。
     * 因此本方法不解析场景、也不拿任何默认渠道兜底：渠道不存在、未启用或不是钉钉，一律返回未受理。
     *
     * @param channelId 通知渠道 id（前端可选，服务端必须复核）
     */
    SendOutcome sendMarkdownSyncToChannel(long channelId, String title, String text,
                                          java.util.List<String> atMobiles, boolean isAtAll);

    /** 同步发送的返回：channelAccepted=钉钉侧是否返回 errcode=0 */
    record SendOutcome(boolean channelAccepted, String errcode, String errmsg, String channelName) {
        public static SendOutcome accepted(String channelName) { return new SendOutcome(true, "0", "ok", channelName); }
        public static SendOutcome rejected(String errcode, String errmsg, String channelName) { return new SendOutcome(false, errcode, errmsg, channelName); }
        public static SendOutcome unknown(String reason) { return new SendOutcome(false, "UNKNOWN", reason, null); }
    }

    /**
     * 发送测试消息（使用指定渠道的 webhook/secret）
     *
     * @param channelId 通知渠道 ID
     * @return 发送结果描述
     */
    String sendTestMessage(Long channelId);
}
