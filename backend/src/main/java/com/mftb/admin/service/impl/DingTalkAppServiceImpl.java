package com.mftb.admin.service.impl;

import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.service.NotificationAppService.Credentials;
import com.mftb.admin.common.BusinessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
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

    private final NotificationAppService appService;
    private final RestTemplate restTemplate;

    /** 按应用隔离缓存；凭据变更和跨实例更新在读取时自动识别。 */
    private final Map<Long, CachedToken> tokens = new java.util.concurrent.ConcurrentHashMap<>();

    @Override
    public void testConnection(long appId) {
        Credentials app = appService.credentials(appId, false);
        // 始终访问钉钉验证已保存凭证，不使用旧缓存，也不向客户端返回 token。
        requestAccessToken(app.getAppKey(), app.getAppSecret());
    }

    /* ==================== 对外接口 ==================== */

    @Override
    @Async
    public CompletableFuture<Boolean> sendWorkNotification(String scenario, long appId, List<String> userIds, String title, String content) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("钉钉工作通知未发送：接收人列表为空");
            return CompletableFuture.completedFuture(false);
        }
        try {
            Credentials app = appService.resolve(scenario);
            // 排队期间停用或改绑时不发送，且不回退到任何默认应用。
            if (app == null || app.getId() != appId) return CompletableFuture.completedFuture(false);
            appService.requireComplete(app);
            String token = getAccessToken(app);
            if (token == null) return CompletableFuture.completedFuture(false);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("agent_id", Long.parseLong(app.getAgentId()));
            body.put("userid_list", String.join(",", userIds));
            Map<String, Object> msg = new LinkedHashMap<>();
            msg.put("msgtype", "markdown");
            Map<String, String> markdown = new LinkedHashMap<>();
            markdown.put("title", title);
            markdown.put("text", content);
            msg.put("markdown", markdown);
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
    private synchronized String getAccessToken(Credentials app) {
        long now = System.currentTimeMillis();
        tokens.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
        CachedToken cached = tokens.get(app.getId());
        if (cached != null && Objects.equals(app.getAppKey(), cached.appKey)
                && Objects.equals(app.getAppSecret(), cached.appSecret)) return cached.token;
        try {
            TokenGrant grant = requestAccessToken(app.getAppKey(), app.getAppSecret());
            tokens.put(app.getId(), new CachedToken(app.getAppKey(), app.getAppSecret(), grant.token(),
                    now + Math.max(0, grant.expiresIn() - 300) * 1000L));
            return grant.token();
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

    @RequiredArgsConstructor
    private static final class CachedToken {
        private final String appKey;
        private final String appSecret;
        private final String token;
        private final long expiresAt;
    }
}
