package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据初始化器: 启动时自动执行字段迁移与内置账号迁移, 并将 SQL 中的占位密码重置为正确的 BCrypt 加密值
 * <p>
 * 登录账号统一为工号, 工号按 MF 前缀自增(MF00001 起), 内置管理员工号 MF00001, 密码: 111222
 */
@Slf4j
@Component
@Order(5)
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        migrateSchema();
        migrateBuiltinAccounts();
        migrateEmpIdToMF();
        migrateDeptCodeToMT();
        resetPasswordIfNeeded("MF00001", "111222");
    }

    /** 内置账号迁移: 登录账号统一为工号, 移除 guest 账号 (旧库 admin 账号由 migrateEmpIdToMF 统一重编号) */
    private void migrateBuiltinAccounts() {
        int removed = jdbcTemplate.update("DELETE FROM sys_user WHERE username = 'guest'");
        if (removed > 0) {
            log.info("已移除内置 guest 账号");
        }
    }

    /**
     * 存量工号迁移: 将所有非 MF 格式登录账号的员工(含逻辑删除记录)按 id 升序重编号为 MF00001+,
     * 登录账号与工号同步更新; 已是 MF 格式的记录不变, 重复启动幂等
     */
    private void migrateEmpIdToMF() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_user WHERE username NOT REGEXP '^MF[0-9]+$' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(username, 3) AS UNSIGNED)), 0) FROM sys_user "
                        + "WHERE username REGEXP '^MF[0-9]+$'",
                Integer.class);
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            String empId = String.format("MF%05d", ++seq);
            jdbcTemplate.update("UPDATE sys_user SET username = ?, emp_id = ? WHERE id = ?", empId, empId, id);
        }
        log.info("已将 {} 个存量员工工号迁移为 MF 自增格式", ids.size());
    }

    /**
     * 存量部门编码迁移: 将所有非 MT 格式编码的部门(含逻辑删除记录)按 id 升序重编号为 MT00001+;
     * 已是 MT 格式的记录不变, 重复启动幂等
     */
    private void migrateDeptCodeToMT() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_department WHERE code NOT REGEXP '^MT[0-9]+$' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)), 0) FROM sys_department "
                        + "WHERE code REGEXP '^MT[0-9]+$'",
                Integer.class);
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            String code = String.format("MT%05d", ++seq);
            jdbcTemplate.update("UPDATE sys_department SET code = ? WHERE id = ?", code, id);
        }
        log.info("已将 {} 个存量部门编码迁移为 MT 自增格式", ids.size());
    }

    /** 幂等字段迁移: 列不存在时自动 ALTER TABLE (免手动执行 SQL 脚本) */
    private void migrateSchema() {
        addColumnIfAbsent("sys_user", "function_roles",
                "ALTER TABLE sys_user ADD COLUMN function_roles TEXT NULL COMMENT '绑定的功能角色ID JSON数组' AFTER role");
        addColumnIfAbsent("sys_role", "permissions",
                "ALTER TABLE sys_role ADD COLUMN permissions TEXT NULL COMMENT '菜单权限 JSON数组' AFTER description");
        addColumnIfAbsent("sys_user", "department_id",
                "ALTER TABLE sys_user ADD COLUMN department_id BIGINT NULL COMMENT '所在部门ID' AFTER function_roles");
        addColumnIfAbsent("sys_role", "updated_by",
                "ALTER TABLE sys_role ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        migrateMenuTable();
        createDepartmentTableIfAbsent();
        addColumnIfAbsent("sys_department", "updated_by",
                "ALTER TABLE sys_department ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER sort");
        createPositionTableIfAbsent();
        addColumnIfAbsent("sys_position", "name_en",
                "ALTER TABLE sys_position ADD COLUMN name_en VARCHAR(128) NULL COMMENT '职位英文名称' AFTER name");
        addColumnIfAbsent("sys_position", "rank",
                "ALTER TABLE sys_position ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        addColumnIfAbsent("sys_user", "position_id",
                "ALTER TABLE sys_user ADD COLUMN position_id BIGINT NULL COMMENT '职位ID' AFTER department");
        addColumnIfAbsent("sys_user", "job_level",
                "ALTER TABLE sys_user ADD COLUMN job_level VARCHAR(32) NULL COMMENT '职级快照' AFTER position");
        addColumnIfAbsent("sys_user", "position_en",
                "ALTER TABLE sys_user ADD COLUMN position_en VARCHAR(128) NULL COMMENT '职位英文名称快照' AFTER position");
        addColumnIfAbsent("sys_user", "sequence",
                "ALTER TABLE sys_user ADD COLUMN sequence VARCHAR(8) NULL COMMENT '职级序列快照: M=管理 T=技术 P=专业' AFTER position_en");
        addColumnIfAbsent("sys_user", "rank",
                "ALTER TABLE sys_user ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        addColumnIfAbsent("sys_user", "updated_by",
                "ALTER TABLE sys_user ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        backfillUserPositionEn();
        backfillUserSequence();
        migrateRoleMenuTable();
        migrateDepartmentMenuTable();
        seedSystemMenus();
        // 再回填一次英文名: 确保本次新种子化的菜单也能拿到 name_en
        seedMenuEnglishNames();
    }

    /** 回填存量员工的职级序列快照 (仅处理空值, 可重复执行) */
    private void backfillUserSequence() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.sequence = p.sequence "
                        + "WHERE u.sequence IS NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职级序列快照", filled);
        }
    }

    /** 回填存量员工的职位英文名称快照 (仅处理空值, 可重复执行) */
    private void backfillUserPositionEn() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.position_en = p.name_en "
                        + "WHERE u.position_en IS NULL AND p.name_en IS NOT NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职位英文名称快照", filled);
        }
    }

    /** 集团人事-职位表不存在时自动创建 */
    private void createPositionTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_position'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_position ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "name VARCHAR(128) NOT NULL COMMENT '职位名称', "
                        + "name_en VARCHAR(128) NULL COMMENT '职位英文名称', "
                        + "sequence VARCHAR(8) NOT NULL COMMENT '职级序列: M=管理 T=技术 P=专业', "
                        + "job_level VARCHAR(32) NOT NULL COMMENT '职级', "
                        + "`rank` VARCHAR(8) NULL COMMENT '职等 R1~R5', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团人事-职位表'");
        log.info("已自动创建职位表 sys_position");
    }

    /** 组织架构-部门表不存在时自动创建 */
    private void createDepartmentTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_department ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "code VARCHAR(64) NOT NULL COMMENT '部门编码', "
                        + "name VARCHAR(128) NOT NULL COMMENT '部门名称', "
                        + "parent_id BIGINT NULL COMMENT '上级部门ID', "
                        + "leader VARCHAR(64) NULL COMMENT '部门对接人', "
                        + "permissions TEXT NULL COMMENT '部门授权菜单权限 JSON数组', "
                        + "status INT DEFAULT 1 COMMENT '状态: 1=有效 0=无效', "
                        + "sort INT DEFAULT 0 COMMENT '排序', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团组织架构-部门表'");
        log.info("已自动创建部门表 sys_department");
    }

    private void addColumnIfAbsent(String table, String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自动迁移字段 {}.{}", table, column);
        }
    }

    /** 系统菜单配置表: 不存在则创建, 存在则补充新列并确保 menu_key 唯一 */
    private void migrateMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_menu ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "parent_id BIGINT NULL COMMENT '父菜单ID, 顶级为 NULL', "
                            + "menu_key VARCHAR(64) NOT NULL COMMENT '菜单标识, 用于权限判断与前端路由key', "
                            + "name VARCHAR(50) NOT NULL COMMENT '菜单名称', "
                            + "name_en VARCHAR(100) NULL COMMENT '菜单英文名称', "
                            + "path VARCHAR(200) NULL COMMENT '路由路径', "
                            + "component VARCHAR(200) NULL COMMENT '前端组件路径', "
                            + "icon VARCHAR(100) NULL COMMENT '图标', "
                            + "type TINYINT NULL COMMENT '类型: 1=目录 2=菜单 3=按钮', "
                            + "sort_order INT DEFAULT 0 COMMENT '排序', "
                            + "actions TEXT NULL COMMENT '可用操作 JSON数组: [\"view\",\"create\",\"edit\",\"delete\"]', "
                            + "status TINYINT DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                            + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                            + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE INDEX uk_menu_key (menu_key)"
                            + ") COMMENT='系统菜单配置表'");
            log.info("已自动创建菜单配置表 sys_menu");
            return;
        }

        // 兼容 01_init_system.sql 旧结构: 补充新列
        addColumnIfAbsent("sys_menu", "menu_key",
                "ALTER TABLE sys_menu ADD COLUMN menu_key VARCHAR(64) NULL COMMENT '菜单标识, 用于权限判断与前端路由key' AFTER parent_id");
        addColumnIfAbsent("sys_menu", "component",
                "ALTER TABLE sys_menu ADD COLUMN component VARCHAR(200) NULL COMMENT '前端组件路径' AFTER path");
        addColumnIfAbsent("sys_menu", "actions",
                "ALTER TABLE sys_menu ADD COLUMN actions TEXT NULL COMMENT '可用操作 JSON数组' AFTER sort_order");
        addColumnIfAbsent("sys_menu", "updated_by",
                "ALTER TABLE sys_menu ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        addColumnIfAbsent("sys_menu", "name_en",
                "ALTER TABLE sys_menu ADD COLUMN name_en VARCHAR(100) NULL COMMENT '菜单英文名称' AFTER name");

        // 为存量数据生成 menu_key, 避免后续非空约束与唯一索引失败
        jdbcTemplate.update(
                "UPDATE sys_menu SET menu_key = CONCAT('menu_', id) "
                        + "WHERE menu_key IS NULL OR menu_key = ''");
        // 处理可能存在的 menu_key 重复(保留 id 最小者)
        jdbcTemplate.update(
                "UPDATE sys_menu m2 JOIN sys_menu m1 ON m1.id < m2.id AND m1.menu_key = m2.menu_key "
                        + "SET m2.menu_key = CONCAT(m2.menu_key, '_', m2.id)");

        jdbcTemplate.update(
                "ALTER TABLE sys_menu MODIFY COLUMN menu_key VARCHAR(64) NOT NULL "
                        + "COMMENT '菜单标识, 用于权限判断与前端路由key'");

        Integer indexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND INDEX_NAME = 'uk_menu_key'",
                Integer.class);
        if (indexCount == null || indexCount == 0) {
            jdbcTemplate.execute("ALTER TABLE sys_menu ADD UNIQUE INDEX uk_menu_key (menu_key)");
        }
        seedMenuEnglishNames();
    }

    /** 菜单多语言: 按 menu_key 回填英文名称 (仅填充未配置的, 不覆盖人工修改), 与 sql/18_menu_i18n.sql 保持一致 */
    private void seedMenuEnglishNames() {
        Map<String, String> enNames = Map.ofEntries(
                Map.entry("home", "Home"),
                Map.entry("merchant_group", "Merchant Group"),
                Map.entry("merchant-group-list", "Group Management"),
                Map.entry("store-list", "Store Management"),
                Map.entry("merchant_promotion", "Merchant Promotion Tools"),
                Map.entry("promotion-dashboard", "Dashboard"),
                Map.entry("promotion-algorithm", "Algorithm Library"),
                Map.entry("promotion-slot-config", "Feed Strategy"),
                Map.entry("promotion-waterfall", "Sales Pricing"),
                Map.entry("gift-manage", "Gift Management"),
                Map.entry("gift-detail", "Promotion Gifts"),
                Map.entry("gift-consume-detail", "Consumption Details"),
                Map.entry("ad-sales", "Ad Sales"),
                Map.entry("promotion-word-library", "Word Library"),
                Map.entry("promotion-tool", "Promotion Pass"),
                Map.entry("promotion_tool", "Promotion Pass"),
                Map.entry("promotion-sales-config", "Store Promotion"),
                Map.entry("promotion-report-group", "Report Analysis"),
                Map.entry("promotion-report-overview", "Overview"),
                Map.entry("promotion-report-order", "Order Report"),
                Map.entry("promotion-report-compare", "Type Comparison"),
                Map.entry("search", "Search Management"),
                Map.entry("search-config-new", "Search Config"),
                Map.entry("global-config", "Global Config"),
                Map.entry("channel-strategy", "Dimension Strategy"),
                Map.entry("search-guide", "Search Guide"),
                Map.entry("hint-config", "Hint Config"),
                Map.entry("hot-search-config", "Hot Search Config"),
                Map.entry("search-weight-config", "Weight Control"),
                Map.entry("search-library", "Search Library"),
                Map.entry("word-segmentation", "Word Segmentation"),
                Map.entry("synonym-config", "Synonym Library"),
                Map.entry("hot-search-library", "Hot Search Library"),
                Map.entry("stop-words", "Stop Words"),
                Map.entry("search-verify-group", "Verification"),
                Map.entry("search-verify", "Search Verify"),
                Map.entry("hint-verify", "Hint Verify"),
                Map.entry("hot-search-verify", "Hot Search Verify"),
                Map.entry("report", "Reports"),
                Map.entry("hint-report", "Hint Report"),
                Map.entry("hot-search-report", "Hot Search Report"),
                Map.entry("finance", "Finance"),
                Map.entry("promotion", "Promotion Funds"),
                Map.entry("account-balance", "Account Balance"),
                Map.entry("batch-query", "Batch Query"),
                Map.entry("detail-query", "Detail Query"),
                Map.entry("merchant-reconcile", "Merchant Reconciliation"),
                Map.entry("writeoff-reconcile", "Write-off Reconciliation"),
                Map.entry("debt-reconcile", "Debt Reconciliation"),
                Map.entry("approval", "Approval Management"),
                Map.entry("approval-center", "Approval Center"),
                Map.entry("hr", "Group HR"),
                Map.entry("employee-management", "Employee Management"),
                Map.entry("organization-management", "Organization"),
                Map.entry("position-management", "Position"),
                Map.entry("login-log", "Employee Activity"),
                Map.entry("permission", "Permission Management"),
                Map.entry("role-management", "Role Management"),
                Map.entry("function-permission", "Function Authorization"),
                Map.entry("data-permission", "Data Authorization"),
                Map.entry("system-config", "System Config"),
                Map.entry("menu-config", "Menu Config"),
                Map.entry("translation-manage", "Translation Config"),
                Map.entry("rule-config", "Rule Config"),
                Map.entry("merchant-order-manage", "Order Management"));
        for (Map.Entry<String, String> entry : enNames.entrySet()) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET name_en = ? WHERE menu_key = ? AND (name_en IS NULL OR name_en = '')",
                    entry.getValue(), entry.getKey());
        }
    }

    /** 角色-菜单权限关联表: 不存在则创建, 存在则补充 actions 列, 并迁移旧 JSON 权限 */
    private void migrateRoleMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_role_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_role_menu ("
                            + "role_id BIGINT NOT NULL COMMENT '角色ID', "
                            + "menu_id BIGINT NOT NULL COMMENT '菜单ID', "
                            + "actions TEXT NULL COMMENT '允许的操作 JSON数组', "
                            + "PRIMARY KEY (role_id, menu_id)"
                            + ") COMMENT='角色-菜单权限关联表'");
            log.info("已自动创建角色菜单关联表 sys_role_menu");
        } else {
            addColumnIfAbsent("sys_role_menu", "actions",
                    "ALTER TABLE sys_role_menu ADD COLUMN actions TEXT NULL COMMENT '允许的操作 JSON数组'");
        }
        migrateRolePermissions();
    }

    /** 部门-菜单权限关联表: 不存在则创建, 并迁移旧 JSON 权限 */
    private void migrateDepartmentMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_department_menu ("
                            + "dept_id BIGINT NOT NULL COMMENT '部门ID', "
                            + "menu_id BIGINT NOT NULL COMMENT '菜单ID', "
                            + "actions TEXT NULL COMMENT '允许的操作 JSON数组', "
                            + "PRIMARY KEY (dept_id, menu_id)"
                            + ") COMMENT='部门-菜单权限关联表'");
            log.info("已自动创建部门菜单关联表 sys_department_menu");
        }
        migrateDepartmentPermissions();
    }

    /** 将 sys_role.permissions 旧 JSON 迁移到 sys_role_menu (按角色幂等) */
    private void migrateRolePermissions() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, permissions FROM sys_role "
                        + "WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]' "
                        + "AND id NOT IN (SELECT DISTINCT role_id FROM sys_role_menu)");
        if (rows.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : rows) {
            Long roleId = ((Number) row.get("id")).longValue();
            List<MenuPermissionDTO> perms = JsonUtils.parsePermissions((String) row.get("permissions"));
            for (MenuPermissionDTO perm : perms) {
                Long menuId = resolveMenuId(perm.getMenuKey());
                if (menuId == null) {
                    continue;
                }
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                        roleId, menuId, JsonUtils.toJson(perm.getActions()));
            }
        }
        log.info("已迁移 {} 个角色的旧版权限到 sys_role_menu", rows.size());
    }

    /** 将 sys_department.permissions 旧 JSON 迁移到 sys_department_menu (按部门幂等) */
    private void migrateDepartmentPermissions() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, permissions FROM sys_department "
                        + "WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]' "
                        + "AND id NOT IN (SELECT DISTINCT dept_id FROM sys_department_menu)");
        if (rows.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : rows) {
            Long deptId = ((Number) row.get("id")).longValue();
            List<MenuPermissionDTO> perms = JsonUtils.parsePermissions((String) row.get("permissions"));
            for (MenuPermissionDTO perm : perms) {
                Long menuId = resolveMenuId(perm.getMenuKey());
                if (menuId == null) {
                    continue;
                }
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)",
                        deptId, menuId, JsonUtils.toJson(perm.getActions()));
            }
        }
        log.info("已迁移 {} 个部门的旧版权限到 sys_department_menu", rows.size());
    }

    /** 根据 menuKey 获取菜单ID, 不存在时自动创建占位菜单 */
    private Long resolveMenuId(String menuKey) {
        if (!StringUtils.hasText(menuKey)) {
            return null;
        }
        String key = menuKey.trim();
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, key);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, type, status, deleted, sort_order) "
                        + "VALUES (NULL, ?, ?, 2, 1, 0, 0)",
                key, key);
        Long menuId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        log.info("已为权限菜单标识 [{}] 自动创建占位菜单 (id={})", key, menuId);
        return menuId;
    }

    /** 种子系统菜单: 确保前端定义的所有菜单在 sys_menu 中存在 (幂等) */
    private void seedSystemMenus() {
        // key -> [name, parentKey|null, sort]
        Map<String, String[]> menus = new LinkedHashMap<>();
        // ── 顶级菜单 ──
        menus.put("home",                new String[]{"首頁",            null,  "1"});
        menus.put("merchant_group",      new String[]{"商戶集團管理",     null,  "2"});
        menus.put("merchant_promotion",  new String[]{"商家推廣工具",      null,  "3"});
        menus.put("promotion_tool",      new String[]{"推廣通",           null,  "4"});
        menus.put("search",              new String[]{"搜索管理",          null,  "5"});
        menus.put("finance",             new String[]{"財務管理",          null,  "6"});
        menus.put("hr",                  new String[]{"集團人事",          null,  "7"});
        menus.put("permission",          new String[]{"權限管理",          null,  "8"});
        menus.put("system-config",       new String[]{"系統配置",          null,  "9"});
        // ── 商戶集團管理 ──
        menus.put("merchant-group-list", new String[]{"集團管理",         "merchant_group",     "1"});
        menus.put("store-list",          new String[]{"門店管理",         "merchant_group",     "2"});
        // ── 商家推廣工具 ──
        menus.put("promotion-dashboard", new String[]{"數據看板",         "merchant_promotion", "1"});
        menus.put("promotion-algorithm", new String[]{"算法庫",           "merchant_promotion", "2"});
        menus.put("promotion-slot-config", new String[]{"瀑布流策略",     "merchant_promotion", "3"});
        menus.put("promotion-waterfall", new String[]{"銷售定價",         "merchant_promotion", "4"});
        menus.put("gift-manage",         new String[]{"贈送管理",         "merchant_promotion", "5"});
        menus.put("ad-sales",            new String[]{"廣告銷售",         "merchant_promotion", "6"});
        menus.put("promotion-word-library", new String[]{"詞庫管理",     "merchant_promotion", "7"});
        // ── 商家推廣工具 > 贈送管理 ──
        menus.put("gift-detail",         new String[]{"推廣贈送",         "gift-manage",        "1"});
        menus.put("gift-consume-detail", new String[]{"消費明細",         "gift-manage",        "2"});
        // ── 推廣通 ──
        menus.put("promotion-sales-config", new String[]{"店鋪推廣",     "promotion_tool",     "1"});
        menus.put("promotion-report-group", new String[]{"報表分析",     "promotion_tool",     "2"});
        menus.put("promotion-report-overview", new String[]{"數據概覽",  "promotion-report-group", "1"});
        menus.put("promotion-report-order", new String[]{"訂單效果報表", "promotion-report-group", "2"});
        menus.put("promotion-report-compare", new String[]{"推薦類型對比", "promotion-report-group", "3"});
        // ── 搜索管理 ──
        menus.put("search-config-new",   new String[]{"搜索配置",         "search",             "1"});
        menus.put("global-config",       new String[]{"全局配置",         "search-config-new",  "1"});
        menus.put("channel-strategy",    new String[]{"維度策略",         "search-config-new",  "2"});
        menus.put("search-guide",        new String[]{"搜索引導",         "search",             "2"});
        menus.put("hint-config",         new String[]{"底紋配置",         "search-guide",       "1"});
        menus.put("hot-search-config",   new String[]{"熱搜配置",         "search-guide",       "2"});
        menus.put("search-weight-config", new String[]{"權重干預",       "search-guide",       "3"});
        menus.put("search-library",      new String[]{"搜索詞庫",         "search",             "3"});
        menus.put("word-segmentation",   new String[]{"分詞詞庫",         "search-library",     "1"});
        menus.put("synonym-config",      new String[]{"同義詞庫",         "search-library",     "2"});
        menus.put("hot-search-library",  new String[]{"熱搜詞庫",         "search-library",     "3"});
        menus.put("stop-words",          new String[]{"停用詞庫",         "search-library",     "4"});
        menus.put("search-verify-group", new String[]{"效果校驗",         "search",             "4"});
        menus.put("search-verify",       new String[]{"搜索校驗",         "search-verify-group", "1"});
        menus.put("hint-verify",         new String[]{"底紋校驗",         "search-verify-group", "2"});
        menus.put("hot-search-verify",   new String[]{"熱搜校驗",         "search-verify-group", "3"});
        menus.put("report",              new String[]{"報表統計",          "search",             "5"});
        menus.put("hint-report",         new String[]{"底紋報表",         "report",             "1"});
        menus.put("hot-search-report",   new String[]{"熱搜報表",         "report",             "2"});
        // ── 財務管理 ──
        menus.put("promotion",           new String[]{"推廣金管理",       "finance",            "1"});
        menus.put("account-balance",     new String[]{"賬戶餘額",         "promotion",          "1"});
        menus.put("batch-query",         new String[]{"批次查詢",         "promotion",          "2"});
        menus.put("detail-query",        new String[]{"明細查詢",         "promotion",          "3"});
        menus.put("merchant-reconcile",  new String[]{"商戶通對賬",       "finance",            "2"});
        menus.put("writeoff-reconcile",  new String[]{"充消對賬",         "merchant-reconcile", "1"});
        menus.put("debt-reconcile",      new String[]{"欠款對賬",         "merchant-reconcile", "2"});
        menus.put("approval",            new String[]{"審批管理",          "finance",            "3"});
        menus.put("approval-center",     new String[]{"審批中心",         "approval",           "1"});
        // ── 集團人事 ──
        menus.put("employee-management", new String[]{"員工管理",         "hr",                 "1"});
        menus.put("organization-management", new String[]{"組織管理",     "hr",                 "2"});
        menus.put("position-management", new String[]{"職位管理",         "hr",                 "3"});
        menus.put("login-log",           new String[]{"員工動態",         "hr",                 "4"});
        // ── 權限管理 ──
        menus.put("role-management",     new String[]{"角色管理",         "permission",         "1"});
        menus.put("function-permission", new String[]{"功能授權",         "permission",         "2"});
        menus.put("data-permission",     new String[]{"數據授權",         "permission",         "3"});
        // ── 系統配置 ──
        menus.put("menu-config",         new String[]{"菜單配置",         "system-config",      "1"});
        menus.put("translation-manage",  new String[]{"多語言配置",         "system-config",      "2"});
        menus.put("rule-config",         new String[]{"規則配置",         "system-config",      "3"});

        int created = 0;
        int updated = 0;
        for (Map.Entry<String, String[]> entry : menus.entrySet()) {
            String menuKey = entry.getKey();
            String name = entry.getValue()[0];
            String parentKey = entry.getValue()[1];
            int sort = Integer.parseInt(entry.getValue()[2]);

            Long existing = queryMenuIdByKey(menuKey);

            // 计算正确的 parentId
            Long parentId = null;
            if (parentKey != null) {
                parentId = queryMenuIdByKey(parentKey);
                if (parentId == null) {
                    log.warn("种子菜单 [{}]: 父菜单 [{}] 不存在, 跳过", menuKey, parentKey);
                    continue;
                }
            }

            if (existing != null) {
                // 更新名称/排序/parentId 与种子数据不一致的记录 (修复 resolveMenuId 占位数据)
                Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT name, parent_id, sort_order FROM sys_menu WHERE id = ?", existing)
                        .stream().findFirst().orElse(null);
                if (row != null) {
                    String curName = (String) row.get("name");
                    Number curParentRaw = (Number) row.get("parent_id");
                    Long curParentId = curParentRaw != null ? curParentRaw.longValue() : null;
                    int curSort = ((Number) row.get("sort_order")).intValue();
                    boolean needUpdate = !name.equals(curName)
                            || !java.util.Objects.equals(curParentId, parentId)
                            || curSort != sort;
                    if (needUpdate) {
                        jdbcTemplate.update(
                                "UPDATE sys_menu SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?",
                                name, parentId, sort, existing);
                        updated++;
                    }
                }
                continue;
            }

            if (parentId != null) {
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) "
                                + "VALUES (?, ?, ?, 2, ?, 1, 0)",
                        parentId, menuKey, name, sort);
            } else {
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) "
                                + "VALUES (NULL, ?, ?, 1, ?, 1, 0)",
                        menuKey, name, sort);
            }
            created++;
        }
        if (created > 0) {
            log.info("已种子化 {} 个系统菜单到 sys_menu", created);
        }
        if (updated > 0) {
            log.info("已修正 {} 个系统菜单的名称/层级/排序", updated);
        }

        // 清理已废弃的菜单：promotion-order-manage（广告销售下的订单管理已移除）
        Long obsoleteId = queryMenuIdByKey("promotion-order-manage");
        if (obsoleteId != null) {
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", obsoleteId);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", obsoleteId);
            jdbcTemplate.update("DELETE FROM sys_menu WHERE id = ?", obsoleteId);
            log.info("已清理废弃菜单 [promotion-order-manage] 及其权限关联", obsoleteId);
        }
    }

    /** 根据 menu_key 查询菜单ID (不存在返回 null) */
    private Long queryMenuIdByKey(String menuKey) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, menuKey);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** 若密码非合法 BCrypt 值(如 SQL 占位符), 则重置为默认密码的加密值 */
    private void resetPasswordIfNeeded(String username, String rawPassword) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            return;
        }
        String pwd = user.getPassword();
        boolean validBcrypt = pwd != null && pwd.startsWith("$2") && pwd.length() >= 60;
        if (!validBcrypt) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            sysUserMapper.updateById(user);
            log.info("已初始化用户 [{}] 的默认密码", username);
        }
    }
}
