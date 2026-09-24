package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 统一门户与分系统改造 · 基础结构迁移（阶段 B）。
 * <p>
 * 遵循项目规范（AGENTS.md §3）：
 * <ul>
 *   <li>{@code applyOnce(versionKey, doMigrate, verifyMigration)} — 任务 + 后置校验都通过才记录版本；</li>
 *   <li>不吞异常，DDL 失败必须向上抛出；</li>
 *   <li>一次性推导迁移（菜单授权反推系统准入）由 {@code applyOnce} 保证不重跑，
 *       避免后续撤销被菜单授权推回。</li>
 * </ul>
 * <p>
 * 版本键 {@code core:system-portal:v1.0}；对应参考 SQL {@code backend/sql/192_system_portal.sql}；
 * 唯一真值来源：{@code docs/system-portal/inventory.md}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(15)
public class SystemPortalSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "core:system-portal:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
        // 展示元数据（名称/英文/简介/图标/排序）以代码种子为准，每次启动幂等刷新，
        // 使重命名等调整无需新增迁移即可对已初始化库生效；仅更新展示字段，
        // 不触碰 status/deleted 及系统准入关系。
        seedSystems();
    }

    // ──────────────────────────────────────────────────────────────
    //  任务：建表 + 补列 + 种子 + 归属回填 + 系统准入推导
    // ──────────────────────────────────────────────────────────────
    private void doMigrate() {
        createSystemTable();
        addMenuSystemCodeColumnIfAbsent();
        createRoleSystemTable();
        createDepartmentSystemTable();
        seedSystems();
        backfillTopLevelMenuSystem();
        propagateSystemToDescendants();
        deriveRoleSystemFromMenuGrants();
        deriveDepartmentSystemFromMenuGrants();
        log.info("系统门户底座迁移完成：4 张表 / sys_menu.system_code / 顶级+叶子归属 / 角色与部门系统准入回填");
    }

    private void createSystemTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_system ("
                        + "code VARCHAR(32) PRIMARY KEY COMMENT '系统编码，唯一且不可修改',"
                        + "name VARCHAR(64) NOT NULL COMMENT '系统中文名',"
                        + "name_en VARCHAR(64) COMMENT '系统英文名',"
                        + "description VARCHAR(255) COMMENT '系统简介',"
                        + "icon VARCHAR(64) COMMENT '前端图标 key',"
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '门户排序',"
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',"
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "deleted TINYINT NOT NULL DEFAULT 0,"
                        + "KEY idx_sys_system_sort (sort_order)"
                        + ") COMMENT='系统清单（用于统一门户与系统准入）'");
    }

    private void addMenuSystemCodeColumnIfAbsent() {
        if (columnExists("sys_menu", "system_code")) {
            return;
        }
        jdbcTemplate.execute(
                "ALTER TABLE sys_menu ADD COLUMN system_code VARCHAR(32) DEFAULT NULL "
                        + "COMMENT '归属系统编码；顶级菜单必填，叶子菜单继承父级；NULL 表示暂未归属'");
        if (!indexExists("sys_menu", "idx_menu_system_code")) {
            jdbcTemplate.execute("ALTER TABLE sys_menu ADD INDEX idx_menu_system_code (system_code)");
        }
    }

    private void createRoleSystemTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_role_system ("
                        + "role_id BIGINT NOT NULL COMMENT 'sys_role.id',"
                        + "system_code VARCHAR(32) NOT NULL COMMENT 'sys_system.code',"
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                        + "PRIMARY KEY (role_id, system_code),"
                        + "KEY idx_role_system_code (system_code)"
                        + ") COMMENT='角色与系统准入关联'");
    }

    private void createDepartmentSystemTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_department_system ("
                        + "dept_id BIGINT NOT NULL COMMENT 'sys_department.id',"
                        + "system_code VARCHAR(32) NOT NULL COMMENT 'sys_system.code',"
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                        + "PRIMARY KEY (dept_id, system_code),"
                        + "KEY idx_dept_system_code (system_code)"
                        + ") COMMENT='部门与系统准入关联'");
    }

    /** 种子 10 个业务系统；portal 是哨兵值不落库。 */
    private void seedSystems() {
        Object[][] rows = {
                {SystemCode.ADS.code(),      "廣告推薦系統", "Ads & Recommendation", "广告销售、商家推广、推广通、团购秒杀",       "AimOutlined",               10},
                {SystemCode.MERCHANT.code(), "商戶運營系統",   "Merchant Ops",      "商户集团、门店、门店数据、地图规划",         "ShopOutlined",              20},
                {SystemCode.SEARCH.code(),   "搜索運營系統",   "Search Ops",        "搜索词库、引导、策略、校验、报表",           "SearchOutlined",            30},
                {SystemCode.FINANCE.code(),  "財務系統",       "Finance",           "账户余额、批次、明细、对账、审批中心",       "AccountBookOutlined",       40},
                {SystemCode.AI.code(),       "AI 管理系統",    "AI Hub",            "模型、配额、授权、MCP、审计、能耗",          "RobotOutlined",             50},
                {SystemCode.HR.code(),       "HR 系統",        "Human Resources",   "员工、组织、职位、员工动态",                 "TeamOutlined",              60},
                {SystemCode.EAM.code(),      "物資管理系統",   "EAM",               "资产、耗材、采购、库存、盘点",               "InboxOutlined",             70},
                {SystemCode.OA.code(),       "OA 系統",        "OA",                "流程中心、流程事项、审批配置、员工自助",     "SolutionOutlined",          80},
                {SystemCode.IAM.code(),      "權限中心",       "IAM",               "角色、功能授权、数据授权、菜单配置",         "SafetyCertificateOutlined", 90},
                {SystemCode.PLATFORM.code(), "平台配置",       "Platform",          "通知、多语言、规则、版本、翻译工作台",       "SettingOutlined",          100},
        };
        for (Object[] r : rows) {
            jdbcTemplate.update(
                    "INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, 1, 0) "
                            + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                            + "description = VALUES(description), icon = VALUES(icon), sort_order = VALUES(sort_order)",
                    r[0], r[1], r[2], r[3], r[4], r[5]);
        }
    }

    /** 顶级菜单归属回填。唯一真值来源：docs/system-portal/inventory.md §2。 */
    private void backfillTopLevelMenuSystem() {
        updateMenuSystem(SystemCode.PORTAL.code(),   List.of("home"));
        updateMenuSystem(SystemCode.MERCHANT.code(), List.of("merchant_group"));
        updateMenuSystem(SystemCode.ADS.code(),      List.of("merchant_promotion", "promotion_tool", "group-purchase"));
        updateMenuSystem(SystemCode.SEARCH.code(),   List.of("search"));
        updateMenuSystem(SystemCode.FINANCE.code(),  List.of("finance"));
        updateMenuSystem(SystemCode.AI.code(),       List.of("ai-assistant"));
        updateMenuSystem(SystemCode.HR.code(),       List.of("hr"));
        updateMenuSystem(SystemCode.EAM.code(),      List.of("asset-management"));
        updateMenuSystem(SystemCode.OA.code(),       List.of("oa-center"));
        updateMenuSystem(SystemCode.IAM.code(),      List.of("permission"));
        updateMenuSystem(SystemCode.PLATFORM.code(), List.of("system-config", "i18n-center"));
        // 例外：菜单配置物理上在 system-config 树下，但归 iam（治理面）
        updateMenuSystem(SystemCode.IAM.code(),      List.of("menu-config"));
    }

    private void updateMenuSystem(String systemCode, List<String> menuKeys) {
        if (menuKeys.isEmpty()) {
            return;
        }
        String placeholders = String.join(",", menuKeys.stream().map(k -> "?").toList());
        Object[] params = new Object[menuKeys.size() + 1];
        params[0] = systemCode;
        for (int i = 0; i < menuKeys.size(); i++) {
            params[i + 1] = menuKeys.get(i);
        }
        jdbcTemplate.update(
                "UPDATE sys_menu SET system_code = ? WHERE menu_key IN (" + placeholders + ") AND deleted = 0",
                params);
    }

    /**
     * 叶子菜单继承父级 system_code；因层级最深 4 层，迭代直至本轮无更新或超过上限。
     * 每次循环只处理「当前 system_code 为 NULL 且父级已有 system_code」的行，
     * 保证幂等（已回填行不再改写）；跳过 portal 哨兵，防止叶子继承成 portal 后污染业务菜单树。
     */
    private void propagateSystemToDescendants() {
        int maxDepth = 6;
        for (int i = 0; i < maxDepth; i++) {
            int affected = jdbcTemplate.update(
                    "UPDATE sys_menu c "
                            + "JOIN sys_menu p ON c.parent_id = p.id "
                            + "SET c.system_code = p.system_code "
                            + "WHERE c.system_code IS NULL "
                            + "AND p.system_code IS NOT NULL "
                            + "AND p.system_code <> 'portal' "
                            + "AND c.deleted = 0 AND p.deleted = 0");
            if (affected == 0) {
                return;
            }
        }
        log.warn("菜单 system_code 继承迭代到上限仍未收敛，可能存在超深或环形层级，请人工排查");
    }

    /**
     * 一次性推导角色系统准入：若角色已持有某系统下任一启用菜单，则授予该角色该系统准入。
     * 使用 INSERT IGNORE + 联合主键保证幂等；跳过 sys_admin 内置角色。
     */
    private void deriveRoleSystemFromMenuGrants() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, m.system_code "
                        + "FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.status = 1 "
                        + "  AND m.system_code IS NOT NULL AND m.system_code <> 'portal' "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1 "
                        + "WHERE r.code <> 'admin'");
    }

    /** 一次性推导部门系统准入；与角色对称。 */
    private void deriveDepartmentSystemFromMenuGrants() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, m.system_code "
                        + "FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.status = 1 "
                        + "  AND m.system_code IS NOT NULL AND m.system_code <> 'portal' "
                        + "JOIN sys_department d ON d.id = dm.dept_id AND d.deleted = 0 AND d.status = 1");
    }

    // ──────────────────────────────────────────────────────────────
    //  后置校验：任一失败抛异常，applyOnce 不记录版本
    // ──────────────────────────────────────────────────────────────
    private void verifyMigration() {
        requireTable("sys_system");
        requireTable("sys_role_system");
        requireTable("sys_department_system");
        requireColumn("sys_menu", "system_code");

        Integer seedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_system WHERE deleted = 0", Integer.class);
        if (seedCount == null || seedCount < 10) {
            throw new IllegalStateException("sys_system 种子未就绪：期望 ≥10 条，实际 " + seedCount);
        }

        // 顶级菜单归属完整性（除 home 外全部顶级菜单必须有 system_code）
        List<Map<String, Object>> missing = jdbcTemplate.queryForList(
                "SELECT menu_key FROM sys_menu "
                        + "WHERE parent_id IS NULL AND deleted = 0 AND status = 1 "
                        + "AND system_code IS NULL");
        if (!missing.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> row : missing) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(row.get("menu_key"));
            }
            throw new IllegalStateException("存在未归属系统的顶级菜单: " + sb);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  工具方法（不吞异常）
    // ──────────────────────────────────────────────────────────────
    private void requireTable(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        if (count == null || count == 0) {
            throw new IllegalStateException("表未就绪: " + table);
        }
    }

    private void requireColumn(String table, String column) {
        if (!columnExists(table, column)) {
            throw new IllegalStateException("列未就绪: " + table + "." + column);
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean indexExists(String table, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        return count != null && count > 0;
    }
}
