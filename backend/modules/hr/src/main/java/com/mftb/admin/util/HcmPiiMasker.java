package com.mftb.admin.util;

/**
 * HCM 敏感字段脱敏（字段级权限的兜底实现）。
 * <p>
 * 为什么在服务端脱敏而不是前端隐藏：前端隐藏只是 UX，网络面板里仍然拿得到明文。
 * 方案 7 要求「敏感字段按权脱敏、明文查看留痕」，这里先解决"按权脱敏"，
 * 明文查看的审计留痕随 C5 的字段授权矩阵一起补。
 * <p>
 * 缺 permission 时返回掩码而不是报错：花名册本身要能看，只是看不到完整联系方式。
 */
public final class HcmPiiMasker {

    private HcmPiiMasker() {
    }

    /** 手机号：保留前 3 后 4，中间固定四个星号；过短的号码整体掩掉 */
    public static String mobile(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String trimmed = value.trim();
        if (trimmed.length() < 8) {
            return "****";
        }
        return trimmed.substring(0, 3) + "****" + trimmed.substring(trimmed.length() - 4);
    }

    /** 邮箱：保留首字符与域名，本地部分其余掩掉 */
    public static String email(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String trimmed = value.trim();
        int at = trimmed.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return trimmed.charAt(0) + "***" + trimmed.substring(at);
    }
}
