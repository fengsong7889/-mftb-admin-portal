package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 通知渠道配置接口
 * 通用设计：通过 {channel} 路径变量区分不同渠道，后续扩展企微/飞书只需增加分支
 */
@RestController
@RequestMapping("/api/notification-channels")
@RequiredArgsConstructor
public class NotificationChannelController {

    /** 当前支持的渠道列表 */
    private static final Set<String> SUPPORTED_CHANNELS = Set.of("dingtalk", "wecom", "feishu");

    /** 各渠道的 sys_config key 前缀 */
    private static final Map<String, String[]> CHANNEL_CONFIG_KEYS = Map.of(
            "dingtalk", new String[]{
                    "dingtalk_webhook_url", "dingtalk_secret", "dingtalk_enabled", "dingtalk_at_mobiles"
            }
    );

    /** 需要脱敏的 key（返回时只显示前 6 位 + ****） */
    private static final Set<String> SENSITIVE_KEYS = Set.of("dingtalk_secret");

    private final SysConfigService sysConfigService;
    private final DingTalkService dingTalkService;

    /**
     * 读取指定渠道的配置（secret 脱敏返回）
     */
    @GetMapping("/{channel}/config")
    public Result<Map<String, Object>> getConfig(@PathVariable String channel) {
        validateChannel(channel);

        String[] keys = CHANNEL_CONFIG_KEYS.get(channel);
        if (keys == null) {
            return Result.success(Map.of("channel", channel, "configured", false));
        }

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("channel", channel);
        for (String key : keys) {
            String value = sysConfigService.getConfigValue(key);
            if (SENSITIVE_KEYS.contains(key) && value != null && value.length() > 6) {
                value = value.substring(0, 6) + "****";
            }
            // 将 dingtalk_xxx 转为驼峰字段名
            String fieldName = keyToField(key, channel);
            config.put(fieldName, value != null ? value : "");
        }
        return Result.success(config);
    }

    /**
     * 更新指定渠道的配置
     */
    @PutMapping("/{channel}/config")
    public Result<Void> updateConfig(@PathVariable String channel, @RequestBody Map<String, String> body) {
        validateChannel(channel);

        String[] keys = CHANNEL_CONFIG_KEYS.get(channel);
        if (keys == null) {
            return Result.error(400, "渠道 " + channel + " 尚未支持");
        }

        for (String key : keys) {
            String fieldName = keyToField(key, channel);
            String value = body.get(fieldName);
            if (value != null) {
                // 脱敏值不回写（包含 **** 说明前端未修改）
                if (SENSITIVE_KEYS.contains(key) && value.contains("****")) {
                    continue;
                }
                sysConfigService.updateConfig(key, value);
            }
        }
        return Result.success();
    }

    /**
     * 发送测试消息（支持携带当前表单配置，无需先保存）
     */
    @PostMapping("/{channel}/test")
    public Result<String> test(@PathVariable String channel, @RequestBody(required = false) Map<String, String> body) {
        validateChannel(channel);

        if ("dingtalk".equals(channel)) {
            // 优先使用前端传入的表单值，未传则回退到数据库配置
            String webhook = body != null ? body.get("webhookUrl") : null;
            String secret = body != null ? body.get("secret") : null;
            String result = dingTalkService.sendTestMessage(webhook, secret);
            return Result.success(result);
        }

        return Result.error(400, "渠道 " + channel + " 尚未支持测试");
    }

    /* ==================== 内部方法 ==================== */

    private void validateChannel(String channel) {
        if (!SUPPORTED_CHANNELS.contains(channel)) {
            throw new IllegalArgumentException("不支持的通知渠道: " + channel);
        }
    }

    /**
     * 将 sys_config key 转为前端字段名
     * 例: dingtalk_webhook_url → webhookUrl, dingtalk_enabled → enabled
     */
    private String keyToField(String key, String channel) {
        String prefix = channel + "_";
        String remainder = key.startsWith(prefix) ? key.substring(prefix.length()) : key;
        // 下划线转驼峰
        StringBuilder sb = new StringBuilder();
        boolean nextUpper = false;
        for (char c : remainder.toCharArray()) {
            if (c == '_') {
                nextUpper = true;
            } else {
                sb.append(nextUpper ? Character.toUpperCase(c) : c);
                nextUpper = false;
            }
        }
        return sb.toString();
    }
}

