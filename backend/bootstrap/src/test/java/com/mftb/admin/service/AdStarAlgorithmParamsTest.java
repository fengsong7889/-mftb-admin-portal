/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.service.support.AdStarAlgorithmParams;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AdStarAlgorithmParamsTest {
    static Map<String, Object> product(int revision) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("schemaVersion", 1);
        params.put("applicableBusinessTypes", List.of(2));
        params.put("targetType", 2);
        params.put("revision", revision);
        params.put("productRules", Map.of("consistencyCheckInterval", 5, "exposureStrategy", "roundRobin"));
        return params;
    }
    static AdAlgorithmRequest request(Map<String, Object> params) {
        AdAlgorithmRequest request = new AdAlgorithmRequest();
        request.setAlgoName("团购商品星星");
        request.setAlgoType(1);
        request.setBrand("flashBee");
        request.setParams(params);
        return request;
    }
    static AdAlgorithm record(Map<String, Object> params) {
        AdAlgorithm record = new AdAlgorithm();
        record.setId(7L);
        record.setAlgoType(1);
        record.setBrand("flashBee");
        record.setParams(AdStarAlgorithmParams.encode(params));
        return record;
    }
    /** 非星星算法（如投流 type15）：不参与推广对象裁决 */
    static AdAlgorithm nonStar(int algoType) {
        AdAlgorithm record = new AdAlgorithm();
        record.setId(9L);
        record.setAlgoType(algoType);
        record.setBrand("flashBee");
        return record;
    }
    /** 团购门店星星 v1 协议参数 */
    static Map<String, Object> store(int revision) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("schemaVersion", 1);
        params.put("applicableBusinessTypes", List.of(2));
        params.put("targetType", 1);
        params.put("revision", revision);
        params.put("storeRules", Map.of("consistencyCheckInterval", 5, "merchantExposureStrategy", "random",
                "statusOpen", true, "statusRest", false, "statusOverwhelmed", false, "statusClosed", false));
        return params;
    }

    @Test void createAndUpdateAdvanceRevisionWithoutMutatingCaller() {
        AdAlgorithmRequest create = request(product(0));
        Map<String, Object> saved = AdStarAlgorithmParams.prepare(null, create);
        assertEquals(1, saved.get("revision"));
        assertEquals(0, create.getParams().get("revision"));
        AdAlgorithm current = record(saved);
        Map<String, Object> updated = AdStarAlgorithmParams.prepare(current, request(product(1)));
        assertEquals(2, updated.get("revision"));
        assertEquals(2, AdStarAlgorithmParams.metadata(updated).targetType());
    }

    @Test void staleRevisionFailsClosed() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> AdStarAlgorithmParams.prepare(record(product(2)), request(product(1))));
        assertEquals(409, ex.getCode());
    }

    @ParameterizedTest @ValueSource(strings = {"schemaVersion", "targetType", "revision", "applicableBusinessTypes", "productRules"})
    void missingProtocolFieldsAreNotTreatedAsLegacy(String key) {
        Map<String, Object> params = product(0);
        params.remove(key);
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(null, request(params)));
    }

    @ParameterizedTest @ValueSource(strings = {"0", "-1", "1441", "1.5", "\"5\"", "null", "true"})
    void intervalMustBeAnIntegerWithinRange(String input) {
        Map<String, Object> params = product(0);
        params.put("productRules", AdStarAlgorithmParams.read("{\"consistencyCheckInterval\":" + input + ",\"exposureStrategy\":\"random\"}"));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(null, request(params)));
    }

    @Test void productDoesNotAcceptStoreOrRetiredFieldsOrUnsupportedScope() {
        Map<String, Object> both = product(0);
        both.put("storeRules", Map.of());
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.metadata(both));
        Map<String, Object> inventory = product(0);
        inventory.put("productRules", Map.of("consistencyCheckInterval", 5, "exposureStrategy", "random", "minSellableStock", 1));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.metadata(inventory));
        Map<String, Object> unknownVersion = product(0);
        unknownVersion.put("schemaVersion", 2);
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.metadata(unknownVersion));
        Map<String, Object> delivery = product(0);
        delivery.put("applicableBusinessTypes", List.of(1));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.metadata(delivery));
        Map<String, Object> bogusStrategy = product(0);
        bogusStrategy.put("productRules", Map.of("consistencyCheckInterval", 5, "exposureStrategy", "discountFirst"));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.metadata(bogusStrategy));
    }

    @Test void productCannotBeDowngradedOrChangeBrandOrMasqueradeAsAnotherAlgorithm() {
        AdAlgorithm current = record(product(1));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(current, request(Map.of("statusOpen", true))));
        AdAlgorithmRequest differentBrand = request(product(1));
        differentBrand.setBrand("mFood");
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(current, differentBrand));
        AdAlgorithmRequest wrongType = request(product(0));
        wrongType.setAlgoType(15);
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(null, wrongType));
        AdAlgorithmRequest channel = request(product(0));
        channel.setChannel(4);
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(null, channel));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.prepare(record(Map.of("statusOpen", true)), request(product(0))));
    }

    @Test void legacyStoreIsPreservedAndCanStillBeBound() {
        Map<String, Object> old = Map.of("statusOpen", true, "merchantExposureStrategy", "random", "unknownLegacyField", 17);
        assertEquals(old, AdStarAlgorithmParams.prepare(record(old), request(old)));
        assertDoesNotThrow(() -> AdStarAlgorithmParams.requireStoreCompatible(record(old)));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.requireStoreCompatible(record(product(1))));
    }

    @ParameterizedTest @ValueSource(strings = {"[]", "null", "{broken", "{} {}", "{\"a\":1,\"a\":2}"})
    void malformedPersistedParamsDoNotBecomeEmptyDefaults(String raw) {
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.read(raw));
    }

    @Test void waterfallDimensionBindsStarsByTargetTypeOnly() {
        // 门店维度：可绑门店星星、无协议旧记录与其他门店型算法（投流等）；拒绝商品星星
        assertDoesNotThrow(() -> AdStarAlgorithmParams.requireWaterfallDimension(record(store(1)), 1));
        assertDoesNotThrow(() -> AdStarAlgorithmParams.requireWaterfallDimension(record(Map.of("statusOpen", true)), 1));
        assertDoesNotThrow(() -> AdStarAlgorithmParams.requireWaterfallDimension(nonStar(15), 1));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.requireWaterfallDimension(record(product(1)), 1));
        // 商品维度：只能绑商品星星；门店星星/旧记录/任何非星星算法均拒绝
        assertDoesNotThrow(() -> AdStarAlgorithmParams.requireWaterfallDimension(record(product(1)), 2));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.requireWaterfallDimension(record(store(1)), 2));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.requireWaterfallDimension(record(Map.of("statusOpen", true)), 2));
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.requireWaterfallDimension(nonStar(15), 2));
    }

    @Test void starTargetTypeDistinguishesProtocolFromLegacyAndNonStar() {
        assertEquals(1, AdStarAlgorithmParams.starTargetType(record(store(1))));
        assertEquals(2, AdStarAlgorithmParams.starTargetType(record(product(1))));
        // 无协议旧记录按门店读，不自动升级成商品
        assertEquals(1, AdStarAlgorithmParams.starTargetType(record(Map.of("statusOpen", true))));
        assertNull(AdStarAlgorithmParams.starTargetType(nonStar(15)));
        // 非法协议不得静默降级为门店，必须报错阻断绑定
        assertThrows(BusinessException.class, () -> AdStarAlgorithmParams.starTargetType(record(Map.of("targetType", 2))));
    }
}
