/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.support.AdSimilarAlgorithmParams;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** type17 参数协议校验矩阵：非法结构/取值一律拒绝，不做默认值静默覆盖。 */
class AdSimilarAlgorithmParamsTest {

    static Map<String, Object> rules() {
        Map<String, Object> rules = new java.util.LinkedHashMap<>();
        rules.put("metric", "cosine");
        rules.put("merchantSimilarityThreshold", 60);
        rules.put("modes", List.of("merchantSimilar"));
        rules.put("resultCount", 1);
        rules.put("slot1Source", "merchantSimilar");
        rules.put("slot2Source", "merchantSimilar");
        rules.put("triggerMode", "instant");
        rules.put("dailyLimitMode", "unlimited");
        rules.put("merchantFreqHours", 2);
        rules.put("merchantFreqTimes", 1);
        rules.put("rankPreset", "matchFirst");
        rules.put("rankTieBreak", "storeId");
        return rules;
    }

    static Map<String, Object> valid() {
        Map<String, Object> params = new java.util.LinkedHashMap<>();
        params.put("schemaVersion", 1);
        params.put("targetType", 1);
        params.put("applicableBusinessTypes", List.of(1, 2));
        params.put("supportedScenes", List.of(1));
        params.put("tagPolicy", Map.of("merchantMinimum", 50, "userMinimum", 10));
        params.put("similarRules", rules());
        return params;
    }

