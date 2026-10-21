package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 「AI 助手配置」菜单：能力清单 / 回答骨架 / 术语口径 的统一入口。
 *
 * <p>为什么单独一个初始化器而不是塞进 DataInitializer：DataInitializer 的菜单种子
 * 是一次性版本键，存量库不会再跑；这里每次启动幂等 upsert，生产被手工删掉也能自愈。
 * <p>权限动作只有 view/edit：配置只影响“怎么说”，不授予任何业务数据权限。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(16)
public class AiAssistantConfigMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-config-menu-v1.0";
    private static final String MENU_KEY = "ai-assistant-config";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        // 版本已记录也每次重放：upsert 幂等，且能在菜单被误删后自愈
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
    }

    private void migrate() {
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                        + "sort_order, actions, status, system_code, updated_by, deleted) "
                        + "VALUES (NULL, ?, 'AI 助手配置', 'AI Assistant Config', '/ai-assistant-config', "
                        + "'AiAssistantConfig', 'SettingOutlined', 2, 11, '[\"view\",\"edit\"]', 1, ?, 'system', 0) "
                        + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                        + "path = VALUES(path), component = VALUES(component), icon = VALUES(icon), "
                        + "type = VALUES(type), sort_order = VALUES(sort_order), actions = VALUES(actions), "
                        + "status = 1, system_code = VALUES(system_code), deleted = 0",
                MENU_KEY, SystemCode.AI.code());
        // 超管直通不依赖授权行，但菜单配置页/侧栏仍需要一行可见的授权记录
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT r.id, m.id, '[\"view\",\"edit\"]' FROM sys_role r, sys_menu m "
                        + "WHERE r.code = 'admin' AND m.menu_key = ? AND m.deleted = 0",
                MENU_KEY);
        log.info("AI 助手配置菜单已就绪: {} / {}", MENU_KEY, SystemCode.AI.code());
    }

    private void verify() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1",
                Integer.class, MENU_KEY);
        if (count == null || count == 0) {
            throw new IllegalStateException("AI 助手配置菜单未就绪");
        }
        String actions = jdbcTemplate.queryForObject(
                "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                String.class, MENU_KEY);
        if (actions == null || !actions.contains("view") || !actions.contains("edit")) {
            throw new IllegalStateException("AI 助手配置菜单动作集缺少 view/edit: " + actions);
        }
    }
}
