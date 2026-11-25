/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.support;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 交互式相似推荐（algo_type=17）参数协议校验。
 * <p>与星星协议互不相通：type17 不复用 {@link AdStarAlgorithmParams} 的键语义，
 * 由服务层按 algoType 分派进入本校验器，避免版本化参数被星星校验误拒或误收。
 * <p>标签衰变不在参数内定义：算法只引用全局衰变规则，参数保存匹配门槛与策略。
 */
public final class AdSimilarAlgorithmParams {
    public static final int ALGORITHM_TYPE = 17;
    public static final int SCHEMA_VERSION = 1;
    public static final int STORE_TARGET = 1;
    public static final int SCENE_DETAIL_RETURN = 1;

    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Set<String> ROOT_KEYS = Set.of("schemaVersion", "targetType", "applicableBusinessTypes",
            "supportedScenes", "tagPolicy", "similarRules");
    private static final Set<String> TAG_POLICY_KEYS = Set.of("merchantMinimum", "userMinimum");
    private static final Set<String> RULE_KEYS = Set.of("metric", "merchantSimilarityThreshold", "userSimilarityThreshold",
            "modes", "resultCount", "slot1Source", "slot2Source", "triggerMode", "dwellSeconds",
            "dailyLimitMode", "dailyLimit", "merchantFreqHours", "merchantFreqTimes",
            "rankPreset", "rankFactors", "rankTieBreak",
            // 2026-11-25 协议扩展：召回区域/时段优先、类目层级、插入动效进入白名单；
            // 均为可选键（存量 v1 参数无这些键仍合法），出现则必须取值合法。
            "categoryMatchLevel", "regionScope", "timeSlotPriority", "timeSlotFill", "insertStyle", "insertAnimMs");
    private static final Set<String> METRICS = Set.of("cosine", "weightedJaccard");
    private static final Set<String> MODES = Set.of("merchantSimilar", "userSimilar", "sameCategory");
    private static final Set<String> CATEGORY_LEVELS = Set.of("primary", "secondary", "tertiary");
    private static final Set<String> REGION_SCOPES = Set.of("delivery", "tradeArea");
    private static final Set<String> TIME_SLOT_FILLS = Set.of("adjacent", "any");
    private static final Set<String> INSERT_STYLES = Set.of("fade", "slide", "none");
    private static final Set<String> RANK_PRESETS = Set.of("matchFirst", "consumeFirst", "custom");
    /** 因子词表与前端投流 RANK_FACTOR_OPTIONS 同一词表（含匹配标签热度），相似引擎插入排序直接复用。 */
    private static final Set<String> RANK_FACTORS = Set.of("match", "quality", "distance", "traffic", "tagHeat");
    /** 决胜词表与前端 RANK_TIE_BREAK_OPTIONS 一致；storeId 不再出现在界面，但作为存量参数与轴无关的确定性兜底继续受理。 */
    private static final Set<String> TIE_BREAKS = Set.of(
            "storeId", "trafficDirection", "quality", "distance", "random", "tagHeat", "match");
    /** 决胜项→主排序因子映射（单一真源在前端，服务端镜像一份以不信任前端过滤结果）。 */
    private static final Map<String, String> TIE_TO_FACTOR = Map.of(
            "trafficDirection", "traffic", "quality", "quality", "distance", "distance",
            "tagHeat", "tagHeat", "match", "match");

    private AdSimilarAlgorithmParams() { }

    public static boolean isSimilarType(Integer algoType) {
        return algoType != null && algoType == ALGORITHM_TYPE;
    }