    @Test
    void validParamsPassAndRoundTrip() {
        Map<String, Object> params = valid();
        assertEquals(params, assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params)));
        assertEquals(params, AdSimilarAlgorithmParams.read(AdSimilarAlgorithmParams.encode(params)));
    }

    @Test
    void unknownOrMissingRootKeysRejected() {
        Map<String, Object> extra = new java.util.HashMap<>(valid());
        extra.put("decayDays", 7);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(extra));
        Map<String, Object> missing = new java.util.HashMap<>(valid());
        missing.remove("tagPolicy");
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(missing));
    }

    @Test
    void decayFieldsAreNotAcceptedInsideAlgorithmParams() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        params.put("tagPolicy", Map.of("merchantMinimum", 50, "userMinimum", 10, "merchantDecayDays", 7));
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    @Test
    void slotSourcesMustBeEnabledModes() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> rules = rules();
        rules.put("resultCount", 2);
        rules.put("slot2Source", "userSimilar");
        params.put("similarRules", rules);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    @Test
    void dwellAndLimitedRequireThresholds() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> rules = rules();
        rules.put("triggerMode", "dwell");
        rules.put("dailyLimitMode", "limited");
        params.put("similarRules", rules);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    @Test
    void rangesAndEnumsEnforced() {
        for (Map<String, Object> rules : List.<Map<String, Object>>of(
                Map.of("metric", (Object) "overlap"),
                Map.of("resultCount", (Object) 3),
                Map.of("merchantFreqHours", (Object) 0.25),
                Map.of("rankPreset", (Object) "custom"),
                Map.of("rankTieBreak", (Object) "popularity"),
                Map.of("rankTieBreak", (Object) "similar"))) {
            Map<String, Object> params = new java.util.HashMap<>(valid());
            Map<String, Object> merged = rules();
            merged.putAll(rules);
            params.put("similarRules", merged);
            assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
        }
    }

    /** 因子/决胜词表与前端投流单一真源对齐：tagHeat 可勾、新决胜值可用，storeId 仅作存量兜底。 */
    @Test
    void trafficSharedVocabularyIsAccepted() {
        for (String tie : List.of("trafficDirection", "quality", "distance", "random", "tagHeat", "storeId")) {
            Map<String, Object> params = new java.util.HashMap<>(valid());
            Map<String, Object> merged = rules();
            merged.put("rankTieBreak", tie);
            params.put("similarRules", merged);
            assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
        }
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> merged = rules();
        merged.put("rankPreset", "custom");
        merged.put("rankFactors", List.of("match", "quality", "distance", "traffic", "tagHeat"));
        merged.put("rankTieBreak", "tagHeat");
        params.put("similarRules", merged);
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
        merged.put("rankFactors", List.of("popularity"));
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    /** 死选项服务端镜像：决胜轴≡主排序单一轴时永远打不平同分，不得保存。 */
    @Test
    void deadTieBreaksRejectedOnEveryPreset() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> merged = rules();
        merged.put("rankPreset", "matchFirst");
        merged.put("rankTieBreak", "match");
        params.put("similarRules", merged);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));

        merged = rules();
        merged.put("rankPreset", "consumeFirst");
        merged.put("rankTieBreak", "trafficDirection");
        params.put("similarRules", merged);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));

        merged = rules();
        merged.put("rankPreset", "custom");
        merged.put("rankFactors", List.of("quality"));
        merged.put("rankTieBreak", "quality");
        params.put("similarRules", merged);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    /** 自定义模式决胜只能取已勾因子映射（热度/随机除外）；多因子时同轴决胜仍有效。 */
    @Test
    void customTieBreakMustMapToCheckedFactor() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> merged = rules();
        merged.put("rankPreset", "custom");
        merged.put("rankFactors", List.of("distance", "match"));
        merged.put("rankTieBreak", "quality");
        params.put("similarRules", merged);
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
        merged.put("rankTieBreak", "match");
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
        merged.put("rankTieBreak", "tagHeat");
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
    }

    @Test
    void customRankRequiresFactorsAndTrafficFactorAllowedOnlyHere() {
        Map<String, Object> params = new java.util.HashMap<>(valid());
        Map<String, Object> rules = rules();
        rules.put("rankPreset", "custom");
        rules.put("rankFactors", List.of("match", "traffic"));
        params.put("similarRules", rules);
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
        rules.put("rankFactors", List.of());
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> castRules(Map<String, Object> params) {
        return (Map<String, Object>) params.get("similarRules");
    }

    @Test
    void presentationExtensionKeysAreOptionalThenValidated() {
        // 存量 v1 参数（无扩展键）仍合法：新键一律可选，不因协议扩展打断存量保存。
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(valid()));
        Map<String, Object> withExtras = valid();
        Map<String, Object> rules = castRules(withExtras);
        rules.put("regionScope", "delivery");
        rules.put("timeSlotPriority", true);
        rules.put("timeSlotFill", "adjacent");
        rules.put("insertStyle", "slide");
        rules.put("insertAnimMs", 1000);
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(withExtras));
        assertThrows(BusinessException.class, () -> {
            Map<String, Object> bad = valid();
            castRules(bad).put("regionScope", "global");
            AdSimilarAlgorithmParams.validate(bad);
        });
        assertThrows(BusinessException.class, () -> {
            Map<String, Object> bad = valid();
            castRules(bad).put("timeSlotPriority", 1);
            AdSimilarAlgorithmParams.validate(bad);
        });
        assertThrows(BusinessException.class, () -> {
            Map<String, Object> bad = valid();
            castRules(bad).put("insertAnimMs", 100);
            AdSimilarAlgorithmParams.validate(bad);
        });
        assertThrows(BusinessException.class, () -> {
            Map<String, Object> bad = valid();
            castRules(bad).put("insertStyle", "zoom");
            AdSimilarAlgorithmParams.validate(bad);
        });
    }

    @Test
    void sameCategoryModeRequiresCategoryMatchLevel() {
        Map<String, Object> params = valid();
        Map<String, Object> rules = castRules(params);
        rules.put("modes", List.of("merchantSimilar", "sameCategory"));
        rules.put("slot2Source", "sameCategory");
        // 勾了同類目來源但缺類目層級 → 拒；非法枚举同样拒。
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
        rules.put("categoryMatchLevel", "tertiary");
        assertDoesNotThrow(() -> AdSimilarAlgorithmParams.validate(params));
        rules.put("categoryMatchLevel", "quaternary");
        assertThrows(BusinessException.class, () -> AdSimilarAlgorithmParams.validate(params));
    }

    @Test
    void contentHashIsStableAcrossKeyOrder() {
        Map<String, Object> a = valid();
        Map<String, Object> b = new java.util.TreeMap<>(a);
        assertEquals(AdSimilarAlgorithmParams.contentHash(a), AdSimilarAlgorithmParams.contentHash(b));
        assertEquals(64, AdSimilarAlgorithmParams.contentHash(a).length());
    }
}
