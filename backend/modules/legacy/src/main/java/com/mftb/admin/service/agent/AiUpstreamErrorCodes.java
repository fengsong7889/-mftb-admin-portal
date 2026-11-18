/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.agent;

import com.mftb.admin.client.LlmHttpClient;

/**
 * LLM 上游失败 → 前端可读错误码的唯一映射处。
 *
 * <p>为什么要抽出来：会议纪要原本自带这份分类（欠费/密钥失效/模型不存在/限流/内容安全/配额耗尽），
 * 持續績效的 AI 提取照抄了骨架却漏了这段，于是所有上游 HTTP 失败都被压成一个
 * {@code upstream_http_error}——台账里看不出原因，界面上只能把原始码甩给用户
 * （真实场景：模型账号欠费，用户看到的是英文码而不是「帐号欠费」）。
 * 两处各一份分类，第二份必然腐化，所以只留一处。
 *
 * <p>返回值是给前端做 i18n 取词用的稳定键，不得返回上游原文；上游消息体只进日志
 * （见 {@link LlmHttpClient.LlmCallException} 的 message/userMessage 分工）。
 */
public final class AiUpstreamErrorCodes {

    private AiUpstreamErrorCodes() {
    }

    /** 把调用异常归类成前端可读的错误码；非 LLM 异常统一记 upstream_error。 */
    public static String of(Throwable cause) {
        if (!(cause instanceof LlmHttpClient.LlmCallException le)) {
            return "upstream_error";
        }
        return switch (le.getCategory()) {
            case MISSING_KEY, MISSING_BASE_URL -> "channel_misconfigured";
            case UPSTREAM_HTTP -> parseHttpErrorBody(le.getMessage(), le.getUpstreamStatus());
            case TIMEOUT -> "upstream_timeout";
            case NETWORK -> "upstream_network";
            case BAD_JSON -> "upstream_bad_json";
        };
    }

    /** 从上游 HTTP 错误响应体中识别常见错误类型（欠费、密钥无效、模型不存在、限流等）。 */
    private static String parseHttpErrorBody(String message, Integer status) {
        if (message == null) {
            return "upstream_http_error";
        }
        String lower = message.toLowerCase();
        // 阿里云欠费 / 账户异常
        if (lower.contains("arrearage") || lower.contains("overdue-payment") || lower.contains("欠费")) {
            return "upstream_arrearage";
        }
        // API Key 无效 / 过期
        if (lower.contains("invalid_api_key") || lower.contains("incorrect api key")
                || lower.contains("invalid api key") || lower.contains("unauthorized")) {
            return "upstream_invalid_key";
        }
        // 模型不存在 / 不支持
        if (lower.contains("model_not_found") || lower.contains("invalid model")
                || lower.contains("does not exist") || lower.contains("not supported")) {
            return "upstream_model_not_found";
        }
        // 限流
        if (lower.contains("rate_limit") || lower.contains("too many requests")
                || (status != null && status == 429)) {
            return "upstream_rate_limited";
        }
        // 内容安全过滤
        if (lower.contains("content_filter") || lower.contains("content_policy")
                || lower.contains("data_inspection_failed")) {
            return "upstream_content_filter";
        }
        // 配额耗尽
        if (lower.contains("quota") || lower.contains("insufficient_quota")
                || lower.contains("exceeded") || lower.contains("limit reached")) {
            return "upstream_quota_exhausted";
        }
        // 其他 HTTP 错误保留状态码
        return "upstream_http_" + (status != null ? status : "error");
    }
}
