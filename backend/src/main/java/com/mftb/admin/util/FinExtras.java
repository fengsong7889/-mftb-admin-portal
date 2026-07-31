package com.mftb.admin.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 财务模块 extra 扩展数据读取工具（键名与前端提交的 extra 完全一致）
 */
public final class FinExtras {

    /** 空值占位符（与前端表格展示一致） */
    public static final String DASH = "--";

    /** 门店选项文案末尾的门店ID/编码，如「廣州酒家(123456789)」「珠海前山分店(MD00007)」 */
    private static final Pattern STORE_ID = Pattern.compile("\\(([A-Za-z0-9_-]+)\\)\\s*$");

    private FinExtras() {
    }

    /** 读取字符串，缺失时返回 null */
    public static String text(Map<String, Object> extra, String key) {
        Object value = extra == null ? null : extra.get(key);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    /** 读取字符串，缺失时返回 -- */
    public static String textOrDash(Map<String, Object> extra, String key) {
        String text = text(extra, key);
        return text == null ? DASH : text;
    }

    /** 读取金额，缺失或非法时返回 0 */
    public static BigDecimal amount(Map<String, Object> extra, String key) {
        String text = text(extra, key);
        if (text == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    /** 读取布尔标记 */
    public static boolean flag(Map<String, Object> extra, String key) {
        Object value = extra == null ? null : extra.get(key);
        return value instanceof Boolean bool ? bool : Boolean.parseBoolean(String.valueOf(value));
    }

    /** 读取对象数组（门店明细等） */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> rows(Map<String, Object> extra, String key) {
        Object value = extra == null ? null : extra.get(key);
        if (!(value instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                rows.add((Map<String, Object>) map);
            }
        }
        return rows;
    }

    /** 门店明细行的门店ID（优先取 storeId 字段，回退从 storeLabel 解析） */
    public static String storeId(Map<String, Object> row) {
        String storeId = text(row, "storeId");
        return storeId != null ? storeId : storeIdOf(text(row, "storeLabel"));
    }

    /** 门店明细行的门店名称 */
    public static String storeName(Map<String, Object> row) {
        return storeNameOf(text(row, "storeLabel"));
    }

    /** 从门店选项文案中提取门店ID，如「廣州酒家(123456789)」-> 123456789 */
    public static String storeIdOf(String label) {
        if (label == null) {
            return DASH;
        }
        Matcher matcher = STORE_ID.matcher(label);
        return matcher.find() ? matcher.group(1) : DASH;
    }

    /** 从门店选项文案中提取门店名称（去掉括号内门店ID） */
    public static String storeNameOf(String label) {
        if (label == null) {
            return DASH;
        }
        String name = STORE_ID.matcher(label).replaceAll("").trim();
        return name.isEmpty() ? DASH : name;
    }

    /** 金额保留两位小数（四舍五入） */
    public static BigDecimal round2(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    /** null 安全取值 */
    public static BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
