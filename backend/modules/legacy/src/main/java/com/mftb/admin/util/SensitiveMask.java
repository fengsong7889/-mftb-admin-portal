package com.mftb.admin.util;

import com.mftb.admin.constant.HrAuditAction;

/**
 * 敏感值脱敏（唯一实现）。
 * <p>
 * 之前脱敏只存在于员工服务的私有方法里，人事审计要落「变更前后值」时必须有同一套规则：
 * 两份实现迟早会漂移，而漂移的后果是「列表看不到证件号、审计里看得到」—— 等于绕过字段权限。
 * 因此列表/详情/审计一律走这里，新增加密的敏感字段只在这里补一次。
 */
public final class SensitiveMask {

    private SensitiveMask() {
    }

    /** 证件号：保留前 4 后 4，其余打码；过短则全码 */
    public static String maskIdNumber(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String text = value.trim();
        if (text.length() <= 8) {
            return "******";
        }
        return text.substring(0, 4) + "*".repeat(text.length() - 8) + text.substring(text.length() - 4);
    }

    /** 地址/住址：保留行政区划前缀，其余打码 */
    public static String maskAddress(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String text = value.trim();
        int keep = Math.min(6, text.length());
        return text.substring(0, keep) + "****";
    }

    /** 手机号：保留前 3 后 4 */
    public static String maskMobile(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String text = value.trim();
        if (text.length() <= 7) {
            return "****";
        }
        return text.substring(0, 3) + "****" + text.substring(text.length() - 4);
    }

    /** 邮箱：保留首字符与域名 */
    public static String maskEmail(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String text = value.trim();
        int at = text.indexOf('@');
        if (at <= 0) {
            return "****";
        }
        return text.charAt(0) + "****" + text.substring(at);
    }

    /**
     * 按字段名脱敏：命中 {@link HrAuditAction#SENSITIVE_FIELDS} 才处理，其余原样返回。
     * <p>字段清单与脱敏规则同源，避免「新加了敏感字段但忘了在审计里脱敏」——
     * 未登记的字段会被原样写进审计，因此新增敏感字段必须同时补 {@code SENSITIVE_FIELDS}。
     */
    public static String maskValue(String field, Object value) {
        String text = value == null ? null : String.valueOf(value);
        if (text == null || !HrAuditAction.isSensitiveField(field)) {
            return text;
        }
        return switch (field) {
            case "idNumber" -> maskIdNumber(text);
            case "mobile" -> maskMobile(text);
            case "email" -> maskEmail(text);
            // 住址类与出生日期：只保留可辨认的粗粒度信息
            case "idAddress", "addressDetail" -> maskAddress(text);
            default -> maskAddress(text);
        };
    }
}
