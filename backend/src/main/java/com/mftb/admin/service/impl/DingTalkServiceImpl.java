package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.NotificationChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 钉钉机器人通知服务实现
 * 通过 RestTemplate 向钉钉自定义机器人 Webhook 发送消息
 * 配置从 sys_notification_channel 表按场景路由读取
 * 发送失败仅 log.error 不抛异常，避免影响主业务流程
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DingTalkServiceImpl implements DingTalkService {

    private final NotificationChannelService notificationChannelService;
    private final SysNotificationChannelMapper channelMapper;
    private final RestTemplate restTemplate;

    @Override
    @Async
    public void sendText(String scenario, String content, List<String> atMobiles, boolean isAtAll) {
        SysNotificationChannel channel = resolveChannel(scenario);
        if (channel == null) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, String> text = new HashMap<>();
        text.put("content", content);
        body.put("text", text);
        body.put("at", buildAt(channel, atMobiles, isAtAll));

        doPost(channel, body);
    }

    @Override
    @Async
    public void sendMarkdown(String scenario, String title, String text, List<String> atMobiles, boolean isAtAll) {
        SysNotificationChannel channel = resolveChannel(scenario);
        if (channel == null) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "markdown");
        Map<String, String> markdown = new HashMap<>();
        markdown.put("title", title);
        markdown.put("text", text);
        body.put("markdown", markdown);
        body.put("at", buildAt(channel, atMobiles, isAtAll));

        doPost(channel, body);
    }

    @Override
    @Async
    public void sendActionCard(String scenario, String title, String text, String singleTitle, String singleURL) {
        SysNotificationChannel channel = resolveChannel(scenario);
        if (channel == null) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "actionCard");
        Map<String, String> actionCard = new HashMap<>();
        actionCard.put("title", title);
        actionCard.put("text", text);
        actionCard.put("singleTitle", singleTitle);
        actionCard.put("singleURL", singleURL);
        actionCard.put("btnOrientation", "0");
        body.put("actionCard", actionCard);

        doPost(channel, body);
    }

    @Override
    public boolean isEnabled() {
        // 至少有一个已启用的 dingtalk 渠道
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysNotificationChannel::getChannel, "dingtalk")
               .eq(SysNotificationChannel::getEnabled, 1);
        return channelMapper.selectCount(wrapper) > 0;
    }

    @Override
    public String sendTestMessage(Long channelId) {
        return notificationChannelService.sendTest(channelId);
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 按场景解析渠道：先按场景查找 → 回退到平台默认渠道
     */
    private SysNotificationChannel resolveChannel(String scenario) {
        // 1. 按场景查找
        SysNotificationChannel channel = notificationChannelService.findByScenario(scenario);
        if (channel != null) return channel;

        // 2. 回退到平台默认渠道
        channel = notificationChannelService.findDefault("dingtalk");
        if (channel == null) {
            log.debug("钉钉通知未发送：未找到场景 [{}] 的渠道且无默认渠道", scenario);
            return null;
        }
        if (channel.getEnabled() == null || channel.getEnabled() != 1) {
            log.debug("钉钉通知未发送：默认渠道未启用");
            return null;
        }
        return channel;
    }

    private void doPost(SysNotificationChannel channel, Map<String, Object> body) {
        try {
            String url = buildSignedUrl(channel.getWebhookUrl(), channel.getSecret());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(url, body, Map.class);
            if (response != null) {
                Integer errcode = (Integer) response.get("errcode");
                if (errcode != null && errcode != 0) {
                    log.warn("钉钉消息发送失败: errcode={}, errmsg={}", errcode, response.get("errmsg"));
                }
            }
        } catch (Exception e) {
            log.error("钉钉消息发送异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 构建带签名的 Webhook URL
     */
    private String buildSignedUrl(String webhook, String secret) {
        if (!StringUtils.hasText(secret)) {
            return webhook;
        }
        try {
            long timestamp = System.currentTimeMillis();
            String stringToSign = timestamp + "\n" + secret;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signData = mac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8));
            String sign = URLEncoder.encode(Base64.getEncoder().encodeToString(signData), StandardCharsets.UTF_8);
            return webhook + "&timestamp=" + timestamp + "&sign=" + sign;
        } catch (Exception e) {
            log.error("钉钉签名计算失败，使用无签名 URL: {}", e.getMessage());
            return webhook;
        }
    }

    /**
     * 构建 @人信息，合并渠道默认手机号和调用方传入的手机号
     */
    private Map<String, Object> buildAt(SysNotificationChannel channel, List<String> atMobiles, boolean isAtAll) {
        Map<String, Object> at = new HashMap<>();
        at.put("isAtAll", isAtAll);
        Set<String> merged = new LinkedHashSet<>();
        // 渠道默认 @手机号
        if (StringUtils.hasText(channel.getAtMobiles())) {
            for (String m : channel.getAtMobiles().split(",")) {
                if (StringUtils.hasText(m)) merged.add(m.trim());
            }
        }
        // 调用方额外 @手机号
        if (atMobiles != null) {
            merged.addAll(atMobiles);
        }
        if (!merged.isEmpty() && !isAtAll) {
            at.put("atMobiles", new ArrayList<>(merged));
        }
        return at;
    }
}
