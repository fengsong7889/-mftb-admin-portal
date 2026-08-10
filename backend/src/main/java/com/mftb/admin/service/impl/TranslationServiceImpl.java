package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.LanguageVO;
import com.mftb.admin.dto.MachineTranslateRequest;
import com.mftb.admin.dto.TranslationCoverageVO;
import com.mftb.admin.dto.TranslationRequest;
import com.mftb.admin.dto.TranslationVO;
import com.mftb.admin.entity.SysLanguage;
import com.mftb.admin.entity.SysTranslation;
import com.mftb.admin.mapper.SysLanguageMapper;
import com.mftb.admin.mapper.SysTranslationMapper;
import com.mftb.admin.service.TranslationService;
import com.mftb.admin.util.OperatorResolver;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 多语言翻译管理服务实现
 * <p>
 * 完成率阈值与前端 translationConfig.ts 保持一致: >= 60% 视为 ready
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TranslationServiceImpl implements TranslationService {

    /** 完成率达标阈值 */
    private static final double READY_THRESHOLD = 0.6;

    /** 回退链兜底语言 */
    private static final String FALLBACK_EN = "en";
    private static final String FALLBACK_ZH = "zh-TW";

    /** 菜单同步字段前缀: 由启动同步器维护, 禁止改 Key/分类, 否则下次启动会重复插入 */
    private static final String MENU_KEY_PREFIX = "menu.";

    /** 字段 Key / 字段名称长度上限（与表结构一致） */
    private static final int MAX_FIELD_KEY_LEN = 128;
    private static final int MAX_FIELD_NAME_LEN = 100;
    private static final int MAX_LANG_NAME_LEN = 100;

    /** 语言代码格式: 2~3 位字母主标签 + 可选 2~4 位区域标签, 如 en / zh-TW */
    private static final Pattern LANG_CODE_PATTERN = Pattern.compile("^([a-zA-Z]{2,3})(?:-([a-zA-Z]{2,4}))?$");

    /** MyMemory 免费翻译 API */
    private static final String MYMEMORY_URL = "https://api.mymemory.translated.net/get";

    /** MyMemory 请求超时 */
    private static final Duration MT_TIMEOUT = Duration.ofSeconds(10);

    /** MyMemory 免费额度: 匿名 5000 字符/天, 带 email 可提升至 50000 */
    private static final int DAILY_CHAR_LIMIT = 50000;

    /** MyMemory 单次请求最大字符数 */
    private static final int MAX_REQUEST_CHARS = 500;

    /** MyMemory 最大重试次数 */
    private static final int MAX_RETRIES = 2;

    /** MyMemory 账号 email（配置后可提升额度至 50000 字符/天） */
    @org.springframework.beans.factory.annotation.Value("${translation.mymemory.email:}")
    private String myMemoryEmail;

    private final SysTranslationMapper translationMapper;
    private final SysLanguageMapper languageMapper;
    private final OperatorResolver operatorResolver;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /** 当日已用字符数（简单内存计数，重启归零） */
    private final AtomicInteger dailyCharUsed = new AtomicInteger(0);

    /* ========== 翻译字段 ========== */

    @Override
    public List<TranslationVO> list(String keyword, String category) {
        LambdaQueryWrapper<SysTranslation> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(category) && !"all".equals(category)) {
            wrapper.eq(SysTranslation::getCategory, category);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(SysTranslation::getFieldKey, kw)
                    .or().like(SysTranslation::getFieldName, kw)
                    .or().like(SysTranslation::getTranslationsJson, kw));
        }
        wrapper.orderByAsc(SysTranslation::getCategory).orderByAsc(SysTranslation::getId);
        return translationMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public TranslationVO create(TranslationRequest request) {
        if (!StringUtils.hasText(request.getFieldName())) {
            throw new BusinessException("字段名称不能为空");
        }
        if (request.getFieldName().trim().length() > MAX_FIELD_NAME_LEN) {
            throw new BusinessException("字段名称不能超过 " + MAX_FIELD_NAME_LEN + " 个字符");
        }
        String category = StringUtils.hasText(request.getCategory()) ? request.getCategory() : "biz";
        String fieldKey = normalizeKey(request.getFieldKey(), category);
        if (fieldKey.length() > MAX_FIELD_KEY_LEN) {
            throw new BusinessException("字段 Key 不能超过 " + MAX_FIELD_KEY_LEN + " 个字符");
        }

        // fieldKey 全局唯一校验
        if (existsByKey(fieldKey, null)) {
            throw new BusinessException("字段 Key 已存在：Key 必须全局唯一，请修改后重试");
        }

        SysTranslation entity = new SysTranslation();
        entity.setFieldKey(fieldKey);
        entity.setFieldName(request.getFieldName().trim());
        entity.setCategory(category);
        entity.setTranslationsJson(writeJson(request.getTranslations()));
        // 来源由后端固定, 不接受客户端伪造 sync
        entity.setSource("manual");
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        translationMapper.insert(entity);
        return toVO(entity);
    }

    @Override
    public TranslationVO update(Long id, TranslationRequest request) {
        SysTranslation entity = translationMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("翻译字段不存在");
        }
        boolean menuSyncField = entity.getFieldKey() != null && entity.getFieldKey().startsWith(MENU_KEY_PREFIX);
        // Key 留空保持原值；填写则校验全局唯一（排除自身）
        if (StringUtils.hasText(request.getFieldKey())) {
            String newKey = request.getFieldKey().trim();
            if (newKey.length() > MAX_FIELD_KEY_LEN) {
                throw new BusinessException("字段 Key 不能超过 " + MAX_FIELD_KEY_LEN + " 个字符");
            }
            // 菜单同步字段的 Key 与菜单 menu_key 绑定, 改名会导致下次启动同步重复插入
            if (menuSyncField && !newKey.equals(entity.getFieldKey())) {
                throw new BusinessException("菜单同步字段的 Key 与菜单绑定，不允许修改");
            }
            if (existsByKey(newKey, id)) {
                throw new BusinessException("字段 Key 已存在：Key 必须全局唯一，请修改后重试");
            }
            entity.setFieldKey(newKey);
        }
        if (StringUtils.hasText(request.getFieldName())) {
            if (request.getFieldName().trim().length() > MAX_FIELD_NAME_LEN) {
                throw new BusinessException("字段名称不能超过 " + MAX_FIELD_NAME_LEN + " 个字符");
            }
            entity.setFieldName(request.getFieldName().trim());
        }
        if (StringUtils.hasText(request.getCategory())) {
            if (menuSyncField && !"menu".equals(request.getCategory())) {
                throw new BusinessException("菜单同步字段的分类不允许修改");
            }
            entity.setCategory(request.getCategory());
        }
        if (request.getTranslations() != null) {
            entity.setTranslationsJson(writeJson(request.getTranslations()));
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        translationMapper.updateById(entity);
        return toVO(entity);
    }

    @Override
    public void delete(Long id) {
        translationMapper.deleteById(id);
    }

    @Override
    public Map<String, String> bundle(String langCode) {
        if (!StringUtils.hasText(langCode)) {
            langCode = FALLBACK_EN;
        }
        Map<String, String> bundle = new LinkedHashMap<>();
        for (SysTranslation t : translationMapper.selectList(null)) {
            Map<String, String> translations = readJson(t.getTranslationsJson());
            String value = firstNonBlank(
                    translations.get(langCode),
                    translations.get(FALLBACK_EN),
                    translations.get(FALLBACK_ZH),
                    t.getFieldName());
            bundle.put(t.getFieldKey(), value);
        }
        return bundle;
    }

    @Override
    public TranslationCoverageVO coverage(String langCode) {
        List<SysTranslation> all = translationMapper.selectList(null);
        long total = all.size();
        long translated = all.stream()
                .filter(t -> StringUtils.hasText(readJson(t.getTranslationsJson()).get(langCode)))
                .count();

        boolean langRegistered = languageMapper.selectCount(
                new LambdaQueryWrapper<SysLanguage>().eq(SysLanguage::getCode, langCode)) > 0;

        TranslationCoverageVO vo = new TranslationCoverageVO();
        vo.setLangCode(langCode);
        vo.setTotal(total);
        vo.setTranslated(translated);
        double rate = total > 0 ? (double) translated / total : 0;
        vo.setRate(rate);
        if (!langRegistered || rate == 0) {
            vo.setStatus("not_configured");
        } else if (rate < READY_THRESHOLD) {
            vo.setStatus("partial");
        } else {
            vo.setStatus("ready");
        }
        return vo;
    }

    /* ========== 已注册语言 ========== */

    @Override
    public List<LanguageVO> listLanguages() {
        return languageMapper.selectList(
                        new LambdaQueryWrapper<SysLanguage>()
                                .eq(SysLanguage::getStatus, 1)
                                .orderByAsc(SysLanguage::getId))
                .stream().map(this::toLangVO).toList();
    }

    @Override
    public LanguageVO createLanguage(LanguageVO request) {
        if (!StringUtils.hasText(request.getCode()) || !StringUtils.hasText(request.getName())) {
            throw new BusinessException("语言代码与名称不能为空");
        }
        String code = normalizeLangCode(request.getCode());
        if (request.getName().trim().length() > MAX_LANG_NAME_LEN) {
            throw new BusinessException("语言名称不能超过 " + MAX_LANG_NAME_LEN + " 个字符");
        }
        Long exists = languageMapper.selectCount(
                new LambdaQueryWrapper<SysLanguage>().eq(SysLanguage::getCode, code));
        if (exists > 0) {
            throw new BusinessException("该语言代码已存在");
        }
        SysLanguage entity = new SysLanguage();
        entity.setCode(code);
        entity.setNativeName(request.getName().trim());
        entity.setFlag(StringUtils.hasText(request.getFlag()) ? request.getFlag() : "\uD83C\uDF10");
        entity.setNamesJson(writeJson(request.getNames()));
        entity.setStatus(1);
        languageMapper.insert(entity);
        return toLangVO(entity);
    }

    @Override
    public void deleteLanguage(String code) {
        // 回退链兜底语言不允许删除, 否则 bundle/coverage 回退规则失效
        if (FALLBACK_EN.equalsIgnoreCase(code) || FALLBACK_ZH.equalsIgnoreCase(code)) {
            throw new BusinessException("内置兜底语言（" + FALLBACK_EN + " / " + FALLBACK_ZH + "）不允许删除");
        }
        SysLanguage lang = languageMapper.selectOne(
                new LambdaQueryWrapper<SysLanguage>().eq(SysLanguage::getCode, code));
        if (lang != null) {
            languageMapper.deleteById(lang.getId());
        }
    }

    /* ========== 机翻 ========== */

    @Override
    public int machineTranslate(MachineTranslateRequest request) {
        if (request.getIds() == null || request.getIds().isEmpty()) {
            throw new BusinessException("请选择需要机翻的字段");
        }

        // 确定目标语言：指定语言 或 所有已注册语言（排除 zh-TW 源语言）
        List<String> targetLangs = resolveTargetLangs(request.getTargetLangs());
        if (targetLangs.isEmpty()) {
            throw new BusinessException("没有可翻译的目标语言");
        }

        // 批量查询翻译记录，避免 N+1
        List<SysTranslation> entities = translationMapper.selectBatchIds(request.getIds());
        String operator = operatorResolver.currentOperatorName();

        int totalFilled = 0;
        for (SysTranslation entity : entities) {
            Map<String, String> translations = readJson(entity.getTranslationsJson());
            // 源文本：优先繁中，回退字段名称
            String sourceText = firstNonBlank(translations.get(FALLBACK_ZH), entity.getFieldName());
            if (!StringUtils.hasText(sourceText)) continue;

            boolean changed = false;
            for (String lang : targetLangs) {
                // 跳过源语言
                if (FALLBACK_ZH.equals(lang)) continue;
                // 只填充空缺
                if (StringUtils.hasText(translations.get(lang))) continue;

                // 配额检查
                if (dailyCharUsed.get() >= DAILY_CHAR_LIMIT) {
                    log.warn("MyMemory 每日字符配额已用尽 ({}/{}), 跳过剩余翻译", dailyCharUsed.get(), DAILY_CHAR_LIMIT);
                    return totalFilled;
                }

                String translated = callMyMemory(sourceText, lang);
                // 过滤无效结果：空值或与源文本相同（MyMemory 无翻译时原样返回）
                if (StringUtils.hasText(translated) && !translated.equals(sourceText)) {
                    translations.put(lang, translated);
                    changed = true;
                    totalFilled++;
                }
            }

            if (changed) {
                entity.setTranslationsJson(writeJson(translations));
                entity.setUpdatedBy("machine(" + operator + ")");
                translationMapper.updateById(entity);
            }
        }
        return totalFilled;
    }

    /** 确定目标语言列表 */
    private List<String> resolveTargetLangs(List<String> specified) {
        if (specified != null && !specified.isEmpty()) {
            return specified;
        }
        // 未指定则取所有已注册语言
        return languageMapper.selectList(
                        new LambdaQueryWrapper<SysLanguage>()
                                .eq(SysLanguage::getStatus, 1)
                                .ne(SysLanguage::getCode, FALLBACK_ZH))
                .stream()
                .map(SysLanguage::getCode)
                .toList();
    }

    /**
     * 调用 MyMemory 免费翻译 API
     * <p>
     * 接口文档: https://mymemory.translated.net/doc/spec.php
     * 免费额度: 5000 字符/天（匿名），带 email 可提升至 50000
     *
     * @param text       源文本
     * @param targetLang 目标语言代码
     * @return 翻译结果，失败返回 null
     */
    private String callMyMemory(String text, String targetLang) {
        // 截断源文本至 MyMemory 单次请求上限（500 字符）
        String truncated = text.length() > MAX_REQUEST_CHARS
                ? text.substring(0, MAX_REQUEST_CHARS)
                : text;

        int attempt = 0;
        while (attempt <= MAX_RETRIES) {
            try {
                String langPair = FALLBACK_ZH + "|" + targetLang;
                log.debug("MyMemory API 请求: langPair={}, text={}", langPair, truncated);
                StringBuilder urlBuilder = new StringBuilder(MYMEMORY_URL)
                        .append("?q=").append(URLEncoder.encode(truncated, StandardCharsets.UTF_8))
                        .append("&langpair=").append(URLEncoder.encode(langPair, StandardCharsets.UTF_8));
                if (StringUtils.hasText(myMemoryEmail)) {
                    urlBuilder.append("&de=").append(URLEncoder.encode(myMemoryEmail, StandardCharsets.UTF_8));
                }

                HttpRequest httpRequest = HttpRequest.newBuilder()
                        .uri(URI.create(urlBuilder.toString()))
                        .timeout(MT_TIMEOUT)
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

                // 429 限流 → 退避重试
                if (response.statusCode() == 429 && attempt < MAX_RETRIES) {
                    attempt++;
                    log.warn("MyMemory API 限流(429), 第{}次重试, lang={}", attempt, targetLang);
                    Thread.sleep(1000L * attempt);
                    continue;
                }

                // 5xx 服务端错误 → 重试
                if (response.statusCode() >= 500 && attempt < MAX_RETRIES) {
                    attempt++;
                    log.warn("MyMemory API 服务端错误: {}, 第{}次重试, lang={}", response.statusCode(), attempt, targetLang);
                    Thread.sleep(1000L * attempt);
                    continue;
                }

                if (response.statusCode() != 200) {
                    log.warn("MyMemory API 返回异常状态: {} for lang={}", response.statusCode(), targetLang);
                    return null;
                }

                // 解析响应: {"responseData":{"translatedText":"..."}, "responseStatus":200}
                @SuppressWarnings("unchecked")
                Map<String, Object> result = objectMapper.readValue(response.body(), Map.class);
                // 安全提取 responseStatus（Jackson 可能反序列化为 Integer 或 Long）
                Object statusObj = result.get("responseStatus");
                int status = statusObj instanceof Number ? ((Number) statusObj).intValue() : -1;
                if (status != 200) {
                    log.warn("MyMemory API 业务错误: status={}, response={}", status, response.body());
                    return null;
                }

                @SuppressWarnings("unchecked")
                Map<String, Object> responseData = (Map<String, Object>) result.get("responseData");
                if (responseData == null) return null;

                Object translated = responseData.get("translatedText");
                String resultText = translated != null ? translated.toString() : null;

                // 累计字符用量
                if (StringUtils.hasText(resultText)) {
                    dailyCharUsed.addAndGet(truncated.length());
                }
                return resultText;
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("MyMemory API 重试被中断: lang={}", targetLang);
                return null;
            } catch (Exception e) {
                // 网络异常等 → 重试
                if (attempt < MAX_RETRIES) {
                    attempt++;
                    log.warn("MyMemory API 调用失败, 第{}次重试: lang={}, error={}", attempt, targetLang, e.getMessage());
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return null;
                    }
                } else {
                    log.warn("MyMemory API 调用最终失败: lang={}, error={}", targetLang, e.getMessage());
                    return null;
                }
            }
        }
        return null;
    }

    @Override
    public String translateText(String text, String targetLang) {
        if (!StringUtils.hasText(text)) return null;
        return callMyMemory(text, targetLang);
    }

    /* ========== 内部工具 ========== */

    /** Key 规范化: 留空自动生成 分类前缀 + field 递增序号 */
    private String normalizeKey(String raw, String category) {
        if (StringUtils.hasText(raw)) {
            return raw.trim();
        }
        String prefix = category + ".";
        int i = 1;
        String key = prefix + "field" + i;
        while (existsByKey(key, null)) {
            i++;
            key = prefix + "field" + i;
        }
        return key;
    }

    private boolean existsByKey(String fieldKey, Long excludeId) {
        LambdaQueryWrapper<SysTranslation> wrapper = new LambdaQueryWrapper<SysTranslation>()
                .eq(SysTranslation::getFieldKey, fieldKey);
        if (excludeId != null) {
            wrapper.ne(SysTranslation::getId, excludeId);
        }
        return translationMapper.selectCount(wrapper) > 0;
    }

    /** 语言代码规范化: 校验格式并统一为主标签小写 + 区域标签大写（如 ZH-tw → zh-TW） */
    private String normalizeLangCode(String raw) {
        String code = raw.trim();
        Matcher matcher = LANG_CODE_PATTERN.matcher(code);
        if (!matcher.matches()) {
            throw new BusinessException("语言代码格式不正确，应为 ISO 639-1 格式，如 en、zh-TW");
        }
        String primary = matcher.group(1).toLowerCase(Locale.ROOT);
        return matcher.group(2) == null ? primary : primary + "-" + matcher.group(2).toUpperCase(Locale.ROOT);
    }

    private TranslationVO toVO(SysTranslation entity) {
        TranslationVO vo = new TranslationVO();
        vo.setId(entity.getId());
        vo.setFieldKey(entity.getFieldKey());
        vo.setFieldName(entity.getFieldName());
        vo.setCategory(entity.getCategory());
        vo.setTranslations(readJson(entity.getTranslationsJson()));
        vo.setSource(entity.getSource());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    private LanguageVO toLangVO(SysLanguage entity) {
        LanguageVO vo = new LanguageVO();
        vo.setId(entity.getId());
        vo.setCode(entity.getCode());
        vo.setName(entity.getNativeName());
        vo.setFlag(entity.getFlag());
        vo.setNames(readJson(entity.getNamesJson()));
        return vo;
    }

    private Map<String, String> readJson(String json) {
        if (!StringUtils.hasText(json)) {
            return new HashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {
            });
        } catch (Exception e) {
            log.warn("翻译 JSON 解析失败: {}", e.getMessage());
            return new HashMap<>();
        }
    }

    private String writeJson(Map<String, String> map) {
        try {
            return objectMapper.writeValueAsString(map == null ? Map.of() : map);
        } catch (Exception e) {
            log.warn("翻译 JSON 序列化失败: {}", e.getMessage());
            return "{}";
        }
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        return "";
    }
}
