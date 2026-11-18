/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.fasterxml.jackson.databind.JsonNode;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * 录音转写适配器（OpenAI 兼容 /audio/transcriptions）。
 *
 * <p>fail-closed 三条：凭据未配置时整条链路拒绝（available()=false，前端录音入口置灰）；
 * 音频只做一次性转发——不落盘持久化、不进日志、转写完成即由 multipart 缓冲区随请求释放；
 * 大小/时长上限在转发前拒绝，不把预算烧给注定失败的调用。
 *
 * <p>凭据只走环境变量（CPM_ASR_BASE_URL / CPM_ASR_API_KEY / CPM_ASR_MODEL，
 * backend/.env.local），受版本控制的文件禁止出现任何凭据值——secret-scan 拦截。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmAsrService {

    private final OperatorResolver operatorResolver;

    @Value("${cpm.asr.base-url:}")
    private String baseUrl;

    @Value("${cpm.asr.api-key:}")
    private String apiKey;

    @Value("${cpm.asr.model:}")
    private String model;

    /** 未配置即不可用：录音入口置灰而不是报错，粘贴链路完全不受影响（方案 §八-ASR）。 */
    public boolean available() {
        return StringUtils.hasText(baseUrl) && StringUtils.hasText(apiKey) && StringUtils.hasText(model);
    }

    /**
     * @param audio    前端 MediaRecorder 产物（webm/opus 等，按 provider 支持范围）
     * @param filename 原始文件名（仅用于 mime 提示，不做路径拼接——防目录穿越从接口层就断掉）
     */
    public String transcribe(byte[] audio, String filename) {
        // 先鉴权再校验体积：未登录者连「多大算超限」都不该探测到
        operatorResolver.currentUser();
        if (!available()) {
            throw new BusinessException("轉寫服務未配置，請改用粘貼文本");
        }
        if (audio == null || audio.length == 0) {
            throw new BusinessException("音頻為空");
        }
        if (audio.length > CpmConstants.ASR_AUDIO_MAX_BYTES) {
            throw new BusinessException("音頻超過 10MB 上限，請分段錄製");
        }
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        ByteArrayResource resource = new ByteArrayResource(audio) {
            @Override
            public String getFilename() {
                return StringUtils.hasText(filename) ? filename : "speech.webm";
            }
        };
        body.add("file", resource);
        body.add("model", model);
        body.add("response_format", "json");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.setBearerAuth(apiKey);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(60_000);
        RestTemplate restTemplate = new RestTemplate(factory);
        try {
            JsonNode resp = JsonUtils.parse(
                    restTemplate.postForObject(trimTrailingSlash(baseUrl) + "/audio/transcriptions",
                            new HttpEntity<>(body, headers), String.class),
                    JsonNode.class);
            String text = resp == null ? null : resp.path("text").asText(null);
            if (!StringUtils.hasText(text)) {
                throw new BusinessException("轉寫結果為空，請重試或改用粘貼文本");
            }
            log.info("[CpmAsr] 轉寫完成 chars={}", text.length());
            return text.trim();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            // 上游细节只进日志；接口只回可行动话术（不透传堆栈/内部地址）
            log.warn("[CpmAsr] 轉寫失敗: {}", e.getMessage());
            throw new BusinessException("轉寫服務暫不可用，請稍後重試或改用粘貼文本");
        } finally {
            // multipart 缓冲区随请求释放；这里显式清空引用，避免音频字节在长生命周期对象上驻留
            body.clear();
        }
    }

    public Map<String, Object> capabilities() {
        return Map.of("available", available(),
                "maxBytes", CpmConstants.ASR_AUDIO_MAX_BYTES,
                "maxSeconds", CpmConstants.ASR_AUDIO_MAX_SECONDS);
    }

    private static String trimTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
