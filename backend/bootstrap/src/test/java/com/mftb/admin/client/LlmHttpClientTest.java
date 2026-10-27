package com.mftb.admin.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.Map;

import com.sun.net.httpserver.HttpServer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * LLM 专用 HTTP 客户端契约锁。
 * <p>钉死两件线上真实踩过的事：
 * <ol>
 *   <li><b>思考型模型不能被短读超时打死</b> —— 上游 12s 才回文，客户端必须等得到（旧实现复用
 *       通用 RestTemplate 的 10s 读超时，AI 问答全量退化成「AI 服務暫時不可用」）。</li>
 *   <li><b>缺 API Key 不能裸调上游</b> —— 必须本地快速失败并给出「去供应商管理补配置」的文案，
 *       而不是吃一个 401 再泛化成「稍后再试」，让管理员误判成模型故障。</li>
 * </ol>
 */
class LlmHttpClientTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    private String startServer(int delayMs, int status, String body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            try {
                if (delayMs > 0) {
                    Thread.sleep(delayMs);
                }
                byte[] out = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, out.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(out);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
    }

    private static final String OK_BODY =
            "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"你好\"}}],"
                    + "\"model\":\"qwen3.7-flash\",\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}}";

    @Test
    @DisplayName("baseUrl 归一化：裸地址/尾斜杠/已带后缀都指向 chat/completions")
    void resolvesEndpoint() {
        assertEquals("https://x/v1/chat/completions", LlmHttpClient.completionsEndpoint("https://x/v1"));
        assertEquals("https://x/v1/chat/completions", LlmHttpClient.completionsEndpoint("https://x/v1/"));
        assertEquals("https://x/v1/chat/completions", LlmHttpClient.completionsEndpoint("https://x/v1/chat/completions"));
    }

    @Test
    @DisplayName("对照：1s 读超时（模拟旧通用模板）会把慢响应打成 TIMEOUT")
    void toleratesSlowThinkingModel() throws Exception {
        String base = startServer(1200, 200, OK_BODY);
        Map<String, Object> payload = Map.of("model", "qwen3.7-flash", "messages", "[]");
        // 对照：旧实现复用的通用模板（读超时 1s 代指线上的 10s）会把思考型模型打成超时
        LlmHttpClient legacy = new LlmHttpClient(new ObjectMapper(), 5000, 1000);
        assertThrows(LlmHttpClient.LlmCallException.class, () -> legacy.chatCompletion(base, "sk-test", payload));
    }

    @Test
    @DisplayName("LLM 客户端（读超时 120s）能拿到思考型模型的慢响应")
    void succeedsWhenClientUsesLlmTimeout() throws Exception {
        String base = startServer(1200, 200, OK_BODY);
        // 与生产默认一致：读超时 120s，远高于旧通用模板的 10s
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 120000);

        var resp = client.chatCompletion(base, "sk-test",
                Map.of("model", "qwen3.7-flash", "messages", "[]"));

        assertNotNull(resp);
        assertEquals("你好", resp.path("choices").path(0).path("message").path("content").asText());
    }

    @Test
    @DisplayName("读超时归类为 TIMEOUT，并与连接失败区分")
    void mapsReadTimeout() throws Exception {
        String base = startServer(800, 200, OK_BODY);
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 200);

        LlmHttpClient.LlmCallException ex = assertThrows(LlmHttpClient.LlmCallException.class,
                () -> client.chatCompletion(base, "sk-test", Map.of("model", "m")));
        assertEquals(LlmHttpClient.Category.TIMEOUT, ex.getCategory());
        assertFalse(ex.isMisconfigured());
        assertTrue(ex.userMessage().contains("逾時"));
    }

    @Test
    @DisplayName("空 API Key：本地快速失败，文案指向供应商配置，不打无鉴权请求")
    void failsFastWithoutApiKey() {
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 1000);

        LlmHttpClient.LlmCallException ex = assertThrows(LlmHttpClient.LlmCallException.class,
                () -> client.chatCompletion("https://example.invalid/v1", "  ", Map.of("model", "m")));

        assertEquals(LlmHttpClient.Category.MISSING_KEY, ex.getCategory());
        assertTrue(ex.isMisconfigured());
        assertTrue(ex.userMessage().contains("API Key"));
    }

    @Test
    @DisplayName("空 baseUrl：归类 MISSING_BASE_URL，不回退到硬编码端点")
    void failsFastWithoutBaseUrl() {
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 1000);

        LlmHttpClient.LlmCallException ex = assertThrows(LlmHttpClient.LlmCallException.class,
                () -> client.chatCompletion("", "sk-test", Map.of("model", "m")));

        assertEquals(LlmHttpClient.Category.MISSING_BASE_URL, ex.getCategory());
        assertTrue(ex.userMessage().contains("baseUrl"));
    }

    @Test
    @DisplayName("上游 4xx：归类 UPSTREAM_HTTP 并带上游状态码（细节只入日志）")
    void mapsUpstreamHttpStatus() throws Exception {
        String base = startServer(0, 401, "{\"error\":{\"message\":\"Invalid API-key\"}}");
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 5000);

        LlmHttpClient.LlmCallException ex = assertThrows(LlmHttpClient.LlmCallException.class,
                () -> client.chatCompletion(base, "sk-wrong", Map.of("model", "m")));

        assertEquals(LlmHttpClient.Category.UPSTREAM_HTTP, ex.getCategory());
        assertEquals(401, ex.getUpstreamStatus());
        assertEquals("AI 服務暫時不可用，請稍後再試。", ex.userMessage());
    }

    @Test
    @DisplayName("上游返回非 JSON：归类 BAD_JSON，不把脏数据交给上层解析")
    void mapsBadJson() throws Exception {
        String base = startServer(0, 200, "<html>gateway bad</html>");
        LlmHttpClient client = new LlmHttpClient(new ObjectMapper(), 5000, 5000);

        LlmHttpClient.LlmCallException ex = assertThrows(LlmHttpClient.LlmCallException.class,
                () -> client.chatCompletion(base, "sk-test", Map.of("model", "m")));

        assertEquals(LlmHttpClient.Category.BAD_JSON, ex.getCategory());
    }
}
