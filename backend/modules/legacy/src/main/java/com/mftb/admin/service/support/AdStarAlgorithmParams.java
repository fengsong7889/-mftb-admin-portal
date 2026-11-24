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
import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.entity.AdAlgorithm;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 星星配置协议；商品展示资格属于团购业务服务，不能借配置字段绕过。 */
public final class AdStarAlgorithmParams {
    public static final int ALGORITHM_TYPE = 1;
    public static final int SCHEMA_VERSION = 1;
    public static final int STORE = 1;
    public static final int PRODUCT = 2;
    public static final int GROUP_BUY_BUSINESS = 2;
    private static final int MAX_REVISION = Integer.MAX_VALUE - 1;
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Set<String> PROTOCOL_KEYS = Set.of("schemaVersion", "applicableBusinessTypes", "targetType",
            "revision", "productRules", "storeRules", "legacyParams");
    private static final Set<String> PRODUCT_KEYS = Set.of("consistencyCheckInterval", "exposureStrategy");
    private static final Set<String> STORE_KEYS = Set.of("consistencyCheckInterval", "merchantExposureStrategy",
            "statusOpen", "statusRest", "statusOverwhelmed", "statusClosed");

    private AdStarAlgorithmParams() { }

    public record Metadata(boolean versioned, int targetType, int revision) { }

    public static boolean hasProtocol(Map<String, Object> params) {
        return params != null && params.keySet().stream().anyMatch(PROTOCOL_KEYS::contains);
    }

    /** 无法解析的旧数据不得默默当空配置覆盖；错误不携带原始 JSON。 */
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

    public static Metadata metadata(Map<String, Object> params) {
        if (!hasProtocol(params)) return new Metadata(false, STORE, 0);
        JsonNode node = JSON.valueToTree(params);
        if (node.size() > PROTOCOL_KEYS.size()) throw invalid();
        node.fieldNames().forEachRemaining(key -> { if (!PROTOCOL_KEYS.contains(key)) throw invalid(); });
        if (integer(node.get("schemaVersion"), SCHEMA_VERSION, SCHEMA_VERSION) != SCHEMA_VERSION) throw invalid();
        int target = integer(node.get("targetType"), STORE, PRODUCT);
        int revision = integer(node.get("revision"), 0, MAX_REVISION);
        JsonNode businesses = node.get("applicableBusinessTypes");
        if (businesses == null || !businesses.isArray() || businesses.size() != 1
                || integer(businesses.get(0), GROUP_BUY_BUSINESS, GROUP_BUY_BUSINESS) != GROUP_BUY_BUSINESS) throw invalid();
        JsonNode rules = node.get(target == PRODUCT ? "productRules" : "storeRules");
        if (rules == null || !rules.isObject() || node.has(target == PRODUCT ? "storeRules" : "productRules")) throw invalid();
        Set<String> fields = target == PRODUCT ? PRODUCT_KEYS : STORE_KEYS;
        if (rules.size() != fields.size()) throw invalid();
        rules.fieldNames().forEachRemaining(key -> { if (!fields.contains(key)) throw invalid(); });
        integer(rules.get("consistencyCheckInterval"), 1, 1440);
        if (target == PRODUCT) {
            JsonNode strategy = rules.get("exposureStrategy");
            if (strategy == null || !strategy.isTextual() || !Set.of("roundRobin", "random").contains(strategy.textValue())) throw invalid();
            if (node.has("legacyParams")) throw invalid();
        } else {
            if (!"random".equals(rules.path("merchantExposureStrategy").asText())) throw invalid();
            for (String key : List.of("statusOpen", "statusRest", "statusOverwhelmed", "statusClosed")) {
                if (!rules.path(key).isBoolean()) throw invalid();
            }
            if (!rules.path("statusOpen").booleanValue()) throw invalid();
            if (node.has("legacyParams") && !node.get("legacyParams").isObject()) throw invalid();
        }
        return new Metadata(true, target, revision);
    }

