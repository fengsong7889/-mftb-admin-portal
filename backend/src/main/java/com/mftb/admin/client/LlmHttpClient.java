package com.mftb.admin.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.SocketTimeoutException;
import java.util.Map;

/**
 * LLM 专用 HTTP 客户端（OpenAI 兼容 chat/completions）。
 * <p>不复用通用 {@code restTemplate}：那个 bean 的读超时是 10s，为钉钉 Webhook 一类短任务设定；
 * 思考型模型（qwen 系列带 reasoning tokens）单次补全实测 10~30s+，复用短超时会让 AI 问答
 * 全量退化成「AI 服務暫時不可用」。超时阈值走 {@code ai.llm.*} 配置，不在代码里写死。
 * <p>失败以 {@link LlmCallException} 抛出：{@code category} 供调用方映射用户可读文案，
 * {@code getMessage()} 含上游细节仅供日志，禁止回传客户端。
 */
@Slf4j
@Component
public class LlmHttpClient {

    private static final String CHAT_SUFFIX = "/chat/completions";
    /** 日志里截断上游响应体，避免超长/含敏感内容日志 */
    private static final int LOG_BODY_LIMIT = 300;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public LlmHttpClient(ObjectMapper objectMapper,
                         @Value("${ai.llm.connect-timeout-ms:10000}") int connectTimeoutMs,
                         @Value("${ai.llm.read-timeout-ms:120000}") int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeoutMs);
        factory.setReadTimeout(readTimeoutMs);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = objectMapper;
        log.info("LLM HTTP 客户端初始化: connect={}ms, read={}ms", connectTimeoutMs, readTimeoutMs);
    }

    /** 调用 chat/completions 并解析为 JSON；失败抛 {@link LlmCallException}。 */
    public JsonNode chatCompletion(String baseUrl, String apiKey, Map<String, Object> payload) {
        String raw = chatCompletionRaw(baseUrl, apiKey, payload);
        try {
            return objectMapper.readTree(raw);
        } catch (Exception e) {
            throw new LlmCallException(Category.BAD_JSON, null,
                    "上游回應非合法 JSON: " + brief(e.getMessage()));
        }
    }

    /** 调用 chat/completions 并返回原始响应体（网关透传需原样回传的场景使用）。 */
    public String chatCompletionRaw(String baseUrl, String apiKey, Map<String, Object> payload) {
        if (!StringUtils.hasText(baseUrl)) {
            throw new LlmCallException(Category.MISSING_BASE_URL, null, "AI 通道缺少 baseUrl");
        }
        if (!StringUtils.hasText(apiKey)) {
            // 不发无鉴权请求：既省一次上游往返，也让「配置缺失」与「模型故障」在文案上区分开
            throw new LlmCallException(Category.MISSING_KEY, null,
                    "AI 通道未配置 API Key: " + completionsEndpoint(baseUrl));
        }
        String url = completionsEndpoint(baseUrl);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);
        try {
            ResponseEntity<String> resp = restTemplate.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(payload, headers), String.class);
            String body = resp.getBody();
            if (!StringUtils.hasText(body)) {
                throw new LlmCallException(Category.UPSTREAM_HTTP, resp.getStatusCode().value(), "上游回應為空");
            }
            return body;
        } catch (HttpStatusCodeException e) {
            throw new LlmCallException(Category.UPSTREAM_HTTP, e.getStatusCode().value(),
                    "上游 HTTP " + e.getStatusCode().value() + ": " + brief(e.getResponseBodyAsString()));
        } catch (ResourceAccessException e) {
            boolean timeout = e.getCause() instanceof SocketTimeoutException;
            throw new LlmCallException(timeout ? Category.TIMEOUT : Category.NETWORK, null,
                    timeout ? "上游讀取逾時: " + url : "上游連接失敗: " + brief(e.getMessage()));
        } catch (LlmCallException e) {
            throw e;
        } catch (Exception e) {
            throw new LlmCallException(Category.NETWORK, null, "請求異常: " + brief(e.getMessage()));
        }
    }

    /** baseUrl → chat/completions 端点（容忍尾斜杠与已带后缀两种写法）。 */
    public static String completionsEndpoint(String baseUrl) {
        String trimmed = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return trimmed.endsWith(CHAT_SUFFIX) ? trimmed : trimmed + CHAT_SUFFIX;
    }

    private static String brief(String s) {
        if (s == null) return "";
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= LOG_BODY_LIMIT ? one : one.substring(0, LOG_BODY_LIMIT) + "…";
    }

    /** 失败类别：决定回给用户的文案档位（配置缺失 / 逾时 / 上游异常）。 */
    public enum Category {
        MISSING_BASE_URL,
        MISSING_KEY,
        TIMEOUT,
        UPSTREAM_HTTP,
        NETWORK,
        BAD_JSON
    }

    /** LLM 调用异常：{@code message} 只入日志，{@code userMessage} 才可回传前端。 */
    @Getter
    public static class LlmCallException extends RuntimeException {

        private final Category category;
        private final Integer upstreamStatus;

        public LlmCallException(Category category, Integer upstreamStatus, String message) {
            super(message);
            this.category = category;
            this.upstreamStatus = upstreamStatus;
        }

        /** 是否属「配置不完整」——重试无意义，必须提示管理员补配置。 */
        public boolean isMisconfigured() {
            return category == Category.MISSING_KEY || category == Category.MISSING_BASE_URL;
        }

        /** 用户可读文案（繁体，与前端既有提示口径一致）。 */
        public String userMessage() {
            return switch (category) {
                case MISSING_KEY -> "AI 通道未配置 API Key，請聯繫管理員在「供應商管理」補齊後重試。";
                case MISSING_BASE_URL -> "AI 通道缺少接口地址（baseUrl），請聯繫管理員完善供應商配置。";
                case TIMEOUT -> "AI 回應逾時（模型思考時間較長），請稍後重試或簡化提問。";
                default -> "AI 服務暫時不可用，請稍後再試。";
            };
        }
    }
}
