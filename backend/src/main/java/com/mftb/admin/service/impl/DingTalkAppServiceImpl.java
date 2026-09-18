package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.service.DingTalkAppService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 钉钉企业内部应用服务实现
 * 通过钉钉服务端 API 获取 access_token，并向指定 userId 定向发送工作通知
 * 发送失败仅 log.warn 不抛异常，避免影响主业务流程
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DingTalkAppServiceImpl implements DingTalkAppService {

    private final SysConfigMapper sysConfigMapper;
    private final RestTemplate restTemplate;

    /** access_token 缓存（钉钉有效期 2 小时，提前 5 分钟刷新） */
    private volatile String cachedAccessToken;
    private volatile long tokenExpireAt = 0;

    /* ==================== 对外接口 ==================== */

    @Override
    public boolean isConfigured() {
        return StringUtils.hasText(getConfig("dingtalk_app_key"))
                && StringUtils.hasText(getConfig("dingtalk_app_secret"))
                && StringUtils.hasText(getConfig("dingtalk_agent_id"));
    }

    @Override
    @Async
    public boolean sendWorkNotification(List<String> userIds, String title, String content) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("钉钉工作通知未发送：接收人列表为空");
            return false;
        }
        if (!isConfigured()) {
            log.warn("钉钉工作通知未发送：企业内部应用未配置（sys_config 缺少 dingtalk_app_key/app_secret/agent_id）");
            return false;
        }
        try {
            String token = getAccessToken();
            if (token == null) return false;

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("agent_id", Long.parseLong(getConfig("dingtalk_agent_id")));
            body.put("userid_list", String.join(",", userIds));
            Map<String, Object> msg = new LinkedHashMap<>();
            msg.put("msgtype", "text");
            Map<String, String> text = new LinkedHashMap<>();
            text.put("content", title + "\n" + content);
            msg.put("text", text);
            body.put("msg", msg);

            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(
                    "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token,
                    body, Map.class);
            if (response != null && Integer.valueOf(0).equals(response.get("errcode"))) {
                log.info("钉钉工作通知已发送: title={}, users={}", title, userIds.size());
                return true;
            }
            log.warn("钉钉工作通知发送失败: {}", response);
            return false;
        } catch (Exception e) {
            log.error("钉钉工作通知发送异常: {}", e.getMessage(), e);
            return false;
        }
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 获取 access_token（带内存缓存，过期前 5 分钟自动刷新）
     */
    private synchronized String getAccessToken() {
        long now = System.currentTimeMillis();
        if (cachedAccessToken != null && now < tokenExpireAt) {
            return cachedAccessToken;
        }
        try {
            String url = "https://oapi.dingtalk.com/gettoken?appkey=" + getConfig("dingtalk_app_key")
                    + "&appsecret=" + getConfig("dingtalk_app_secret");
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            if (response != null && Integer.valueOf(0).equals(response.get("errcode"))) {
                cachedAccessToken = String.valueOf(response.get("access_token"));
                // expires_in 秒，提前 5 分钟刷新
                Integer expiresIn = (Integer) response.get("expires_in");
                tokenExpireAt = now + (expiresIn != null ? expiresIn : 7200) * 1000L - 5 * 60 * 1000L;
                return cachedAccessToken;
            }
            log.error("获取钉钉 access_token 失败: {}", response);
            return null;
        } catch (Exception e) {
            log.error("获取钉钉 access_token 异常: {}", e.getMessage(), e);
            return null;
        }
    }

    private String getConfig(String key) {
        SysConfig config = sysConfigMapper.selectOne(
                new LambdaQueryWrapper<SysConfig>().eq(SysConfig::getConfigKey, key));
        return config != null ? config.getConfigValue() : null;
    }
}
