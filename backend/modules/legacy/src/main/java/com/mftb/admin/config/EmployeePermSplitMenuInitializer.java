package com.mftb.admin.config;

import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 员工接口权限拆分的动作登记：把 {@code employee-management} 的可授权动作集纠正为细分动作。
 * <p>
 * 为什么必须单独开一个 versionKey 而不是改种子：菜单初始化器（含 DataInitializer 的
 * {@code ensureMenu}）对已存在菜单**不覆盖 actions**，只改声明的话存量库不会变；
 * 而 {@code sys_menu.actions} 是授权中心能勾出哪些动作的唯一依据 —— 动作没登记进去，
 * 后果是普通角色永久 403，而超管走代码直通完全看不出问题（考勤域 attendance:menu:v1.1 实测踩过）。
 * <p>
 * 执行时机：必须晚于 DataInitializer(@Order(5)) 的菜单种子，否则菜单行还不存在。
 * <p>
 * 参考 SQL: {@code backend/sql/246_employee_perm_split.sql}（一次性文档）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(7)
public class EmployeePermSplitMenuInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:employee-perm-split:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            // 不吞异常：动作集没纠正就等于「拆分只存在于代码里」，授权中心勾不到敏感动作
            log.error("员工权限拆分动作登记失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        Long menuId = menuIdOrThrow();
        int updated = jdbcTemplate.update(
                "UPDATE sys_menu SET actions = ?, updated_by = 'system' "
                        + "WHERE id = ? AND deleted = 0",
                EmployeeConstants.GRANTABLE_ACTIONS_JSON, menuId);
        if (updated == 0) {
            throw new IllegalStateException("菜单 employee-management 更新失败，动作集未登记");
        }
        // 内置 admin 角色补授全量动作：仅当原 actions 缺失/为空时回填，不覆盖管理员手工配置
        Long adminRoleId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId != null) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                    adminRoleId, menuId, EmployeeConstants.GRANTABLE_ACTIONS_JSON);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu SET actions = ? "
                            + "WHERE role_id = ? AND menu_id = ? AND (actions IS NULL OR actions = '' OR actions = '[]')",
                    EmployeeConstants.GRANTABLE_ACTIONS_JSON, adminRoleId, menuId);
        }
        log.info("员工权限拆分动作已登记: menuKey={}, actions={}",
                EmployeeConstants.MENU_EMPLOYEE, EmployeeConstants.GRANTABLE_ACTIONS);
        // 菜单动作变了必须清权限缓存，否则本实例与其它实例仍拿旧的可见动作集
        permissionService.evictAll();
    }

    private void verify() {
        String actions = jdbcTemplate.queryForObject(
                "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                String.class, EmployeeConstants.MENU_EMPLOYEE);
        List<String> stored = JsonUtils.parseStringList(actions);
        for (String required : EmployeeConstants.GRANTABLE_ACTIONS) {
            if (!stored.contains(required)) {
                throw new IllegalStateException("sys_menu.actions 缺动作: " + required + "，当前=" + stored);
            }
        }
    }

    private Long menuIdOrThrow() {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                        Long.class, EmployeeConstants.MENU_EMPLOYEE)
                .stream().findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "菜单 " + EmployeeConstants.MENU_EMPLOYEE + " 不存在，无法登记动作集"));
    }
}
