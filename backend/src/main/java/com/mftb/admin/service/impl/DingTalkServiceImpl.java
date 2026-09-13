package com.mftb.admin.service.impl;

import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.SysConfigService;
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
 * 发送失败仅 log.error 不抛异常，避免影响主业务流程
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DingTalkServiceImpl implements DingTalkService {

    private static final String CONFIG_WEBHOOK = "dingtalk_webhook_url";
    private static final String CONFIG_SECRET = "dingtalk_secret";
    private static final String CONFIG_ENABLED = "dingtalk_enabled";
    private static final String CONFIG_AT_MOBILES = "dingtalk_at_mobiles";

    private final SysConfigService sysConfigService;
    private final RestTemplate restTemplate;

    @Override
    @Async
    public void sendText(String content, List<String> atMobiles, boolean isAtAll) {
        if (!isEnabled()) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, String> text = new HashMap<>();
        text.put("content", content);
        body.put("text", text);
        body.put("at", buildAt(atMobiles, isAtAll));

        doPost(body);
    }

    @Override
    @Async
    public void sendMarkdown(String title, String text, List<String> atMobiles, boolean isAtAll) {
        if (!isEnabled()) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "markdown");
        Map<String, String> markdown = new HashMap<>();
        markdown.put("title", title);
        markdown.put("text", text);
        body.put("markdown", markdown);
        body.put("at", buildAt(atMobiles, isAtAll));

        doPost(body);
    }

    @Override
    @Async
    public void sendActionCard(String title, String text, String singleTitle, String singleURL) {
        if (!isEnabled()) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "actionCard");
        Map<String, String> actionCard = new HashMap<>();
        actionCard.put("title", title);
        actionCard.put("text", text);
        actionCard.put("singleTitle", singleTitle);
        actionCard.put("singleURL", singleURL);
        actionCard.put("btnOrientation", "0");
        body.put("actionCard", actionCard);

        doPost(body);
    }

    @Override
    public boolean isEnabled() {
        String enabled = sysConfigService.getConfigValueCached(CONFIG_ENABLED);
        String webhook = sysConfigService.getConfigValueCached(CONFIG_WEBHOOK);
        return "true".equalsIgnoreCase(enabled) && StringUtils.hasText(webhook);
    }

    @Override
    public String sendTestMessage(String webhook, String secret) {
        // 优先使用前端传入的值，为空则回退到数据库配置
        if (!StringUtils.hasText(webhook)) {
            webhook = sysConfigService.getConfigValue(CONFIG_WEBHOOK);
        }
        if (!StringUtils.hasText(webhook)) {
            return "Webhook 地址未配置，請先在通知渠道配置中填寫釘釘機器人 Webhook 地址";
        }
        // secret 为空或为脱敏值时从数据库读取
        if (!StringUtils.hasText(secret) || secret.contains("****")) {
            secret = sysConfigService.getConfigValue(CONFIG_SECRET);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, String> text = new HashMap<>();
        text.put("content", "MFTB 管理後台釘釘通知測試消息 — 如果您收到此消息，說明釘釘機器人配置成功！");
        body.put("text", text);

        try {
            String url = buildSignedUrlWith(webhook, secret);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(url, body, Map.class);
            if (response != null && Integer.valueOf(0).equals(response.get("errcode"))) {
                return "測試消息發送成功，請查看釘釘群";
            } else {
                String errMsg = response != null ? String.valueOf(response.get("errmsg")) : "未知錯誤";
                return "發送失敗: " + errMsg;
            }
        } catch (Exception e) {
            log.error("钉钉测试消息发送失败", e);
            return "發送失敗: " + e.getMessage();
        }
    }

    /* ==================== 内部方法 ==================== */

    private void doPost(Map<String, Object> body) {
        try {
            String url = buildSignedUrl();
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
     * 签名算法: timestamp + "\n" + secret → HmacSHA256 → Base64 → URL-encode
     */
    private String buildSignedUrl() {
        String webhook = sysConfigService.getConfigValueCached(CONFIG_WEBHOOK);
        String secret = sysConfigService.getConfigValueCached(CONFIG_SECRET);

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
     * 构建带签名的 Webhook URL（使用指定参数）
     */
    private String buildSignedUrlWith(String webhook, String secret) {
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

    private Map<String, Object> buildAt(List<String> atMobiles, boolean isAtAll) {
        Map<String, Object> at = new HashMap<>();
        at.put("isAtAll", isAtAll);
        if (atMobiles != null && !atMobiles.isEmpty()) {
            at.put("atMobiles", atMobiles);
        } else if (!isAtAll) {
            // 使用默认 @手机号
            String defaultMobiles = sysConfigService.getConfigValueCached(CONFIG_AT_MOBILES);
            if (StringUtils.hasText(defaultMobiles)) {
                at.put("atMobiles", Arrays.asList(defaultMobiles.split(",")));
            }
        }
        return at;
    }
}
