package com.mftb.admin.service.agent;

import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 工具可见性：data_scope_json 的 roles/depts 是“能不能看到工具”的边界。
 *
 * <p>空配置 = 全员可见（保持历史行为）；超管始终可见；配置损坏时放行而不是全站禁用，
 * 但会留下 warn 日志——不能因为一条运营配置把助手整体关停。
 */
class AiToolVisibilityTest {

    private static AiToolPolicy policy(String json) {
        AiToolPolicy p = new AiToolPolicy();
        p.setToolKey("rdm_list_projects");
        p.setEnabled(1);
        p.setDataScopeJson(json);
        return p;
    }

    private static SysUser user(String role, String functionRoles, Long deptId) {
        SysUser u = new SysUser();
        u.setRole(role);
        u.setFunctionRoles(functionRoles);
        u.setDepartmentId(deptId);
        return u;
    }

    @Test
    @DisplayName("未配置范围时全员可见")
    void blankScopeVisibleToAll() {
        assertTrue(AiToolVisibility.visible(policy(null), user("user", null, 9L)));
        assertTrue(AiToolVisibility.visible(policy("{}"), user("user", null, 9L)));
        assertTrue(AiToolVisibility.visible(policy("{\"roles\":[],\"depts\":[]}"), user("user", null, 9L)));
    }

    @Test
    @DisplayName("角色命中或部门命中即可见")
    void roleOrDeptMatch() {
        AiToolPolicy p = policy("{\"roles\":[\"rdm_pm\"],\"depts\":[12]}");
        assertTrue(AiToolVisibility.visible(p, user("user", "rdm_pm,rdm_dev", 3L)));
        assertTrue(AiToolVisibility.visible(p, user("user", null, 12L)));
        assertFalse(AiToolVisibility.visible(p, user("user", "rdm_dev", 3L)));
    }

    @Test
    @DisplayName("超管不受范围限制")
    void adminAlwaysVisible() {
        AiToolPolicy p = policy("{\"roles\":[\"rdm_pm\"]}");
        assertTrue(AiToolVisibility.visible(p, user("admin", null, 3L)));
        assertTrue(AiToolVisibility.visible(p, user("user", "super_admin", 3L)));
    }

    @Test
    @DisplayName("配置损坏时放行，不把助手整体关停")
    void brokenJsonFallsBackToVisible() {
        assertTrue(AiToolVisibility.visible(policy("not-json"), user("user", null, 3L)));
    }

    @Test
    @DisplayName("无策略行按历史行为放行")
    void missingPolicyVisible() {
        assertTrue(AiToolVisibility.visible(null, user("user", null, 3L)));
    }
}
