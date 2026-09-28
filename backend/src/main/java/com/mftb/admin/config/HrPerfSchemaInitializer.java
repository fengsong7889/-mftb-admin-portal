package com.mftb.admin.config;

import com.mftb.admin.constant.HrEssConstants;
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
 * 績效考核（P1）迁移初始化器，两个版本键各自 applyOnce + 后置校验：
 * <p>
 * {@code hr:performance-schema:v1.0} —— 执行 classpath 脚本 {@code 201_hr_performance.sql}
 * 建 6 张表（周期/模板/指标/计划/考核单/打分明细）并种子等级与指标类型字典、3 条编号规则、
 * 整批确认流程定义 hr_perf_confirm。DDL 只在脚本里存一份，避免 Java 与 SQL 双份漂移。
 * <p>
 * {@code hr:performance-menu:v1.0} —— 新建一级域 perf-center「績效考核」与 HR 侧三叶子，
 * 并把 ess-performance 挂到既有自助域下；<strong>同时写 sys_role_system 系统准入</strong>：
 * 菜单授权与系统准入是两条独立线，只授菜单则非超管在门户里根本看不到入口。
 * 建菜单时直接落正确 sort_order，不依赖下一次启动的 reconcileMenuMasterData 才修正排序。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrPerfSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "hr:performance-schema:v1.0";
    /**
     * v1.1：域与自助叶图标改为 @ant-design/icons 真实存在的 StarOutlined / FlagOutlined
     * （v1.0 写的 MedalOutlined、AwardOutlined 在前端图标注册表里找不到，菜单会退成默认图标），
     * upsert 的自愈分支会把 DB 已有行的 icon/name_en 刷正。
     */
    private static final String VERSION_MENU = "hr:performance-menu:v1.1";

    /** 与 backend/sql 下同名文件一致的 classpath 建表脚本（幂等：IF NOT EXISTS / INSERT IGNORE） */
    private static final String SCHEMA_SCRIPT = "201_hr_performance.sql";

    /** 一级菜单表 sys_menu.type：1 一级目录，2 菜单 */
    private static final int TYPE_DOMAIN = 1;
    private static final int TYPE_LEAF = 2;

    /** 层级标记：一级域 / HR 叶子 / 自助叶子（挂在既有 ess-center 下） */
    private static final String LEVEL_DOMAIN = "1";
    private static final String LEVEL_LEAF = "2";
    private static final String LEVEL_SELF = "3";

    /** 绩效数据属人事域，沿用 hr 门户系统；一级域排在 org-center(10) 之后 */
    private static final String SYSTEM_CODE = "hr";
    private static final int DOMAIN_SORT = 11;
    /** 自助域内接续既有三张叶子之后 */
    private static final int SELF_SORT = 5;

    /** {menuKey, 名称, 图标, 英文名, 层级} */
    private static final String[][] MENUS = {
            {HrPerfConstants.MENU_DOMAIN, "績效考核", "StarOutlined", "Performance", LEVEL_DOMAIN},
            {HrPerfConstants.MENU_ADMIN, "周期與計劃", "RiseOutlined", "Cycles & Plans", LEVEL_LEAF},
            {HrPerfConstants.MENU_REVIEW, "評分工作台", "CheckSquareOutlined", "Review Workbench", LEVEL_LEAF},
            {HrPerfConstants.MENU_CALIBRATION, "校準與確認", "SlidersOutlined", "Calibration & Confirm", LEVEL_LEAF},
            {HrPerfConstants.MENU_SELF, "我的績效", "FlagOutlined", "My Performance", LEVEL_SELF},
    };

    private static final String ALL_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    private static final String READ_WRITE = "[\"view\",\"create\",\"edit\"]";
    private static final String READ_ONLY = "[\"view\"]";

    private static final String[] TABLES = {
            "hr_perf_cycle", "hr_perf_template", "hr_perf_indicator",
            "hr_perf_plan", "hr_perf_assessment", "hr_perf_score_item",
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_SCHEMA, this::migrateSchema, this::verifySchema);
        } catch (Exception e) {
            log.error("HR 績效考核建表/種子失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_MENU, this::migrateMenu, this::verifyMenu);
        } catch (Exception e) {
            log.error("HR 績效考核菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    // ==================== 表结构与种子 ====================

    private void migrateSchema() {
        ClassPathResource resource = new ClassPathResource(SCHEMA_SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + SCHEMA_SCRIPT + "，绩效表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // 不吞异常：脚本读不到就等于迁移没做，交给 applyOnce 记失败并下次重试
            throw new IllegalStateException("读取建表脚本失败 " + SCHEMA_SCRIPT + ": " + e.getMessage(), e);
        }
        // 去掉 -- 注释行后按分号切分；脚本内所有字面量均不含分号
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        log.info("HR 績效考核建表腳本已執行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
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
        requireAtLeast("PERF_GRADE 等级字典", 5,
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = ? AND deleted = 0", HrPerfConstants.DICT_GRADE);
        requireAtLeast("PERF_INDICATOR_TYPE 指标类型字典", 4,
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = ? AND deleted = 0", HrPerfConstants.DICT_INDICATOR_TYPE);
        requireAtLeast("績效编号规则", 3,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN (?, ?, ?)",
                HrPerfConstants.SEQ_CYCLE, HrPerfConstants.SEQ_PLAN, HrPerfConstants.SEQ_ASSESSMENT);
        requireAtLeast("績效确认流程定义", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = ?", HrPerfConstants.PROCESS_CODE);
    }


    /** 校验参数必须与占位符严格对齐：标签单独传，不能再混进 varargs 当 SQL 参数 */
    private void requireAtLeast(String label, int min, String sql, Object... args) {
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, args);
        if (n == null || n < min) {
            throw new IllegalStateException(label + " 未就绪（当前 " + n + "，要求 >= " + min + "）");
        }
    }

    // ==================== 菜单与授权 ====================

    private void migrateMenu() {
        Long domainId = null;
        int leafSort = 1;
        for (String[] m : MENUS) {
            Long parentId = null;
            if (LEVEL_LEAF.equals(m[4])) {
                parentId = requireMenuId(HrPerfConstants.MENU_DOMAIN, "绩效一级域");
            } else if (LEVEL_SELF.equals(m[4])) {
                parentId = requireMenuId(HrEssConstants.MENU_DOMAIN, "员工自助一级域");
            }
            int sort = LEVEL_DOMAIN.equals(m[4]) ? DOMAIN_SORT
                    : LEVEL_SELF.equals(m[4]) ? SELF_SORT : leafSort++;
            Long id = upsertMenu(parentId, m, sort);
            if (LEVEL_DOMAIN.equals(m[4])) {
                domainId = id;
            }
        }
        if (domainId == null) {
            throw new IllegalStateException("一级菜单域 " + HrPerfConstants.MENU_DOMAIN + " 未就绪");
        }

        grant(HrPerfConstants.MENU_DOMAIN, READ_ONLY, "admin");
        grant(HrPerfConstants.MENU_ADMIN, ALL_ACTIONS, "admin");
        grant(HrPerfConstants.MENU_REVIEW, ALL_ACTIONS, "admin");
        grant(HrPerfConstants.MENU_CALIBRATION, ALL_ACTIONS, "admin");
        grant(HrPerfConstants.MENU_SELF, ALL_ACTIONS, "admin");
        // 员工自助：只授自助叶子，且不得出现任何绩效 HR 菜单
        grant(HrPerfConstants.MENU_DOMAIN, READ_ONLY, "employee_self_service");
        grant(HrPerfConstants.MENU_SELF, READ_WRITE, "employee_self_service");
        // 业务主管审批角色：默认可进评分工作台（只评自己下属），周期与校准不自动放开
        grant(HrPerfConstants.MENU_DOMAIN, READ_ONLY, "FIN_BIZ_APPROVER");
        grant(HrPerfConstants.MENU_REVIEW, READ_WRITE, "FIN_BIZ_APPROVER");
        grant(HrPerfConstants.MENU_SELF, READ_ONLY, "FIN_BIZ_APPROVER");

        // 系统准入与菜单授权是两条独立线：漏这里等于员工看不到入口
        systemAccess("employee_self_service");
        systemAccess("FIN_BIZ_APPROVER");
        permissionService.evictAll();
    }

    private Long requireMenuId(String menuKey, String label) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            throw new IllegalStateException(label + " " + menuKey + " 不存在，无法挂载绩效菜单");
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
            log.info("已創建績效菜單: {} ({}) parent={} sort={}", m[0], m[1], parentId, sort);
            id = queryMenuId(m[0]);
        } else {
            // 结构字段自愈：父级/类型/门户域/图标/英文名（名称与自定义排序留给菜单配置页）
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

    private void systemAccess(String roleCode) {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT r.id, ? FROM sys_role r WHERE r.code = ? AND r.deleted = 0",
                SYSTEM_CODE, roleCode);
        log.info("績效系统准入授权: role={}, system={}, 新增={}（0 表示已存在）", roleCode, SYSTEM_CODE, inserted);
    }

    private void verifyMenu() {
        for (String[] m : MENUS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("績效菜單未就緒: " + m[0]);
            }
        }
        // 域与叶子不能挂在错误父级上，否则整棵绩效树在侧边栏不可见
        Integer misplaced = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu c LEFT JOIN sys_menu p ON p.id = c.parent_id AND p.deleted = 0 "
                        + "WHERE c.deleted = 0 AND c.menu_key IN (?, ?, ?) AND (p.id IS NULL OR p.menu_key <> ?)",
                Integer.class, HrPerfConstants.MENU_ADMIN, HrPerfConstants.MENU_REVIEW,
                HrPerfConstants.MENU_CALIBRATION, HrPerfConstants.MENU_DOMAIN);
        if (misplaced != null && misplaced > 0) {
            throw new IllegalStateException("绩效 HR 菜单父级不正确，共 " + misplaced + " 条");
        }
        Integer selfDetached = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu c JOIN sys_menu p ON p.id = c.parent_id "
                        + "WHERE c.deleted = 0 AND c.menu_key = ? AND p.menu_key <> ?",
                Integer.class, HrPerfConstants.MENU_SELF, HrEssConstants.MENU_DOMAIN);
        if (selfDetached != null && selfDetached > 0) {
            throw new IllegalStateException("绩效自助菜单未挂在员工自助域下");
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }
}
