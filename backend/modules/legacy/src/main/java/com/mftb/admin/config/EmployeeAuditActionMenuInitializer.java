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

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 员工菜单动作集收敛：把 {@code sys_menu.actions} 补齐到 {@link EmployeeConstants#GRANTABLE_ACTIONS}。
 * <p>
 * 与 {@code hr:employee-perm-split:v1.0}（一次性纠正整个动作集）的分工：那一版负责「换血」，
 * 本版负责「后续新增动作能落到存量库」。<b>写法是并集而不是覆盖</b> —— 授权中心里管理员
 * 手工加过的动作不能被启动脚本抹掉，抹掉一次就再也没人能解释「上周还能勾、这周勾不到」。
 * <p>
 * 为什么还要单独一个 versionKey：{@code applyOnce} 之后不会重跑，所以本版只负责
 * {@code auditView} 这次新增；<b>再加新动作时必须再开一个 versionKey</b>（或把本类的
 * 语义扩成「每次启动都对账」，那需要新的设计决定，别顺手改）。
 * <p>
 * 执行时机：晚于 {@code EmployeePermSplitMenuInitializer}(@Order(7))，也晚于 DataInitializer(@Order(5)) 的菜单种子。
 * 参考 SQL: {@code backend/sql/250_employee_audit_action.sql}（一次性文档）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(9)
public class EmployeeAuditActionMenuInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:employee-audit-action:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            // 不吞异常：动作没登记 = 授权中心勾不到 = 普通角色永久 403，而超管走代码直通看不出问题
            log.error("员工审计动作登记失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        Long menuId = menuIdOrThrow();
        List<String> stored = JsonUtils.parseStringList(jdbcTemplate.queryForObject(
                "SELECT actions FROM sys_menu WHERE id = ? AND deleted = 0", String.class, menuId));

        Set<String> merged = new LinkedHashSet<>(stored);
        merged.addAll(EmployeeConstants.GRANTABLE_ACTIONS);
        if (merged.equals(new LinkedHashSet<>(stored))) {
            log.info("员工菜单动作集已是最新，无需变更: {}", merged);
            return;
        }
        String json = toJson(new ArrayList<>(merged));
        jdbcTemplate.update("UPDATE sys_menu SET actions = ?, updated_by = 'system' WHERE id = ? AND deleted = 0",
                json, menuId);

        // 内置 admin 角色同样并集补授：否则超管之外的「类超管」角色拿不到新动作，而 admin 走代码直通看不出来
        Long adminRoleId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId != null) {
            // 用 queryForList 而不是 queryForObject：管理员没行时后者会抛 EmptyResultDataAccessException，
            // 而「没行」在新库里是正常状态，不能把启动卡住
            List<String> rows = jdbcTemplate.queryForList(
                    "SELECT actions FROM sys_role_menu WHERE role_id = ? AND menu_id = ? LIMIT 1",
                    String.class, adminRoleId, menuId);
            Set<String> adminMerged = new LinkedHashSet<>(
                    JsonUtils.parseStringList(rows.isEmpty() ? null : rows.get(0)));
            adminMerged.addAll(EmployeeConstants.GRANTABLE_ACTIONS);
            if (!adminMerged.equals(new LinkedHashSet<>(JsonUtils.parseStringList(rows.isEmpty() ? null : rows.get(0))))) {
                if (rows.isEmpty()) {
                    jdbcTemplate.update(
                            "INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                            adminRoleId, menuId, toJson(new ArrayList<>(adminMerged)));
                } else {
                    jdbcTemplate.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ?",
                            toJson(new ArrayList<>(adminMerged)), adminRoleId, menuId);
                }
            }
        }
        log.info("员工菜单动作已补齐: {} → {}", stored, merged);
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

    private String toJson(List<String> values) {
        return "[\"" + String.join("\",\"", values) + "\"]";
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
