/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 前端语言包镜像（{@code classpath:i18n/{zh-TW,en,zh-CN}.json}）的只读视图。
 *
 * <p>为什么要有这个组件：镜像同时被两处消费——启动同步器要拿它灌 {@code sys_translation}，
 * 完成率统计要拿它当**全站 key 全集**。原先展平逻辑只长在同步器里，统计要用的话只能再抄一份，
 * 而「同一份数据两套解析」正是这一轮多语言事故的母型（繁中真源/后端镜像/数据库三处各写一遍，
 * 结果镜像悄悄腐化了一半，简体中文整片回退英文，而所有完成率读数都是 100%）。
 *
 * <p>数组型 key 一律排除（星期表头、励志语清单、通知列表等）：
 * {@code sys_translation} 是 {@code key → 字符串} 的扁平结构，结构上装不下数组；
 * 把 {@code ["週日","週一"]} 压成串灌进去，ja/ko/ru 静态包又没这些 key，
 * 取值就全靠数据库注入，i18next 认为「该语言有值」而不再回落英文数组，
 * {@code returnObjects: true} 的调用点拿到字符串后 {@code .map()} 抛错、整页被错误边界接走
 * （2026-11-06 实测事故）。数组型文案的真源只能是前端静态包。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class I18nLocaleMirror {

    /** 镜像里带的语言，与 {@code npm run i18n:sync-backend} 同步的文件名一一对应 */
    public static final String LANG_ZH_TW = "zh-TW";
    public static final String LANG_ZH_CN = "zh-CN";
    public static final String LANG_EN = "en";
    public static final List<String> MIRRORED_LANGS =
            List.of(LANG_ZH_TW, LANG_EN, LANG_ZH_CN);

    private final ObjectMapper objectMapper;

    /** 按语言缓存展平结果：镜像随 jar 分发、进程内不可变，没必要每次重解析 800KB */
    private final Map<String, Map<String, String>> cache = new ConcurrentHashMap<>();

    /** 繁中镜像的原始嵌套结构（数组型 key 判定靠它），与展平结果一样只解析一次 */
    private volatile Map<String, Object> rawRoot;

    /**
     * 指定语言的「扁平文案」镜像内容：点分 key → 文案。
     * <p>镜像文件缺失或解析失败时返回空 Map，由调用方按「该语言不参与同步 / 无法据其统计」降级，
     * 不抛异常打断启动。
     */
    public Map<String, String> textOf(String lang) {
        return cache.computeIfAbsent(lang, this::load);
    }

    /**
     * 全站需译 key 全集（以繁中真源为准）。
     * <p>完成率的分母应当是它并上库里独有 key，而不是只算库里已有记录——后者会把
     * 「前端有但没入库」的词条整段排除在分母外，六语都能刷出 100%。
     */
    public Set<String> textKeys() {
        return Collections.unmodifiableSet(textOf(LANG_ZH_TW).keySet());
    }

    /** 需译 key 总数；镜像不可用时返回 0，调用方据此退回「只按库记录统计」 */
    public int textKeyCount() {
        return textOf(LANG_ZH_TW).size();
    }

    /** 镜像是否可用（决定完成率能不能用全站口径） */
    public boolean available() {
        return !textOf(LANG_ZH_TW).isEmpty();
    }

    /**
     * 镜像里「值为数组」的点分 key（星期表头、励志语清单、通知列表等）。
     * <p>这些 key 从不进翻译表，但历史上被旧展平逻辑灌过一轮，需要据此退库。
     * <p>读不到镜像时返回空集：宁可不退，也不能因为镜像缺失就把全部字段当数组处理。
     */
    public List<String> arrayKeys() {
        Map<String, Object> root = rawRoot();
        if (root.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> keys = new ArrayList<>();
        collectListKeys("", root, keys);
        return keys;
    }

    @SuppressWarnings("unchecked")
    private static void collectListKeys(String prefix, Map<String, Object> node, List<String> out) {
        for (Map.Entry<String, Object> entry : node.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof List) {
                out.add(key);
            } else if (value instanceof Map) {
                collectListKeys(key, (Map<String, Object>) value, out);
            }
        }
    }

    /** 繁中镜像的原始嵌套结构（数组 key 判定靠它，展平后就看不出来了），只解析一次 */
    private Map<String, Object> rawRoot() {
        Map<String, Object> cached = rawRoot;
        if (cached != null) {
            return cached;
        }
        Map<String, Object> parsed = Collections.emptyMap();
        ClassPathResource resource = new ClassPathResource("i18n/" + LANG_ZH_TW + ".json");
        if (resource.exists()) {
            try (InputStream is = resource.getInputStream()) {
                String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                parsed = objectMapper.readValue(json, new TypeReference<>() {});
            } catch (Exception e) {
                log.warn("多语言模块: 解析 i18n/{}.json 失败，数组型 key 判定返回空集: {}", LANG_ZH_TW, e.getMessage());
            }
        } else {
            log.warn("多语言模块: classpath:i18n/{}.json 不存在，数组型 key 判定返回空集", LANG_ZH_TW);
        }
        rawRoot = parsed;
        return parsed;
    }

    private Map<String, String> load(String lang) {
        ClassPathResource resource = new ClassPathResource("i18n/" + lang + ".json");
        if (!resource.exists()) {
            log.warn("多语言模块: classpath:i18n/{}.json 不存在，该语言不参与字段同步与全站口径统计", lang);
            return Collections.emptyMap();
        }
        Map<String, String> flat = new LinkedHashMap<>();
        try (InputStream is = resource.getInputStream()) {
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
            flatten("", root, flat);
        } catch (Exception e) {
            log.warn("多语言模块: 读取 i18n/{}.json 失败: {}", lang, e.getMessage());
            return Collections.emptyMap();
        }
        return Collections.unmodifiableMap(flat);
    }

    /** 递归展平为点分键；嵌套对象继续下钻，数组直接跳过，标量按字符串收录 */
    @SuppressWarnings("unchecked")
    private static void flatten(String prefix, Map<String, Object> node, Map<String, String> result) {
        for (Map.Entry<String, Object> entry : node.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map) {
                flatten(key, (Map<String, Object>) value, result);
            } else if (value instanceof List) {
                // 见类注释：数组型文案不进翻译表，也不计入需译全集
                log.debug("多语言模块: 数组型 key 不进翻译表, 已跳过: {}", key);
            } else if (value != null) {
                result.put(key, value.toString());
            }
        }
    }
}
