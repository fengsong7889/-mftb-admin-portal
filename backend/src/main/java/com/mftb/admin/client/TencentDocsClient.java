package com.mftb.admin.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.mftb.admin.common.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 騰訊文檔開放平台 OpenAPI 客戶端（drive v2 只讀子集）。
 * <p>憑據經環境變量注入（backend/.env.local 的 TENCENT_DOCS_*），任何受版本控制文件禁止明文凭据；
 * 異常消息只透出接口級錯誤描述，不回顯 token。
 * <p>配額約束：個人開發者 2000 次/天，本客戶端只服務於「目錄低頻同步 + 按需查詢」，
 * 嚴禁引入正文級輪詢；access_token 有效期 30 天，過期時接口報明確錯誤並由運維在開放平台重置。
 */
@Slf4j
@Component
public class TencentDocsClient {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${tencent.docs.base-url:https://docs.qq.com}")
    private String baseUrl;

    @Value("${tencent.docs.client-id:}")
    private String clientId;

    @Value("${tencent.docs.access-token:}")
    private String accessToken;

    @Value("${tencent.docs.open-id:}")
    private String openId;

    @Value("${tencent.docs.root-folder-id:}")
    private String rootFolderId;

    /** 憑據是否就緒；未配置時同步/配額接口給出明確提示而不是發必敗請求 */
    public boolean isEnabled() {
        return StringUtils.hasText(clientId) && StringUtils.hasText(accessToken) && StringUtils.hasText(openId);
    }

    public String rootFolderId() {
        return rootFolderId;
    }

    /**
     * 拉取文件夾下的子節點列表。
     * GET /openapi/drive/v2/folders/{folderID}
     */
    public JsonNode listFolder(String folderId) {
        JsonNode data = get("/openapi/drive/v2/folders/" + folderId, "獲取騰訊文檔目錄失敗");
        return data.path("children").isArray() ? data.path("children") : data;
    }

    /**
     * 查詢應用 OpenAPI 用量（配額監控）。
     * GET /openapi/drive/v2/util/resource-use
     */
    public JsonNode resourceUse() {
        return get("/openapi/drive/v2/util/resource-use", "查詢騰訊文檔配額用量失敗");
    }

    private JsonNode get(String path, String fallbackMsg) {
        if (!isEnabled()) {
            throw new BusinessException("騰訊文檔集成未配置，請在 backend/.env.local 設置 TENCENT_DOCS_* 變量後重啟");
        }
        String url = UriComponentsBuilder.fromHttpUrl(baseUrl + path)
                .queryParam("access_token", accessToken)
                .queryParam("caller_id", openId)
                .toUriString();
        JsonNode resp;
        try {
            resp = restTemplate.getForObject(url, JsonNode.class);
        } catch (Exception e) {
            // 不透出上游響應體（可能含 token 回顯），只留異常類型
            log.warn("騰訊文檔 OpenAPI 調用異常: path={}, {}", path, e.getClass().getSimpleName());
            throw new BusinessException(fallbackMsg + "：網絡或憑據異常");
        }
        if (resp == null) {
            throw new BusinessException(fallbackMsg + "：無響應");
        }
        // 開放平台約定 status=0 為成功
        int status = resp.path("status").asInt(-1);
        if (status != 0) {
            String msg = resp.path("msg").asText("");
            log.warn("騰訊文檔 OpenAPI 返回非成功: path={}, status={}, msg={}", path, status, msg);
            throw new BusinessException(msg.isBlank() ? fallbackMsg + "：status=" + status : fallbackMsg + "：" + msg);
        }
        return resp.path("data");
    }
}
