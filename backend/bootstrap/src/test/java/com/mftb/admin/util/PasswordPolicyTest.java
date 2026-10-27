package com.mftb.admin.util;

import com.mftb.admin.entity.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 密码强度策略单测（前后端同口径的服务端裁决依据）。
 * <p>重点是两侧都要稳：合法密码不能被误拒（否则用户绕过规则），
 * 弱口令/连续序列/含个人信息的密码必须被拒。
 */
class PasswordPolicyTest {

    private static SysUser user(String username, String empId, String name, String idNumber) {
        SysUser u = new SysUser();
        u.setUsername(username);
        u.setEmpId(empId);
        u.setName(name);
        u.setIdNumber(idNumber);
        return u;
    }

    private static final SysUser SELF = user("MF00001", "MF00001", "張三丰", "A123456789");

    private static List<String> check(String raw) {
        return PasswordPolicy.violations(raw, SELF);
    }

    @Test
    @DisplayName("合规密码零违规：长度达标且覆盖四类字符")
    void strongPasswordPasses() {
        assertEquals(List.of(), check("Kx7#pq2m"));
        assertEquals(List.of(), check("Tr4in#Golf99"));
    }

    @Test
    @DisplayName("长度边界：7 位拒绝、8 位放行、超过 32 位拒绝")
    void lengthBoundaries() {
        assertTrue(check("Kx7#pq2").stream().anyMatch(v -> v.contains("長度需 8~32 位")));
        assertEquals(List.of(), check("Kx7#pq2m"));
        assertTrue(check("Kx7#pq2mKx7#pq2mKx7#pq2mKx7#pq2mK").stream().anyMatch(v -> v.contains("長度需 8~32 位")));
    }

    @Test
    @DisplayName("字符类别：少于三类必须拒绝")
    void requiresThreeCharacterCategories() {
        assertEquals(1, PasswordPolicy.countCategories("abcdefgh"));
        assertEquals(2, PasswordPolicy.countCategories("abcdefg1"));
        assertEquals(3, PasswordPolicy.countCategories("Abcdefg1"));
        assertEquals(4, PasswordPolicy.countCategories("Abcdefg1!"));
        assertTrue(check("abcdefg1").stream().anyMatch(v -> v.contains("至少 3 類")));
        // 3 类且无长序列：应放行
        assertEquals(List.of(), check("Abcd3f5x"));
    }

    @Test
    @DisplayName("个人信息：含账号/工号/姓名/证件号一律拒绝，两字姓名不误伤")
    void rejectsPersonalInfo() {
        assertTrue(check("Kx#MF00001q2").stream().anyMatch(v -> v.contains("賬號")));
        assertTrue(check("Kx#張三丰3q2").stream().anyMatch(v -> v.contains("賬號")));
        assertTrue(check("Kx#A123456789q").stream().anyMatch(v -> v.contains("賬號")));
        // 两字以下姓名不做片段匹配，避免正常密码被误拒
        List<String> twoCharName = PasswordPolicy.violations("Kx7#pq2m", user("ab", "cd", "李", null));
        assertEquals(List.of(), twoCharName);
    }

    @Test
    @DisplayName("弱口令：黑名单、纯重复、连续升降序列都要拦下")
    void rejectsWeakPatterns() {
        assertTrue(PasswordPolicy.isWeakPattern("12345678"));
        assertTrue(PasswordPolicy.isWeakPattern("password"));
        assertTrue(PasswordPolicy.isWeakPattern("Passw0rd"));
        assertTrue(PasswordPolicy.isWeakPattern("aaaaaaaa"));
        assertTrue(PasswordPolicy.isWeakPattern("Abcdefgh"));
        assertTrue(PasswordPolicy.isWeakPattern("87654321"));
        assertFalse(PasswordPolicy.isWeakPattern("Kx7#pq2m"));
        // 4 位短序列（如 1234）不足以判定为顺序口令，避免误伤合法密码
        assertFalse(PasswordPolicy.isWeakPattern("Kx7#pq1234"));
    }

    @Test
    @DisplayName("首尾空格：拒绝而非静默 trim，避免用户以为设了带空格的密码")
    void rejectsLeadingTrailingSpaces() {
        assertTrue(check(" Kx7#pq2m").stream().anyMatch(v -> v.contains("空格")));
        assertTrue(check("Kx7#pq2m ").stream().anyMatch(v -> v.contains("空格")));
    }

    @Test
    @DisplayName("违规项汇总为一句可展示的提示，且空值优先返回")
    void describeAggregatesViolations() {
        assertTrue(PasswordPolicy.describe(List.of("長度需 8~32 位")).startsWith("新密碼不符合安全策略："));
        assertEquals(List.of("新密碼不能為空"), check("   "));
        assertEquals(List.of("新密碼不能為空"), PasswordPolicy.violations(null, SELF));
    }
}
