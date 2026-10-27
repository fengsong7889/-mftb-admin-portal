package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MtEngineRequest;
import com.mftb.admin.dto.MtEngineVO;
import com.mftb.admin.entity.SysMtEngine;
import com.mftb.admin.mapper.SysMtEngineMapper;
import com.mftb.admin.service.MtEngineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 机翻引擎配置服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MtEngineServiceImpl implements MtEngineService {

    private final SysMtEngineMapper mtEngineMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Override
    public List<MtEngineVO> list() {
        return mtEngineMapper.selectList(
                        new LambdaQueryWrapper<SysMtEngine>()
                                .orderByAsc(SysMtEngine::getSortOrder))
                .stream().map(this::toVO).toList();
    }

    @Override
    public MtEngineVO update(Long id, MtEngineRequest request) {
        SysMtEngine entity = mtEngineMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("引擎配置不存在");
        }
        if (StringUtils.hasText(request.getEngineName())) {
            entity.setEngineName(request.getEngineName());
        }
        if (StringUtils.hasText(request.getApiUrl())) {
            entity.setApiUrl(request.getApiUrl());
        }
        // API Key: 留空不覆盖, 传入新值则更新
        if (StringUtils.hasText(request.getApiKey())) {
            entity.setApiKey(request.getApiKey());
        }
        if (request.getDailyLimit() != null && request.getDailyLimit() > 0) {
            entity.setDailyLimit(request.getDailyLimit());
        }
        if (request.getTimeoutMs() != null && request.getTimeoutMs() > 0) {
            entity.setTimeoutMs(request.getTimeoutMs());
        }
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        if (request.getConfigJson() != null) {
            entity.setConfigJson(request.getConfigJson());
        }
        mtEngineMapper.updateById(entity);
        return toVO(entity);
    }

    @Override
    public Map<String, Object> testTranslate(Long id, String text, String targetLang) {
        SysMtEngine engine = mtEngineMapper.selectById(id);
        if (engine == null) {
            throw new BusinessException("引擎配置不存在");
        }
        if (engine.getStatus() == null || engine.getStatus() != 1) {
            throw new BusinessException("該引擎未啟用，無法測試");
        }
        if (!StringUtils.hasText(text)) {
            throw new BusinessException("請輸入待翻譯文本");
        }
        if (!StringUtils.hasText(targetLang)) {
            targetLang = "en";
        }

        Map<String, Object> result = new HashMap<>();
        result.put("engineKey", engine.getEngineKey());
        result.put("engineName", engine.getEngineName());
        result.put("sourceText", text);
        result.put("targetLang", targetLang);

        try {
            String translated = callEngine(engine, text, targetLang);
            if (StringUtils.hasText(translated)) {
                result.put("translatedText", translated);
                result.put("success", true);
            } else {
                result.put("translatedText", null);
                result.put("success", false);
                result.put("error", "翻譯結果為空，請檢查 API 配置");
            }
        } catch (Exception e) {
            log.warn("引擎 {} 测试翻译失败: {}", engine.getEngineKey(), e.getMessage());
            result.put("success", false);
            result.put("error", "翻譯失敗: " + e.getMessage());
        }
        return result;
    }

    @Override
    public MtEngineVO getActiveEngine() {
        SysMtEngine engine = mtEngineMapper.selectOne(
                new LambdaQueryWrapper<SysMtEngine>()
                        .eq(SysMtEngine::getStatus, 1)
                        .orderByAsc(SysMtEngine::getSortOrder)
                        .last("LIMIT 1"));
        return engine != null ? toVO(engine) : null;
    }

    /* ========== 引擎调用 ========== */

    /**
     * 根据引擎类型调用对应的翻译 API
     */
    private String callEngine(SysMtEngine engine, String text, String targetLang) throws Exception {
        return switch (engine.getEngineKey()) {
            case "mymemory" -> callMyMemory(engine, text, targetLang);
            case "deepl" -> callDeepL(engine, text, targetLang);
            case "openai" -> callOpenAI(engine, text, targetLang);
            default -> throw new BusinessException("不支持的引擎類型: " + engine.getEngineKey());
        };
    }

    /**
     * 调用 MyMemory 免费翻译 API
     */
    private String callMyMemory(SysMtEngine engine, String text, String targetLang) throws Exception {
        String apiUrl = StringUtils.hasText(engine.getApiUrl())
                ? engine.getApiUrl()
                : "https://api.mymemory.translated.net/get";
        int timeout = engine.getTimeoutMs() != null ? engine.getTimeoutMs() : 10000;

        String langPair = "zh-TW|" + targetLang;
        String url = apiUrl + "?q=" + URLEncoder.encode(text, StandardCharsets.UTF_8)
                + "&langpair=" + URLEncoder.encode(langPair, StandardCharsets.UTF_8);

        // 如果 configJson 中有 email 配置, 附加到请求中
        if (StringUtils.hasText(engine.getConfigJson())) {
            // 简单提取 email 字段: {"email":"xxx@xxx.com"}
            int emailIdx = engine.getConfigJson().indexOf("\"email\"");
            if (emailIdx >= 0) {
                int colonIdx = engine.getConfigJson().indexOf(":", emailIdx);
                int q1 = engine.getConfigJson().indexOf("\"", colonIdx + 1);
                int q2 = engine.getConfigJson().indexOf("\"", q1 + 1);
                if (q1 >= 0 && q2 > q1) {
                    String email = engine.getConfigJson().substring(q1 + 1, q2);
                    url += "&de=" + URLEncoder.encode(email, StandardCharsets.UTF_8);
                }
            }
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofMillis(timeout))
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("MyMemory API 返回狀態碼: " + response.statusCode());
        }

        // 解析: {"responseData":{"translatedText":"..."}}
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        @SuppressWarnings("unchecked")
        Map<String, Object> result = mapper.readValue(response.body(), Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> responseData = (Map<String, Object>) result.get("responseData");
        if (responseData == null) return null;
        Object translated = responseData.get("translatedText");
        return translated != null ? translated.toString() : null;
    }

    /**
     * 调用 DeepL API（预留）
     */
    private String callDeepL(SysMtEngine engine, String text, String targetLang) throws Exception {
        if (!StringUtils.hasText(engine.getApiKey())) {
            throw new BusinessException("DeepL API Key 未配置");
        }
        String apiUrl = StringUtils.hasText(engine.getApiUrl())
                ? engine.getApiUrl()
                : "https://api-free.deepl.com/v2/translate";
        int timeout = engine.getTimeoutMs() != null ? engine.getTimeoutMs() : 10000;

        String body = "text=" + URLEncoder.encode(text, StandardCharsets.UTF_8)
                + "&target_lang=" + URLEncoder.encode(targetLang, StandardCharsets.UTF_8);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofMillis(timeout))
                .header("Authorization", "DeepL-Auth-Key " + engine.getApiKey())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("DeepL API 返回狀態碼: " + response.statusCode());
        }

        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        @SuppressWarnings("unchecked")
        Map<String, Object> result = mapper.readValue(response.body(), Map.class);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> translations = (List<Map<String, Object>>) result.get("translations");
        if (translations != null && !translations.isEmpty()) {
            Object translatedText = translations.get(0).get("text");
            return translatedText != null ? translatedText.toString() : null;
        }
        return null;
    }

    /**
     * 调用 OpenAI API（预留）
     */
    private String callOpenAI(SysMtEngine engine, String text, String targetLang) throws Exception {
        if (!StringUtils.hasText(engine.getApiKey())) {
            throw new BusinessException("OpenAI API Key 未配置");
        }
        String apiUrl = StringUtils.hasText(engine.getApiUrl())
                ? engine.getApiUrl()
                : "https://api.openai.com/v1/chat/completions";
        int timeout = engine.getTimeoutMs() != null ? engine.getTimeoutMs() : 30000;

        String prompt = "Translate the following text to " + targetLang + ":\n" + text;
        String jsonBody = "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":"
                + escapeJson(prompt) + "}]}";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofMillis(timeout))
                .header("Authorization", "Bearer " + engine.getApiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("OpenAI API 返回狀態碼: " + response.statusCode());
        }

        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        @SuppressWarnings("unchecked")
        Map<String, Object> result = mapper.readValue(response.body(), Map.class);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) result.get("choices");
        if (choices != null && !choices.isEmpty()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            if (message != null) {
                Object content = message.get("content");
                return content != null ? content.toString().trim() : null;
            }
        }
        return null;
    }

    /* ========== 工具方法 ========== */

    private MtEngineVO toVO(SysMtEngine entity) {
        MtEngineVO vo = new MtEngineVO();
        vo.setId(entity.getId());
        vo.setEngineKey(entity.getEngineKey());
        vo.setEngineName(entity.getEngineName());
        vo.setApiUrl(entity.getApiUrl());
        vo.setApiKey(maskApiKey(entity.getApiKey()));
        vo.setDailyLimit(entity.getDailyLimit());
        vo.setTimeoutMs(entity.getTimeoutMs());
        vo.setStatus(entity.getStatus());
        vo.setConfigJson(entity.getConfigJson());
        vo.setSortOrder(entity.getSortOrder());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        // todayUsage 由运行时统计, 此处留空
        vo.setTodayUsage(0);
        return vo;
    }

    /** API Key 脱敏: 仅显示前4后4位 */
    private String maskApiKey(String apiKey) {
        if (!StringUtils.hasText(apiKey) || apiKey.length() <= 8) {
            return "****";
        }
        return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length() - 4);
    }

    private String escapeJson(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }
}
