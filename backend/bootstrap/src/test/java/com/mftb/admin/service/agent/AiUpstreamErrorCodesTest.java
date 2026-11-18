/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.agent;

import com.mftb.admin.client.LlmHttpClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * 上游失败分类测试：错误码是前端取词的键，分类掉了就等于把原始码甩给用户。
 *
 * <p>触发场景（真实）：模型供应商账号欠费返回 HTTP 400 + `Arrearage`，
 * cpm 域原先把所有 UPSTREAM_HTTP 压成 {@code upstream_http_error}，
 * 用户只看到一串英文码，不知道「不是自己的错、也不用重试」。
 */
class AiUpstreamErrorCodesTest {

    private static LlmHttpClient.LlmCallException upstream(int status, String body) {
        return new LlmHttpClient.LlmCallException(LlmHttpClient.Category.UPSTREAM_HTTP, status, body);
    }

    @Test
    @DisplayName("欠费 / 密钥失效 / 模型不存在 / 限流 / 内容安全 / 配额耗尽各自成码")
    void classifiesCommonUpstreamFailures() {
        assertEquals("upstream_arrearage", AiUpstreamErrorCodes.of(
                upstream(400, "{\"error\":{\"type\":\"Arrearage\",\"message\":\"overdue-payment\"}}")));
        assertEquals("upstream_invalid_key", AiUpstreamErrorCodes.of(
                upstream(401, "{\"error\":{\"code\":\"invalid_api_key\"}}")));
        assertEquals("upstream_model_not_found", AiUpstreamErrorCodes.of(
                upstream(404, "The model `qwen-x` does not exist")));
        assertEquals("upstream_rate_limited", AiUpstreamErrorCodes.of(upstream(429, "Too Many Requests")));
        assertEquals("upstream_content_filter", AiUpstreamErrorCodes.of(
                upstream(400, "{\"error\":{\"code\":\"data_inspection_failed\"}}")));
        assertEquals("upstream_quota_exhausted", AiUpstreamErrorCodes.of(
                upstream(400, "{\"error\":{\"code\":\"insufficient_quota\"}}")));
    }

    @Test
    @DisplayName("认不出类别的 HTTP 失败保留状态码，且绝不落到上游响应原文")
    void unknownHttpKeepsStatusWithoutLeakingBody() {
        String code = AiUpstreamErrorCodes.of(upstream(500, "{\"error\":{\"message\":\"internal stack trace\"}}"));
        assertEquals("upstream_http_500", code);
        assertFalse(code.contains("stack"), "错误码可能进日志与响应，绝不能带上游原文");
    }

    @Test
    @DisplayName("配置缺失与超时/网络/坏 JSON 分档，非 LLM 异常记 upstream_error")
    void classifiesNonHttpCauses() {
        assertEquals("channel_misconfigured", AiUpstreamErrorCodes.of(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.MISSING_KEY, null, "no api key")));
        assertEquals("upstream_timeout", AiUpstreamErrorCodes.of(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.TIMEOUT, null, "read timeout")));
        assertEquals("upstream_network", AiUpstreamErrorCodes.of(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.NETWORK, null, "conn reset")));
        assertEquals("upstream_bad_json", AiUpstreamErrorCodes.of(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.BAD_JSON, null, "not json")));
        assertEquals("upstream_error", AiUpstreamErrorCodes.of(new IllegalStateException("boom")));
    }
}
