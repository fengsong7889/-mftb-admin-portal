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
import com.ibm.icu.text.Transliterator;
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

    /**
     * MyMemory 免费额度（字符/天）：匿名 5000，带 email 提升至 50000。
     * 两个值都必须与官方口径一致：只留一个 50000 常量会让未配置 email 的部署
     * 以为自己还有额度，一路打到服务端返回额度警告（见 {@link #looksLikeQuotaWarning}）。
     */
    private static final int DAILY_CHAR_LIMIT_WITH_EMAIL = 50000;
    private static final int DAILY_CHAR_LIMIT_ANONYMOUS = 5000;

    /**
     * MyMemory 额度耗尽的响应特征：它不把超额表达成 HTTP 错误码，而是返回
     * 200 + responseStatus=200，并把警告文案塞进 responseData.translatedText。
     * 不识别就会把这句警告当译文写进 sys_translation（静默数据污染）。
     */
    private static final String[] QUOTA_WARNING_MARKERS = {
            "MYMEMORY WARNING", "YOU USED ALL AVAILABLE FREE TRANSLATIONS", "QUOTA EXCEEDED"
    };

    /** MyMemory 单次请求最大字符数 */
    private static final int MAX_REQUEST_CHARS = 500;

    /** MyMemory 最大重试次数 */
    private static final int MAX_RETRIES = 2;

    /** 繁→简转换器（ICU4J，线程安全） */
    private static final Transliterator TRAD_TO_SIMP =
            Transliterator.getInstance("Traditional-Simplified");

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
            throw new BusinessException("字段名稱不能為空");
        }
        if (request.getFieldName().trim().length() > MAX_FIELD_NAME_LEN) {
            throw new BusinessException("字段名稱不能超過 " + MAX_FIELD_NAME_LEN + " 个字符");
        }
        String category = StringUtils.hasText(request.getCategory()) ? request.getCategory() : "biz";
        String fieldKey = normalizeKey(request.getFieldKey(), category);
        if (fieldKey.length() > MAX_FIELD_KEY_LEN) {
            throw new BusinessException("字段 Key 不能超過 " + MAX_FIELD_KEY_LEN + " 个字符");
        }

        // fieldKey 全局唯一校验
        if (existsByKey(fieldKey, null)) {
            throw new BusinessException("字段 Key 已存在：Key 必須全局唯一，請修改後重試");
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
            throw new BusinessException("翻譯字段不存在");
        }
        boolean menuSyncField = entity.getFieldKey() != null && entity.getFieldKey().startsWith(MENU_KEY_PREFIX);
        // Key 留空保持原值；填写则校验全局唯一（排除自身）
        if (StringUtils.hasText(request.getFieldKey())) {
            String newKey = request.getFieldKey().trim();
            if (newKey.length() > MAX_FIELD_KEY_LEN) {
                throw new BusinessException("字段 Key 不能超過 " + MAX_FIELD_KEY_LEN + " 个字符");
            }
            // 菜单同步字段的 Key 与菜单 menu_key 绑定, 改名会导致下次启动同步重复插入
            if (menuSyncField && !newKey.equals(entity.getFieldKey())) {
                throw new BusinessException("菜單同步字段的 Key 與菜單綁定，不允許修改");
            }
            if (existsByKey(newKey, id)) {
                throw new BusinessException("字段 Key 已存在：Key 必須全局唯一，請修改後重試");
            }
            entity.setFieldKey(newKey);
        }
        if (StringUtils.hasText(request.getFieldName())) {
            if (request.getFieldName().trim().length() > MAX_FIELD_NAME_LEN) {
                throw new BusinessException("字段名稱不能超過 " + MAX_FIELD_NAME_LEN + " 个字符");
            }
            entity.setFieldName(request.getFieldName().trim());
        }
        if (StringUtils.hasText(request.getCategory())) {
            if (menuSyncField && !"menu".equals(request.getCategory())) {
                throw new BusinessException("菜單同步字段的分類不允許修改");
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
            throw new BusinessException("語言代碼與名稱不能為空");
        }
        String code = normalizeLangCode(request.getCode());
        if (request.getName().trim().length() > MAX_LANG_NAME_LEN) {
            throw new BusinessException("語言名稱不能超過 " + MAX_LANG_NAME_LEN + " 个字符");
        }
        Long exists = languageMapper.selectCount(
                new LambdaQueryWrapper<SysLanguage>().eq(SysLanguage::getCode, code));
        if (exists > 0) {
            throw new BusinessException("該語言代碼已存在");
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
            throw new BusinessException("內置兜底語言（" + FALLBACK_EN + " / " + FALLBACK_ZH + "）不允许删除");
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
            throw new BusinessException("請選擇需要機翻的字段");
        }

        // 确定目标语言：指定语言 或 所有已注册语言（排除 zh-TW 源语言）
        List<String> targetLangs = resolveTargetLangs(request.getTargetLangs());
        if (targetLangs.isEmpty()) {
            throw new BusinessException("沒有可翻譯的目標語言");
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

                // zh-CN: 直接使用 ICU4J 繁→简转换，不调用 MyMemory API（速度快、无配额限制、质量高）
                if ("zh-CN".equals(lang)) {
                    String simplified = convertToSimplifiedChinese(sourceText);
                    if (StringUtils.hasText(simplified)) {
                        translations.put(lang, simplified);
                        changed = true;
                        totalFilled++;
                    }
                    continue;
                }

                // 配额检查：上限按当前是否配置了 MYMEMORY_EMAIL 取值，不能拿 50000 去自我评估匿名额度
                int dailyLimit = effectiveDailyCharLimit();
                if (dailyCharUsed.get() >= dailyLimit) {
                    log.warn("MyMemory 每日字符配额已用尽 ({}/{}), 跳过剩余翻译；"
                                    + "如需提升额度请配置 MYMEMORY_EMAIL（匿名上限 {}）",
                            dailyCharUsed.get(), dailyLimit, DAILY_CHAR_LIMIT_ANONYMOUS);
                    return totalFilled;
                }

                String translated = callMyMemory(sourceText, lang, sourceText);
                // 过滤无效结果：空值，或与源文本相同且目标语言非 CJK 语言
                // 注: zh-TW→ja/ko 时翻译结果常与源文本相同（汉字共用），属正常翻译应予接受
                if (StringUtils.hasText(translated)
                        && (!translated.equals(sourceText) || isCJKTargetLang(lang))) {
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
     * 当前有效日额度：未配置 {@code MYMEMORY_EMAIL} 时服务端只给 5000 字符/天，
     * 本地计数必须按同一个上限自我评估，否则会在超额后持续外呼并拿到警告文案。
     */
    private int effectiveDailyCharLimit() {
        return StringUtils.hasText(myMemoryEmail) ? DAILY_CHAR_LIMIT_WITH_EMAIL : DAILY_CHAR_LIMIT_ANONYMOUS;
    }

    /**
     * 判断"译文"是否其实是 MyMemory 的额度/滥用警告文案（大小写不敏感，只要包含即命中）。
     * 只匹配固定警告短语，不做泛化关键词判断，避免把含类似字样的正常译文误杀。
     */
    private boolean looksLikeQuotaWarning(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        String upper = text.toUpperCase(Locale.ROOT);
        for (String marker : QUOTA_WARNING_MARKERS) {
            if (upper.contains(marker)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 调用 MyMemory 免费翻译 API
     * <p>
     * 接口文档: https://mymemory.translated.net/doc/spec.php
     * 免费额度: 5000 字符/天（匿名），带 email 可提升至 50000
     * <p>
     * 智能去重: 当 MyMemory 返回与源文本相同的结果时（常见于 CJK 短文本），
     * 自动从 matches 数组中寻找更优翻译，避免无效填充。
     *
     * @param text       源文本
     * @param targetLang 目标语言代码
     * @param sourceText 源文本（用于去重比对，传 null 则不做智能去重）
     * @return 翻译结果，失败返回 null
     */
    private String callMyMemory(String text, String targetLang, String sourceText) {
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

                // 额度耗尽会被服务端当成"正常译文"返回：必须当场丢弃，绝不能入库
                if (looksLikeQuotaWarning(resultText)) {
                    // 触顶短路：复用既有日额度闸门，今天不再继续外呼烧额度
                    dailyCharUsed.set(effectiveDailyCharLimit());
                    String snippet = resultText.length() > 120 ? resultText.substring(0, 120) + "…" : resultText;
                    log.warn("MyMemory 返回额度警告，本次不入库并已停用当日剩余翻译。"
                                    + "服务端按日重置，次日自动恢复；如需提额度请配置 MYMEMORY_EMAIL。警告原文: {}",
                            snippet);
                    return null;
                }

                // 智能去重: 若顶部翻译结果与源文本相同，从 matches 中寻找更优翻译
                if (StringUtils.hasText(resultText) && resultText.equals(sourceText)) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> matches = (List<Map<String, Object>>) result.get("matches");
                    if (matches != null) {
                        for (Map<String, Object> match : matches) {
                            Object mt = match.get("translation");
                            if (mt != null) {
                                String candidate = mt.toString().trim();
                                if (StringUtils.hasText(candidate) && !candidate.equals(sourceText)) {
                                    log.debug("MyMemory 智能去重: 原结果='{}' → 替换为='{}' (lang={})", resultText, candidate, targetLang);
                                    resultText = candidate;
                                    break;
                                }
                            }
                        }
                    }
                }

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
        return callMyMemory(text, targetLang, text);
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
            throw new BusinessException("語言代碼格式不正確，應為 ISO 639-1 格式，如 en、zh-TW");
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

    /**
     * 判断目标语言是否为 CJK 语言（与繁中共用汉字，翻译结果可能与源文本相同）
     * 包含日文 (ja)、韩文 (ko) 和简体中文 (zh-CN)；英文、俄文等非 CJK 语言返回 false
     */
    private boolean isCJKTargetLang(String langCode) {
        return "ja".equalsIgnoreCase(langCode)
                || "ko".equalsIgnoreCase(langCode)
                || "zh-CN".equalsIgnoreCase(langCode);
    }

    /**
     * 繁体中文 → 简体中文转换（基于 ICU4J Transliterator）
     * <p>
     * 用于 zh-CN 机翻：直接本地转换，不调用 MyMemory API，
     * 速度快、无配额限制、质量高（覆盖 Unicode 全部繁简映射）。
     *
     * @param traditional 繁体中文文本
     * @return 简体中文文本
     */
    public String convertToSimplifiedChinese(String traditional) {
        if (!StringUtils.hasText(traditional)) return traditional;
        return TRAD_TO_SIMP.transliterate(traditional);
    }

    /**
     * 回填所有缺失的 zh-CN 翻译：从 zh-TW 源文本通过 ICU4J 繁→简转换生成。
     * 由 TranslationDataInitializer 在启动时调用，幂等（只填充空缺）。
     *
     * @return 本次回填的记录数
     */
    public int backfillZhCn() {
        // 查询所有缺少 zh-CN 但有 zh-TW 的记录
        List<SysTranslation> entities = translationMapper.selectList(
                new LambdaQueryWrapper<SysTranslation>()
                        .isNotNull(SysTranslation::getTranslationsJson)
                        .notLike(SysTranslation::getTranslationsJson, "\"zh-CN\""));

        int filled = 0;
        for (SysTranslation entity : entities) {
            Map<String, String> translations = readJson(entity.getTranslationsJson());
            // 已有 zh-CN 则跳过
            if (StringUtils.hasText(translations.get("zh-CN"))) continue;
            // 取 zh-TW 源文本
            String sourceText = firstNonBlank(translations.get(FALLBACK_ZH), entity.getFieldName());
            if (!StringUtils.hasText(sourceText)) continue;

            String simplified = convertToSimplifiedChinese(sourceText);
            if (StringUtils.hasText(simplified)) {
                translations.put("zh-CN", simplified);
                entity.setTranslationsJson(writeJson(translations));
                entity.setUpdatedBy("backfill-zh-CN");
                translationMapper.updateById(entity);
                filled++;
            }
        }
        return filled;
    }
}
