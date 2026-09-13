package com.mftb.admin.util;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 通用取值/类型转换工具: 集中各业务实现类中重复的私有转换方法。
 * 语义约定: toStr/toBigDecimal 对 null 透传返回 null（区别于空串兜底场景）;
 * str(Map, key) 用于表单 JSON 等动态字段, 缺失时返回空串;
 * toLong/toInt 解析失败时回退调用方指定的默认值。
 */
public final class ConvertUtils {

    private ConvertUtils() {
    }

    /** Object → String（null → null，不产生 "null" 字符串） */
    public static String toStr(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /** Map 取字符串（key 缺失或值为 null → 空串） */
    public static String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : "";
    }

    /** Object → Long（支持 Number 与数字字符串，解析失败回退默认值） */
    public static Long toLong(Object value, Long def) {
        if (value == null) return def;
        if (value instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(value.toString());
        } catch (Exception e) {
            return def;
        }
    }

    /** Object → Integer（支持 Number 与数字字符串，解析失败回退默认值） */
    public static Integer toInt(Object value, Integer def) {
        if (value == null) return def;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(value.toString());
        } catch (Exception e) {
            return def;
        }
    }

    /** Number → BigDecimal（null → null；Integer/Long 精确转换，其余经 double） */
    public static BigDecimal toBigDecimal(Number value) {
        if (value == null) return null;
        if (value instanceof Integer i) return BigDecimal.valueOf(i);
        if (value instanceof Long l) return BigDecimal.valueOf(l);
        return BigDecimal.valueOf(value.doubleValue());
    }
}
