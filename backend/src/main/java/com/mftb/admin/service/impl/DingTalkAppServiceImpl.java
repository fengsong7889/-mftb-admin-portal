package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.common.BusinessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
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
    private String cachedAppKey;
    private String cachedAppSecret;

    @Override
    public synchronized void invalidateAccessToken() {
        cachedAccessToken = null;
        tokenExpireAt = 0;
        cachedAppKey = null;
        cachedAppSecret = null;
    }

    @Override
    public void testConnection() {
        if (!isConfigured()) throw new BusinessException(400, "請先保存完整的企業內部應用配置");
        // 始终访问钉钉验证已保存凭证，不使用旧缓存，也不向客户端返回 token。
        requestAccessToken(getConfig(APP_KEY), getConfig(APP_SECRET));
    }

    /* ==================== 对外接口 ==================== */

    @Override
    public boolean isConfigured() {
        return StringUtils.hasText(getConfig("dingtalk_app_key"))
                && StringUtils.hasText(getConfig("dingtalk_app_secret"))
                && StringUtils.hasText(getConfig("dingtalk_agent_id"));
    }

    @Override
    @Async
    public CompletableFuture<Boolean> sendWorkNotification(List<String> userIds, String title, String content) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("钉钉工作通知未发送：接收人列表为空");
            return CompletableFuture.completedFuture(false);
        }
        if (!isConfigured()) {
            log.warn("钉钉工作通知未发送：企业内部应用未配置（sys_config 缺少 dingtalk_app_key/app_secret/agent_id）");
            return CompletableFuture.completedFuture(false);
        }
        try {
            String token = getAccessToken();
            if (token == null) return CompletableFuture.completedFuture(false);

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
                return CompletableFuture.completedFuture(true);
            }
            log.warn("钉钉工作通知发送失败: errcode={}", response != null ? response.get("errcode") : "empty");
            return CompletableFuture.completedFuture(false);
        } catch (Exception e) {
            log.error("钉钉工作通知发送异常: {}", e.getClass().getSimpleName());
            return CompletableFuture.completedFuture(false);
        }
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 获取 access_token（带内存缓存，过期前 5 分钟自动刷新）
     */
    private synchronized String getAccessToken() {
        long now = System.currentTimeMillis();
        String appKey = getConfig(APP_KEY);
        String appSecret = getConfig(APP_SECRET);
        // 除本实例保存后失效外，也识别其他实例修改的凭证，避免沿用旧应用 token。
        if (cachedAccessToken != null && now < tokenExpireAt
                && Objects.equals(appKey, cachedAppKey) && Objects.equals(appSecret, cachedAppSecret)) {
            return cachedAccessToken;
        }
        try {
            TokenGrant grant = requestAccessToken(appKey, appSecret);
            cachedAccessToken = grant.token();
            cachedAppKey = appKey;
            cachedAppSecret = appSecret;
            tokenExpireAt = now + Math.max(0, grant.expiresIn() - 300) * 1000L;
            return cachedAccessToken;
        } catch (BusinessException e) {
            log.warn("获取钉钉 access_token 失败: {}", e.getMessage());
            return null;
        }
    }

    private TokenGrant requestAccessToken(String appKey, String appSecret) {
        if (!StringUtils.hasText(appKey) || !StringUtils.hasText(appSecret)) {
            throw new BusinessException(400, "請先保存 AppKey 和 AppSecret");
        }
        try {
            var uri = UriComponentsBuilder.fromHttpUrl("https://oapi.dingtalk.com/gettoken")
                    .queryParam("appkey", "{key}").queryParam("appsecret", "{secret}")
                    .encode().buildAndExpand(appKey, appSecret).toUri();
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.getForObject(uri, Map.class);
            if (response == null) throw new BusinessException(400, "釘釘返回空響應，請稍後重試");
            if (!(response.get("errcode") instanceof Number code) || code.longValue() != 0) {
                long errorCode = response.get("errcode") instanceof Number number ? number.longValue() : -1;
                String hint = errorCode == 40096 ? "AppKey 或 AppSecret 不正確" : "請檢查應用憑證、權限及出口 IP 白名單";
                throw new BusinessException(400, "釘釘連接失敗（錯誤碼 " + errorCode + "）：" + hint);
            }
            if (!(response.get("access_token") instanceof String token) || !StringUtils.hasText(token)) {
                throw new BusinessException(400, "釘釘未返回有效 access_token，請稍後重試");
            }
            long expiresIn = response.get("expires_in") instanceof Number number ? number.longValue() : 7200;
            return new TokenGrant(token, expiresIn);
        } catch (RestClientException e) {
            // HTTP 异常可能含带密钥的请求 URL，不能记录原异常或回传原文。
            log.warn("钉钉连接异常: {}", e.getClass().getSimpleName());
            throw new BusinessException(400, "無法連接釘釘服務，請檢查網絡後重試");
        }
    }

    private record TokenGrant(String token, long expiresIn) { }

    private String getConfig(String key) {
        SysConfig config = sysConfigMapper.selectOne(
                new LambdaQueryWrapper<SysConfig>().eq(SysConfig::getConfigKey, key));
        return config != null ? config.getConfigValue() : null;
    }
}
