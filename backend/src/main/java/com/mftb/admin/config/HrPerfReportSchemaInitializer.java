package com.mftb.admin.config;

import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.service.PermissionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 績效考核 M2（结果台账/改判留痕/申诉登记）迁移，两个版本键各自 applyOnce + 后置校验。
 * <p>
 * {@code hr:performance-report:v1.0} —— 执行 classpath 脚本 {@code 202_hr_perf_report.sql}
 * 建留痕流水与申诉登记两张表，并种子申诉状态字典与 PA 编号规则。DDL 只在脚本里存一份。
 * <p>
 * {@code hr:performance-report-menu:v1.0} —— 新建第二个一级域 {@code perf-report-center}「績效台賬」
 * 与其下三个 HR 叶子。台账与执行域分开是有意为之：结果趋势与改判追溯的受众是 HR/分析岗，
 * 不该和「谁能打分/谁能校准」共用一张菜单授权。建菜单时直接落正确 sort_order（顶级排 perf-center 之后），
 * 结构字段（父级/类型/图标/英文名）在已存在时自愈。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrPerfReportSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "hr:performance-report:v1.0";
    /**
     * v1.1：菜单名「申诉登記」是简体写法，改「申訴登記」；upsert 的自愈分支不改 name
     * （要保留用户在菜单配置页的自定义名），因此额外发一条只匹配旧默认名的定向修正。
     */
    private static final String VERSION_MENU = "hr:performance-report-menu:v1.1";

    private static final String SCHEMA_SCRIPT = "202_hr_perf_report.sql";

    /** 一级菜单表 sys_menu.type：1 一级目录，2 菜单 */
    private static final int TYPE_DOMAIN = 1;
    private static final int TYPE_LEAF = 2;

    private static final String LEVEL_DOMAIN = "1";
    private static final String LEVEL_LEAF = "2";

    /** 绩效台账仍属人事域门户；一级排序紧跟绩效执行域 perf-center(11) 之后 */
    private static final String SYSTEM_CODE = "hr";
    private static final int DOMAIN_SORT = 12;

    /** {menuKey, 名称, 图标, 英文名, 层级} —— 图标必须在 @ant-design/icons 真实存在且全库唯一 */
    private static final String[][] MENUS = {
            {HrPerfConstants.MENU_REPORT_DOMAIN, "績效台賬", "FundProjectionScreenOutlined", "Performance Reports", LEVEL_DOMAIN},
            {HrPerfConstants.MENU_LEDGER, "結果台賬", "TableOutlined", "Result Ledger", LEVEL_LEAF},
            {HrPerfConstants.MENU_AUDIT, "改判留痕", "ExceptionOutlined", "Calibration Trail", LEVEL_LEAF},
            {HrPerfConstants.MENU_APPEAL, "申訴登記", "ReconciliationOutlined", "Appeals", LEVEL_LEAF},
    };

    private static final String ALL_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    private static final String READ_ONLY = "[\"view\"]";

    private static final String[] TABLES = {"hr_perf_calibration_log", "hr_perf_appeal"};

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_SCHEMA, this::migrateSchema, this::verifySchema);
        } catch (Exception e) {
            log.error("HR 績效台賬建表/種子失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_MENU, this::migrateMenu, this::verifyMenu);
        } catch (Exception e) {
            log.error("HR 績效台賬菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    // ==================== 表结构与种子 ====================

    private void migrateSchema() {
        ClassPathResource resource = new ClassPathResource(SCHEMA_SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + SCHEMA_SCRIPT + "，績效台賬表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // 不吞异常：脚本读不到就等于迁移没做，交给 applyOnce 记失败并下次重试
            throw new IllegalStateException("读取建表脚本失败 " + SCHEMA_SCRIPT + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        log.info("HR 績效台賬建表腳本已執行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void verifySchema() {
        for (String table : TABLES) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪");
            }
        }
        requireAtLeast("PERF_APPEAL_STATUS 申诉状态字典", 4,
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = ? AND deleted = 0",
                HrPerfConstants.DICT_APPEAL_STATUS);
        requireAtLeast("申诉编号规则", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND prefix = 'PA'",
                HrPerfConstants.SEQ_APPEAL);
    }

    /** 校验参数必须与占位符严格对齐：标签单独传，不能混进 varargs 当 SQL 参数 */
    private void requireAtLeast(String label, int min, String sql, Object... args) {
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, args);
        if (n == null || n < min) {
            throw new IllegalStateException(label + " 未就绪（当前 " + n + "，要求 >= " + min + "）");
        }
    }

    // ==================== 菜单与授权 ====================

    private void migrateMenu() {
        Long domainId = null;
        // 定向改名：仅当当前名还是旧默认名（简体）时才动，不覆盖菜单配置页的自定义名
        jdbcTemplate.update("UPDATE sys_menu SET name = ?, updated_by = 'system' "
                        + "WHERE menu_key = ? AND deleted = 0 AND name = ?",
                "申訴登記", HrPerfConstants.MENU_APPEAL, "申诉登記");
        int leafSort = 1;
        for (String[] m : MENUS) {
            Long parentId = LEVEL_LEAF.equals(m[4])
                    ? requireMenuId(HrPerfConstants.MENU_REPORT_DOMAIN, "绩效台账一级域")
                    : null;
            int sort = LEVEL_DOMAIN.equals(m[4]) ? DOMAIN_SORT : leafSort++;
            Long id = upsertMenu(parentId, m, sort);
            if (LEVEL_DOMAIN.equals(m[4])) {
                domainId = id;
            }
        }
        if (domainId == null) {
            throw new IllegalStateException("一级菜单域 " + HrPerfConstants.MENU_REPORT_DOMAIN + " 未就绪");
        }

        for (String[] m : MENUS) {
            // 目录只需查看权；叶子给 HR 全量（台账要导出、留痕与申诉要处理）
            grant(m[0], LEVEL_DOMAIN.equals(m[4]) ? READ_ONLY : ALL_ACTIONS, "admin");
        }
        // admin 是超级管理员，权限校验直接放行，不依赖 sys_role_system；
        // 若后续要给非超管角色开台账，必须同时补该表的 hr 系统准入（准入与菜单授权是两条独立线）。
        permissionService.evictAll();
    }

    private Long requireMenuId(String menuKey, String label) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            throw new IllegalStateException(label + " " + menuKey + " 不存在，无法挂载績效台賬菜单");
        }
        return id;
    }

    private Long upsertMenu(Long parentId, String[] m, int sort) {
        int type = LEVEL_DOMAIN.equals(m[4]) ? TYPE_DOMAIN : TYPE_LEAF;
        Long id = queryMenuId(m[0]);
        if (id == null) {
            // 软删残留会占住 menu_key 唯一索引，先物理清理
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", m[0]);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted, system_code) "
                            + "VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)",
                    parentId, m[0], m[1], m[2], type, sort, SYSTEM_CODE);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE menu_key = ?", m[3], m[0]);
            log.info("已創建績效台賬菜單: {} ({}) parent={} sort={}", m[0], m[1], parentId, sort);
            id = queryMenuId(m[0]);
        } else {
            // 结构字段自愈：父级/类型/图标/英文名（名称与自定义排序留给菜单配置页）
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, type = ?, icon = ?, name_en = ?, system_code = ? "
                            + "WHERE id = ? AND deleted = 0",
                    parentId, type, m[2], m[3], SYSTEM_CODE, id);
        }
        return id;
    }

    /** 两步式授权：INSERT...SELECT + ON DUPLICATE 在 MySQL 8 会因同名列报 1052 歧义 */
    private void grant(String menuKey, String actions, String roleCode) {
        Long roleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? LIMIT 1", Long.class, roleCode)
                .stream().findFirst().orElse(null);
        Long menuId = queryMenuId(menuKey);
        if (roleId == null || menuId == null) {
            return;
        }
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    private void verifyMenu() {
        for (String[] m : MENUS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("績效台賬菜單未就緒: " + m[0]);
            }
        }
        // 域必须是顶级：挂错父级会让整棵台账树在侧边栏不可见
        Integer domainMisplaced = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE deleted = 0 AND menu_key = ? AND (parent_id IS NOT NULL OR type <> 1)",
                Integer.class, HrPerfConstants.MENU_REPORT_DOMAIN);
        if (domainMisplaced != null && domainMisplaced > 0) {
            throw new IllegalStateException("績效台賬一级域结构不正确（应为顶级目录）");
        }
        Integer leavesMisplaced = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu c LEFT JOIN sys_menu p ON p.id = c.parent_id AND p.deleted = 0 "
                        + "WHERE c.deleted = 0 AND c.menu_key IN (?, ?, ?) AND (p.id IS NULL OR p.menu_key <> ?)",
                Integer.class, HrPerfConstants.MENU_LEDGER, HrPerfConstants.MENU_AUDIT,
                HrPerfConstants.MENU_APPEAL, HrPerfConstants.MENU_REPORT_DOMAIN);
        if (leavesMisplaced != null && leavesMisplaced > 0) {
            throw new IllegalStateException("績效台賬叶子父级不正确，共 " + leavesMisplaced + " 条");
        }
        // 图标全库唯一是本域既定规则：撞车会让侧边栏无法按图标区分菜单
        Integer duplicatedIcon = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT icon FROM sys_menu WHERE deleted = 0 AND icon IS NOT NULL AND icon <> '' "
                        + "AND menu_key IN (?, ?, ?, ?) GROUP BY icon HAVING COUNT(*) > 1) t",
                Integer.class, HrPerfConstants.MENU_REPORT_DOMAIN, HrPerfConstants.MENU_LEDGER,
                HrPerfConstants.MENU_AUDIT, HrPerfConstants.MENU_APPEAL);
        if (duplicatedIcon != null && duplicatedIcon > 0) {
            throw new IllegalStateException("績效台賬菜单图标在本域内重复");
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }
}
