package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * AI 使用申請菜單初始化：新增 ai-access-request 菜單至 sys_menu
 * 使用 JdbcTemplate 直接操作，避免 SQL 解析問題
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(10)
public class AiAccessRequestMenuDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("ai_access_menu:v5", () -> {
                // 1. 檢查菜單是否已存在
                Integer existCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'ai-access-request' AND deleted = 0",
                        Integer.class);
                if (existCount != null && existCount > 0) {
                    log.info("ai-access-request 菜單已存在，跳過創建");
                    return;
                }

                // 2. 查找父菜單 ai-assistant 的 ID，找不到則用第一個頂級菜單
                Long parentId = null;
                try {
                    parentId = jdbcTemplate.queryForObject(
                            "SELECT id FROM sys_menu WHERE menu_key = 'ai-assistant' AND deleted = 0 LIMIT 1",
                            Long.class);
                } catch (Exception ignored) { /* ai-assistant 不存在 */ }

                if (parentId == null) {
                    try {
                        parentId = jdbcTemplate.queryForObject(
                                "SELECT MIN(id) FROM sys_menu WHERE parent_id IS NULL AND deleted = 0",
                                Long.class);
                    } catch (Exception e) {
                        log.warn("找不到任何頂級菜單作為 ai-access-request 的父級");
                    }
                }

                // 3. 插入菜單
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                                + "VALUES (?, 'ai-access-request', 'AI 使用申請', '/ai-access-apply', 'AiAccessApply', 'KeyOutlined', 2, 10, '[\"view\",\"create\",\"edit\"]', 1, 'system', 0)",
                        parentId);
                log.info("已創建 ai-access-request 菜單, parent_id={}", parentId);

                // 4. 授予 admin 角色全部權限
                try {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                                    + "SELECT r.id, m.id, '[\"view\",\"create\",\"edit\",\"delete\",\"export\"]' "
                                    + "FROM sys_role r, sys_menu m "
                                    + "WHERE r.code = 'admin' AND m.menu_key = 'ai-access-request' AND m.deleted = 0");
                    log.info("已授予 admin 角色 ai-access-request 權限");
                } catch (Exception e) {
                    log.warn("授予 admin 角色權限失敗（可忽略）: {}", e.getMessage());
                }
            });
        } catch (Exception e) {
            log.error("AI使用申請菜單初始化失敗: {}", e.getMessage(), e);
        }
    }
}
