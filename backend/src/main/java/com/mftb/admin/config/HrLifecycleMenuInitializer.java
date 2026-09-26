package com.mftb.admin.config;

import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 入转调离菜单初始化：在「集團人事(HR)」下新增 入職管理/轉正管理/調動管理/離職管理 四个二级菜单。
 * <p>
 * 使用 JdbcTemplate 直接操作（与 {@link AiAccessRequestMenuDataInitializer} 同法），幂等：
 * 菜单已存在则跳过插入；admin 角色授权与 system_code 归属每次启动兜底补齐。
 * 排序/图标/英文名由 DataInitializer.reconcileMenuMasterData 每次启动统一自愈。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrLifecycleMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "hr:lifecycle-menu:v1.0";

    /** admin 角色默认全量动作 */
    private static final String DEFAULT_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";

    /** menuKey → {中文名, 图标, 英文名} */
    private static final String[][] MENUS = {
            {"hr-onboarding", "入職管理", "UserAddOutlined", "Onboarding"},
            {"hr-regularization", "轉正管理", "CheckCircleOutlined", "Regularization"},
            {"hr-transfer", "調動管理", "SwapOutlined", "Transfer"},
            {"hr-dimission", "離職管理", "UserDeleteOutlined", "Dimission"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("HR入轉調離菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        Long hrId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = 'hr' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (hrId == null) {
            throw new IllegalStateException("父級菜單 hr 不存在，無法掛載入轉調離菜單");
        }
        for (String[] m : MENUS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
            if (exists != null && exists > 0) {
                continue;
            }
            // 清理同 key 软删残留，避免唯一键冲突
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", m[0]);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted) "
                            + "VALUES (?, ?, ?, ?, 2, 99, 1, 0)",
                    hrId, m[0], m[1], m[2]);
            // 英文名仅补空，菜单配置页自定义不覆盖
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE menu_key = ?", m[3], m[0]);
            log.info("已創建 HR 入轉調離菜單: {}", m[0]);
        }
        grantAdmin();
        // 菜单/授权落地后 bump revision 并清缓存，保证跨实例菜单快照与新入口同步生效
        permissionService.evictAll();
    }

    /** admin 角色补授全量动作（幂等，每次迁移执行） */
    private void grantAdmin() {
        Long adminRoleId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId == null) {
            return;
        }
        for (String[] m : MENUS) {
            // 拆为两步：INSERT ... SELECT + ON DUPLICATE 的 VALUES(actions) 在 MySQL 8 仍会报
            // 1052 Column 'actions' in field list is ambiguous（目标表与派生表同列名）。
            // 1) 建关联（已存在则忽略）；2) 仅当 actions 缺失时回填全量动作，不覆盖人工配置
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT r.id, m.id, ? FROM sys_role r JOIN sys_menu m ON m.menu_key = ? AND m.deleted = 0 "
                            + "WHERE r.code = 'admin'",
                    DEFAULT_ACTIONS, m[0]);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id JOIN sys_role r ON r.id = rm.role_id "
                            + "SET rm.actions = ? "
                            + "WHERE r.code = 'admin' AND m.menu_key = ? AND m.deleted = 0 "
                            + "AND (rm.actions IS NULL OR rm.actions = '' OR rm.actions = '[]')",
                    DEFAULT_ACTIONS, m[0]);
        }
    }

    /** 后置校验：四个菜单均已挂载在 hr 下 */
    private void verify() {
        Long hrId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = 'hr' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (hrId == null) {
            throw new IllegalStateException("父級菜單 hr 不存在");
        }
        for (String[] m : MENUS) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND parent_id = ? AND deleted = 0",
                    Integer.class, m[0], hrId);
            if (count == null || count == 0) {
                throw new IllegalStateException("菜單未就緒: " + m[0]);
            }
        }
    }
}