    /** 新版记录不能被旧客户端降级、改目标或改品牌；存量默认门店，不自动迁移成商品。 */
    public static Map<String, Object> prepare(AdAlgorithm current, AdAlgorithmRequest request) {
        boolean star = Objects.equals(request.getAlgoType(), ALGORITHM_TYPE);
        boolean oldStar = current != null && Objects.equals(current.getAlgoType(), ALGORITHM_TYPE);
        if (!star && !oldStar && !hasProtocol(request.getParams())) return request.getParams();
        Map<String, Object> incoming = request.getParams() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(request.getParams());
        Metadata next = metadata(incoming);
        Metadata old = current == null ? null : metadata(read(current.getParams()));
        if ((next.versioned() || (old != null && old.versioned())) && !star) throw invalid();
        if (current != null && oldStar && !Objects.equals(current.getAlgoType(), request.getAlgoType())) throw invalid();
        if (old != null && old.versioned() && !next.versioned()) throw invalid();
        if (!next.versioned()) return request.getParams();
        if (request.getAlgoName() == null || request.getAlgoName().isBlank() || request.getAlgoName().length() > 100
                || !Set.of("flashBee", "mFood").contains(Objects.toString(request.getBrand(), ""))) throw invalid();
        if (request.getStatus() != null && request.getStatus() != 1 && request.getStatus() != 2) throw invalid();
        if (request.getChannel() != null || request.getPlacementInterface() != null || request.getSlotCount() != null) throw invalid();
        if (current == null) {
            if (next.revision() != 0) throw conflict();
        } else {
            if (!Objects.equals(current.getAlgoType(), ALGORITHM_TYPE)
                    || !Objects.equals(current.getBrand(), request.getBrand()) || old.targetType() != next.targetType()) throw invalid();
            if (old.revision() != next.revision()) throw conflict();
        }
        incoming.put("revision", next.revision() + 1);
        if (encode(incoming).length() > 131072) throw invalid();
        return incoming;
    }

    /** 旧销售、盘活及新店链路仍只接受门店协议；商品算法的投放开放由各链路显式裁决。 */
    public static void requireStoreCompatible(AdAlgorithm algorithm) {
        if (algorithm == null) throw new BusinessException("關聯算法不存在");
        if (Objects.equals(algorithm.getAlgoType(), ALGORITHM_TYPE)
                && metadata(read(algorithm.getParams())).targetType() != STORE) {
            throw new BusinessException(422, "商品算法尚未接入銷售與投放，不能綁定此配置");
        }
    }

    /** 是否无敌星星算法（algo_type=1）。 */
    public static boolean isStar(AdAlgorithm algorithm) {
        return algorithm != null && Objects.equals(algorithm.getAlgoType(), ALGORITHM_TYPE);
    }

    /** 星星算法的推广对象：无协议旧记录按门店读；非星星算法返回 null。 */
    public static Integer starTargetType(AdAlgorithm algorithm) {
        if (!isStar(algorithm)) return null;
        Map<String, Object> params = read(algorithm.getParams());
        return hasProtocol(params) ? metadata(params).targetType() : STORE;
    }

    /** 瀑布流坑位维度裁决：商品维度只能绑商品星星；门店维度拒绝商品星星，其余照旧。 */
    public static void requireWaterfallDimension(AdAlgorithm algorithm, int contentType) {
        if (!isStar(algorithm)) {
            if (contentType == PRODUCT) throw new BusinessException(422, "商品維度瀑布流只能綁定商品無敵星星算法");
            return;
        }
        int target = starTargetType(algorithm);
        if (target != contentType) {
            throw new BusinessException(422, contentType == PRODUCT
                    ? "商品維度瀑布流只能綁定商品類無敵星星算法"
                    : "門店維度瀑布流不能綁定商品類無敵星星算法");
        }
    }

    public static String encode(Map<String, Object> params) {
        try { return JSON.writeValueAsString(params); }
        catch (Exception ex) { throw invalid(); }
    }

    private static int integer(JsonNode value, int min, int max) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw invalid();
        int number = value.intValue();
        if (number < min || number > max) throw invalid();
        return number;
    }

    public static BusinessException conflict() { return new BusinessException(409, "配置已被修改，請重新載入後再保存"); }
    private static BusinessException invalid() { return new BusinessException(422, "無敵星星配置格式、版本或推廣對象無效"); }
}
