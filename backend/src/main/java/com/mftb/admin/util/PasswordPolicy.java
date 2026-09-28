package com.mftb.admin.util;

import com.mftb.admin.entity.SysUser;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 登录密码强度策略（用户自助改密口径）。
 * <p>对齐主流企业身份系统（Microsoft Entra ID / Okta / 阿里云 RAM）的通行规则：
 * 长度下限 8、四类字符至少满足三类、不得包含个人身份信息、不得命中常见弱口令与连续序列。
 * <p>前后端同一口径：前端 {@code src/utils/passwordPolicy.ts} 做实时清单反馈，
 * 本类是最终裁决——绕过前端也必须被拒，且违规项一次性全部返回，避免用户反复试错。
 */
public final class PasswordPolicy {

    /** 最小长度：企业系统通用下限（6 位纯数字已可被秒级爆破） */
    public static final int MIN_LENGTH = 8;
    /** 最大长度：与 DB 字段与输入框 maxLength 保持一致，避免超长 BCrypt 计算 */
    public static final int MAX_LENGTH = 32;
    /** 四类字符（大写/小写/数字/特殊）至少命中的类别数 */
    public static final int MIN_CATEGORIES = 3;
    /** 个人信息片段达到该长度才判定，避免 2 字姓名等误伤 */
    private static final int PERSONAL_TOKEN_MIN_LEN = 3;
    /** 连续递增/递减序列达到该长度视为顺序口令（如 123456、abcdef） */
    private static final int SEQUENCE_MIN_LEN = 5;
    /** 同一字符占比阈值（如 aaaaaaaa） */
    private static final double REPEAT_RATIO = 0.7;

    /** 常见弱口令黑名单（小写比较，含企业场景高频默认口令） */
    private static final Set<String> BLOCKED_PASSWORDS = Set.of(
            "12345678", "123456789", "1234567890", "88888888", "66666666", "00000000",
            "password", "password1", "passw0rd", "p@ssword", "p@ssw0rd",
            "abc123456", "abcd1234", "1234abcd", "iloveyou", "qwerty123", "qwertyui",
            "admin123", "admin888", "admin123456", "root1234", "test1234", "guest123",
            "asdasd123", "a1b2c3d4", "1q2w3e4r", "1qaz2wsx", "zhao123456", "woaini1314");

    private PasswordPolicy() {
    }

    /**
     * 逐项校验新密码，返回全部未通过项（繁体文案，可直接展示给用户）。
     *
     * @param raw  待校验的新密码（明文）
     * @param user 当前用户，用于禁止密码中包含账号/工号/姓名/证件号
     */
    public static List<String> violations(String raw, SysUser user) {
        List<String> items = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            items.add("新密碼不能為空");
            return items;
        }
        if (!raw.equals(raw.trim())) {
            items.add("新密碼不能以空格開頭或結尾");
        }
        if (raw.length() < MIN_LENGTH || raw.length() > MAX_LENGTH) {
            items.add("長度需 " + MIN_LENGTH + "~" + MAX_LENGTH + " 位");
        }
        if (countCategories(raw) < MIN_CATEGORIES) {
            items.add("需包含大寫字母、小寫字母、數字、特殊字符中的至少 " + MIN_CATEGORIES + " 類");
        }
        if (containsPersonalInfo(raw, user)) {
            items.add("不能包含本人的賬號、工號、姓名或證件號");
        }
        if (isWeakPattern(raw)) {
            items.add("不能是常見弱口令或連續/重複字符");
        }
        return items;
    }

    /** 违规项拼成一句可直接作为异常消息的提示 */
    public static String describe(List<String> violations) {
        return "新密碼不符合安全策略：" + String.join("；", violations);
    }

    /** 命中的字符类别数：大写/小写/数字/特殊字符 */
    public static int countCategories(String raw) {
        if (raw == null || raw.isEmpty()) return 0;
        boolean upper = false;
        boolean lower = false;
        boolean digit = false;
        boolean special = false;
        for (char c : raw.toCharArray()) {
            if (Character.isUpperCase(c)) upper = true;
            else if (Character.isLowerCase(c)) lower = true;
            else if (Character.isDigit(c)) digit = true;
            else if (!Character.isLetterOrDigit(c)) special = true;
        }
        int count = 0;
        if (upper) count++;
        if (lower) count++;
        if (digit) count++;
        if (special) count++;
        return count;
    }

    /** 密码中包含账号/工号/姓名/证件号（忽略大小写，片段长度≥3 才判定） */
    public static boolean containsPersonalInfo(String raw, SysUser user) {
        if (raw == null || user == null) return false;
        String lower = raw.toLowerCase(Locale.ROOT);
        return hits(lower, user.getUsername())
                || hits(lower, user.getEmpId())
                || hits(lower, user.getName())
                || hits(lower, user.getIdNumber());
    }

    private static boolean hits(String lowerPassword, String token) {
        if (token == null) return false;
        String normalized = token.trim().toLowerCase(Locale.ROOT);
        return normalized.length() >= PERSONAL_TOKEN_MIN_LEN && lowerPassword.contains(normalized);
    }

    /** 常见弱口令 / 纯重复 / 连续升降序列 */
    public static boolean isWeakPattern(String raw) {
        if (raw == null || raw.isEmpty()) return false;
        String lower = raw.toLowerCase(Locale.ROOT);
        if (BLOCKED_PASSWORDS.contains(lower)) return true;
        // 去掉常见后缀（如 password123 → password）后再比一次黑名单
        String letters = lower.replaceAll("[^a-z]", "");
        if (BLOCKED_PASSWORDS.contains(letters)) return true;
        return isRepeated(lower) || hasLongSequence(lower);
    }

    /** 单一字符占比过高（如 aaaaaaaa、11111111） */
    private static boolean isRepeated(String lower) {
        if (lower.length() < MIN_LENGTH) return false;
        Map<Character, Integer> counts = new HashMap<>();
        int max = 0;
        for (char c : lower.toCharArray()) {
            int current = counts.merge(c, 1, Integer::sum);
            max = Math.max(max, current);
        }
        return (double) max / lower.length() >= REPEAT_RATIO;
    }

    /** 存在长度≥5 的连续升序或降序序列（abcde、54321，兼容键盘同排的等差判定不做，避免误伤） */
    private static boolean hasLongSequence(String lower) {
        int asc = 1;
        int desc = 1;
        for (int i = 1; i < lower.length(); i++) {
            int diff = lower.charAt(i) - lower.charAt(i - 1);
            asc = diff == 1 ? asc + 1 : 1;
            desc = diff == -1 ? desc + 1 : 1;
            if (asc >= SEQUENCE_MIN_LEN || desc >= SEQUENCE_MIN_LEN) return true;
        }
        return false;
    }
}