    /** 校验并返回规范化参数；任何非法结构/取值一律 422，不做默认值静默覆盖。 */
    public static Map<String, Object> validate(Map<String, Object> params) {
        if (params == null) throw invalid();
        Map<String, Object> copy = new LinkedHashMap<>(params);
        JsonNode node = JSON.valueToTree(copy);
        if (!node.isObject()) throw invalid();
        node.fieldNames().forEachRemaining(key -> {
            if (!ROOT_KEYS.contains(key)) throw invalid();
        });
        if (integer(node.get("schemaVersion"), SCHEMA_VERSION, SCHEMA_VERSION) != SCHEMA_VERSION) throw invalid();
        if (integer(node.get("targetType"), STORE_TARGET, STORE_TARGET) != STORE_TARGET) throw invalid();
        JsonNode businesses = node.get("applicableBusinessTypes");
        if (businesses == null || !businesses.isArray() || businesses.isEmpty()) throw invalid();
        businesses.forEach(b -> integer(b, 1, 2));
        JsonNode scenes = node.get("supportedScenes");
        if (scenes == null || !scenes.isArray() || scenes.size() != 1
                || integer(scenes.get(0), SCENE_DETAIL_RETURN, SCENE_DETAIL_RETURN) != SCENE_DETAIL_RETURN) throw invalid();
        JsonNode tagPolicy = node.get("tagPolicy");
        if (tagPolicy == null || !tagPolicy.isObject()) throw invalid();
        tagPolicy.fieldNames().forEachRemaining(key -> {
            if (!TAG_POLICY_KEYS.contains(key)) throw invalid();
        });
        integer(tagPolicy.get("merchantMinimum"), 1, 1000);
        integer(tagPolicy.get("userMinimum"), 1, 100);
        JsonNode rules = node.get("similarRules");
        if (rules == null || !rules.isObject()) throw invalid();
        rules.fieldNames().forEachRemaining(key -> {
            if (!RULE_KEYS.contains(key)) throw invalid();
        });
        String metric = text(rules.get("metric"), METRICS);
        integer(rules.get("merchantSimilarityThreshold"), 1, 100);
        JsonNode modes = rules.get("modes");
        if (modes == null || !modes.isArray() || modes.isEmpty()) throw invalid();
        List<String> modeList = new java.util.ArrayList<>();
        modes.forEach(m -> {
            String value = m == null || !m.isTextual() ? null : m.asText();
            if (value == null || !MODES.contains(value)) throw invalid();
            modeList.add(value);
        });
        int resultCount = integer(rules.get("resultCount"), 1, 2);
        String slot1 = text(rules.get("slot1Source"), MODES);
        String slot2 = text(rules.get("slot2Source"), MODES);
        if (!modeList.contains(slot1)) throw invalid();
        if (resultCount == 2 && !modeList.contains(slot2)) throw invalid();
        if (!modeList.contains("merchantSimilar") && rules.has("merchantSimilarityThreshold")) throw invalid();
        if (!modeList.contains("userSimilar") && rules.has("userSimilarityThreshold")) throw invalid();
        if (modeList.contains("userSimilar")) integer(rules.get("userSimilarityThreshold"), 1, 100);
        String trigger = text(rules.get("triggerMode"), Set.of("instant", "dwell"));
        if ("dwell".equals(trigger)) integer(rules.get("dwellSeconds"), 3, 120);
        String dailyMode = text(rules.get("dailyLimitMode"), Set.of("unlimited", "limited"));
        if ("limited".equals(dailyMode)) integer(rules.get("dailyLimit"), 1, 50);
        decimal(rules.get("merchantFreqHours"), 0.5, 24);
        integer(rules.get("merchantFreqTimes"), 1, 20);
        String preset = text(rules.get("rankPreset"), RANK_PRESETS);
        JsonNode factors = rules.get("rankFactors");
        List<String> factorList = new java.util.ArrayList<>();
        if ("custom".equals(preset)) {
            if (factors == null || !factors.isArray() || factors.isEmpty()) throw invalid();
            factors.forEach(f -> {
                String value = f == null || !f.isTextual() ? null : f.asText();
                if (value == null || !RANK_FACTORS.contains(value)) throw invalid();
                factorList.add(value);
            });
        } else if (factors != null && factors.isArray() && factors.size() != 0) throw invalid();
        String tieBreak = text(rules.get("rankTieBreak"), TIE_BREAKS);
        requireLiveTieBreak(preset, factorList, tieBreak);
        // 可选扩展键：勾了同類目來源则类目层级必存在；其余出现即校值。
        if (modeList.contains("sameCategory")) text(rules.get("categoryMatchLevel"), CATEGORY_LEVELS);
        else optionalText(rules.get("categoryMatchLevel"), CATEGORY_LEVELS);
        optionalText(rules.get("regionScope"), REGION_SCOPES);
        optionalBoolean(rules.get("timeSlotPriority"));
        optionalText(rules.get("timeSlotFill"), TIME_SLOT_FILLS);
        optionalText(rules.get("insertStyle"), INSERT_STYLES);
        if (rules.has("insertAnimMs")) integer(rules.get("insertAnimMs"), 120, 1200);
        if (metric == null) throw invalid();
        return copy;
    }

    /**
     * 死选项与自定义决胜范围的服务端镜像（与前端 tieOptions 过滤逐条对齐）：
     * <ul>
     *   <li>决胜维度≡主排序单一轴时永远打不平同分：匹配优先×匹配分、消耗优先×余量方向、自定义仅勾单因子×该因子映射；</li>
     *   <li>自定义模式只接受已勾因子映射的决胜，随机探索与匹配标签热度作为探索轴不受勾选限制（同前端口径）；</li>
     *   <li>storeId 与轴无关，全模式受理，仅作为存量参数的确定性兜底。</li>
     * </ul>
     */
    private static void requireLiveTieBreak(String preset, List<String> factors, String tieBreak) {
        if ("storeId".equals(tieBreak) || "random".equals(tieBreak)) return;
        if ("matchFirst".equals(preset)) {
            if ("match".equals(tieBreak)) throw invalid();
            return;
        }
        if ("consumeFirst".equals(preset)) {
            if ("trafficDirection".equals(tieBreak)) throw invalid();
            return;
        }
        String axis = TIE_TO_FACTOR.get(tieBreak);
        if (axis == null) throw invalid();
        // 热度作为探索轴可未勾就选（前端同口径）；其余决胜必须对应已勾因子，否则「没勾质量却能按质量决胜」。
        if (!"tagHeat".equals(axis) && !factors.contains(axis)) throw invalid();
        if (factors.size() == 1 && factors.contains(axis)) throw invalid();
    }

    public static String encode(Map<String, Object> params) {
        try {
            return JSON.writeValueAsString(params);
        } catch (Exception ex) {
            throw invalid();
        }
    }

    public static Map<String, Object> read(String value) {
        if (value == null || value.isBlank()) return new LinkedHashMap<>();
        try {
            if (value.length() > 131072) throw invalid();
            JsonNode node = JSON.readTree(value);
            if (!node.isObject()) throw invalid();
            return JSON.convertValue(node, JSON.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw invalid();
        }
    }

    /** 规范化摘要：键排序后序列化再 SHA-256，供排查与一致性比对。 */
    public static String contentHash(Map<String, Object> params) {
        try {
            JsonNode node = JSON.valueToTree(params);
            String canonical = JSON.writeValueAsString(sorted(node));
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte b : hash) builder.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return builder.toString();
        } catch (Exception ex) {
            throw invalid();
        }
    }

    private static JsonNode sorted(JsonNode node) {
        if (!node.isObject()) return node;
        var sortedMap = new java.util.TreeMap<String, JsonNode>();
        node.fields().forEachRemaining(entry -> sortedMap.put(entry.getKey(), sorted(entry.getValue())));
        return JSON.valueToTree(sortedMap);
    }

    private static int integer(JsonNode value, int min, int max) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw invalid();
        int number = value.intValue();
        if (number < min || number > max) throw invalid();
        return number;
    }

    private static void decimal(JsonNode value, double min, double max) {
        if (value == null || !value.isNumber()) throw invalid();
        double number = value.doubleValue();
        if (!Double.isFinite(number) || number < min || number > max) throw invalid();
        if (Math.round(number * 10) != number * 10) throw invalid();
    }

    private static String text(JsonNode value, Set<String> allowed) {
        if (value == null || !value.isTextual() || !allowed.contains(value.asText())) throw invalid();
        return value.asText();
    }

    /** 可选文本键：缺省合法（存量 v1 参数无键），出现则必须取合法值。 */
    private static String optionalText(JsonNode value, Set<String> allowed) {
        return value == null ? null : text(value, allowed);
    }

    private static void optionalBoolean(JsonNode value) {
        if (value != null && !value.isBoolean()) throw invalid();
    }

    public static BusinessException invalid() {
        return new BusinessException(422, "交互式相似推薦配置格式或取值無效");
    }
}
