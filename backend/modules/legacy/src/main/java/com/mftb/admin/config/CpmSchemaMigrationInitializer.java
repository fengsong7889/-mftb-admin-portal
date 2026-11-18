/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 持续绩效系统（cpm）底座迁移：12 张 biz_cpm_* 表 + 5 个菜单种子 + 内置岗位模板 + 规则单行。
 *
 * <p>DDL 只在 classpath 脚本 {@code 336_cpm_core.sql} 存一份（{@code backend/sql/} 下同名
 * 文件为参考副本，由结构锁用例断言逐字一致），避免 Java 与 SQL 双份漂移。
 *
 * <p>版本键分工（沿用 meeting 域口径：已记录版本的环境不会回头跑旧 task，
 * 新增量一律另开键）：
 * <ul>
 *   <li>{@code cpm:schema:v1.0}：建表 + 后置校验（表/唯一键/实体依赖列就位）；</li>
 *   <li>{@code cpm:menu:v1.0}：5 个一级菜单 + admin 授权 + 系统准入反推；</li>
 *   <li>{@code cpm:template-seed:v1.0}：内置 5 套岗位模板词表（INSERT 只补不覆盖，管理员改过不顶）；</li>
 *   <li>{@code cpm:rule-seed:v1.0}：汇报规则单行（config_slot=default）。</li>
 * </ul>
 *
 * <p><b>启动顺序</b>：取 26，必须早于 {@code PermissionAnnotationValidator(@Order 30)}
 * （否则 cpm-* 菜单还没入库，控制器注解会被判"菜单不存在"、非超管永久 403），
 * 并晚于 {@code SystemPortalSchemaInitializer(@Order 15)}（sys_menu.system_code 列与 sys_system 行就绪）。
 * 全员基线授权不写在本文：见 {@code CpmAccessGrantInitializer}（与 MeetingAccessGrantInitializer 同构，
 * 每次启动重放自愈）。
 *
 * <p><b>菜单归属</b>：{@code system_code} 显式写 {@code cpm}。propagateSystemToDescendants 只在
 * 门户底座迁移那一次运行，晚于其插入的菜单留 NULL 会让门户剪枝与系统准入落到未定义行为。
 */
@Slf4j
@Component
@Order(26)
@RequiredArgsConstructor
public class CpmSchemaMigrationInitializer implements CommandLineRunner {

    static final String VERSION_SCHEMA = "cpm:schema:v1.0";
    static final String VERSION_MENU = "cpm:menu:v1.0";
    static final String VERSION_TEMPLATE = "cpm:template-seed:v1.0";
    static final String VERSION_RULE = "cpm:rule-seed:v1.0";

    private static final String SCHEMA_SCRIPT = "336_cpm_core.sql";
    private static final String SYSTEM_CODE = SystemCode.CPM.code();
    private static final String ADMIN_ROLE_CODE = "admin";
    private static final int MENU_TYPE_LEAF = 2;

    private static final String[] TABLES = {
            "biz_cpm_item", "biz_cpm_item_update", "biz_cpm_report", "biz_cpm_report_read",
            "biz_cpm_comment", "biz_cpm_reaction", "biz_cpm_recognition", "biz_cpm_view_grant",
            "biz_cpm_template", "biz_cpm_rule", "biz_cpm_ai_extraction", "biz_cpm_push_record",
    };

    /**
     * 并发正确性完全依赖的唯一键：缺任何一个的方向性后果都是"同一事实长出两行"。
     */
    private static final String[][] REQUIRED_UNIQUE_KEYS = {
            {"biz_cpm_item", "uk_cpm_item_source"},
            {"biz_cpm_report", "uk_cpm_report_scope"},
            {"biz_cpm_report_read", "uk_cpm_report_read"},
            {"biz_cpm_reaction", "uk_cpm_reaction"},
            {"biz_cpm_recognition", "uk_cpm_recognition"},
            {"biz_cpm_view_grant", "uk_cpm_view_grant"},
            {"biz_cpm_template", "uk_cpm_template_key"},
            {"biz_cpm_rule", "uk_cpm_rule_slot"},
            {"biz_cpm_ai_extraction", "uk_cpm_ai_request"},
    };

    /** 实体按字段拼 SELECT 必须存在的列（缺列=首次查询 bad SQL grammar，先钉进启动校验） */
    private static final String[][] REQUIRED_COLUMNS = {
            {"biz_cpm_item", "work_hours"},
            {"biz_cpm_item", "source_label"},
            {"biz_cpm_item", "target_id"},
            {"biz_cpm_item", "version"},
            {"biz_cpm_report", "ai_summary"},
            {"biz_cpm_report", "content_json"},
            {"biz_cpm_recognition", "sync_to_perf"},
            {"biz_cpm_recognition", "period_tag"},
            {"biz_cpm_template", "work_hours_enabled"},
            {"biz_cpm_ai_extraction", "input_hash"},
            {"biz_cpm_push_record", "event_type"},
    };

    /**
     * 系统级总开关（方案 §十四）：关掉即 cpm 菜单隐藏 + 接口拒绝。
     * <p>默认 true，行为与改造前完全一致；只有运维显式写 cpm.enabled=false 才生效。
     */
    @Value("${cpm.enabled:true}")
    private boolean cpmEnabled;

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        versionTracker.applyOnce(VERSION_MENU, this::doMenuMigrate, this::verifyMenus);
        versionTracker.applyOnce(VERSION_TEMPLATE, this::doTemplateSeed, this::verifyTemplates);
        versionTracker.applyOnce(VERSION_RULE, this::doRuleSeed, this::verifyRule);
        syncMenuVisibility();
    }

    /**
     * 总开关落地（方案 §十四）：{@code cpm.enabled=false} 时把 cpm 菜单整棵置 0，
     * 侧边栏与门户入口一起消失；接口侧由 {@code CpmAccessGuard.currentUser()} 同键拒绝。
     *
     * <p>每次启动都同步而不进 applyOnce：开关是运维手段，一旦版本化就会「只在第一次启动生效」，
     * 之后再关掉开关也不会隐藏菜单——那正是回滚通道最容易失效的地方。
     * 更新语句按值判定，状态本来就对得上一行也不会写，重复启动无副作用。
     */
    private void syncMenuVisibility() {
        int status = cpmEnabled ? 1 : 0;
        int changed = jdbcTemplate.update(
                "UPDATE sys_menu SET status = ? WHERE menu_key IN ('cpm-my','cpm-report','cpm-team','cpm-template','cpm-rule') "
                        + " AND deleted = 0 AND status <> ?", status, status);
        if (changed > 0) {
            log.info("持續績效選單可見性已按總開關同步: enabled={}, 更新 {} 個菜單", cpmEnabled, changed);
        }
    }

    /* ==================== 1. 表结构 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("持續績效建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，cpm 域無法寫入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下會長出重複事實（同鍵两条/重覆提醒/自我認定）");
            }
        }
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1] + " 列缺失，實體按字段拼 SELECT 會直接報錯");
            }
        }
    }

    /* ==================== 2. 菜单种子 ==================== */

    private void doMenuMigrate() {
        // menuKey/名称/路径/组件/图标必须逐条字面量调用：check-menu-consistency.mjs 只识别
        // ensureMenu(变量, "key", "名称", "/path", "Component", "Icon", ...) 形态，数组循环=门禁盲区
        ensureMenu(null, "cpm-my", "我的工作記錄", "/cpm-my",
                "MyWorklog", "FormOutlined", 1, CpmConstants.ACTIONS_USAGE, "My Work Log");
        ensureMenu(null, "cpm-report", "我的匯報", "/cpm-report",
                "MyReport", "FileDoneOutlined", 2, CpmConstants.ACTIONS_USAGE, "My Reports");
        ensureMenu(null, "cpm-team", "團隊匯報", "/cpm-team",
                "TeamReport", "TeamOutlined", 3, CpmConstants.ACTIONS_VIEW_EDIT, "Team Reports");
        ensureMenu(null, "cpm-template", "模板管理", "/cpm-template",
                "TemplateList", "AppstoreOutlined", 4, CpmConstants.ACTIONS_VIEW_EDIT, "Report Templates");
        ensureMenu(null, "cpm-rule", "匯報規則", "/cpm-rule",
                "ReportRule", "ControlOutlined", 5, CpmConstants.ACTIONS_RULE, "Reporting Rules");

        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("持續績效菜單已就緒（5 個一級菜單，system_code={}）", SYSTEM_CODE);
    }

    /** 与 AttendanceMenuInitializer/MeetingSchemaMigrationInitializer 同签名同参数序，勿改 */
    private Long ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions,
                            String nameEn) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon,
                    MENU_TYPE_LEAF, sortOrder, actions, SYSTEM_CODE);
            log.info("已創建 CPM 菜單: {} ({})", name, menuKey);
            return queryMenuId(menuKey);
        }
        jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = ?, path = ?, component = ?, icon = ?, system_code = ?, "
                        + "sort_order = ?, status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                parentId, path, component, icon, SYSTEM_CODE, sortOrder, id);
        jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                nameEn, id);
        return id;
    }

    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過 CPM 菜單授權");
            return;
        }
        upsertRoleGrant(adminRoleId, "cpm-my", CpmConstants.ACTIONS_USAGE);
        upsertRoleGrant(adminRoleId, "cpm-report", CpmConstants.ACTIONS_USAGE);
        upsertRoleGrant(adminRoleId, "cpm-team", CpmConstants.ACTIONS_VIEW_EDIT);
        upsertRoleGrant(adminRoleId, "cpm-template", CpmConstants.ACTIONS_VIEW_EDIT);
        upsertRoleGrant(adminRoleId, "cpm-rule", CpmConstants.ACTIONS_RULE);
    }

    /** 菜单授权与系统准入是两条独立线：缺 sys_role_system 时门户剪枝会整棵子树丢掉菜单 */
    private void deriveSystemAccess() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            return;
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                adminRoleId, SYSTEM_CODE);
    }

    private void verifyMenus() {
        for (String key : List.of("cpm-my", "cpm-report", "cpm-team", "cpm-template", "cpm-rule")) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND parent_id IS NULL",
                    Integer.class, key, SYSTEM_CODE);
            if (ok == null || ok == 0) {
                throw new IllegalStateException("CPM 菜單 " + key + " 未就緒（缺失/归属/启用态不符）");
            }
        }
    }

    /* ==================== 3. 内置岗位模板（只补不覆盖） ==================== */

    /** {template_key, 名称, 岗位提示, 词表 JSON, 工时开关}；词表与前端 cpmMock 内置模板逐字一致 */
    private static final String[][] TEMPLATES = {
            {"product", "產品經理", "需求與跨部門協作為主",
                    "[{\"key\":\"prd_review\",\"label\":\"需求評審\",\"hint\":\"如：評審了XX需求，結論…\"},"
                            + "{\"key\":\"solution\",\"label\":\"方案設計\",\"hint\":\"如：完成XX功能方案初稿\"},"
                            + "{\"key\":\"coordination\",\"label\":\"跨部門協調\",\"hint\":\"如：與研發確認XX排期\"},"
                            + "{\"key\":\"data_review\",\"label\":\"數據分析\",\"hint\":\"如：複盤XX週數據，UV…\"}]", "0"},
            {"dev", "研發工程師", "開發與交付節奏為主",
                    "[{\"key\":\"develop\",\"label\":\"開發\",\"hint\":\"如：完成XX接口，進度70%\"},"
                            + "{\"key\":\"integration\",\"label\":\"聯調\",\"hint\":\"如：與前端聯調XX頁面\"},"
                            + "{\"key\":\"bugfix\",\"label\":\"修復\",\"hint\":\"如：修復XX缺陷(#123)\"},"
                            + "{\"key\":\"tech_review\",\"label\":\"技術評審\",\"hint\":\"如：評審XX設計文檔\"},"
                            + "{\"key\":\"release\",\"label\":\"發布\",\"hint\":\"如：XX模塊上線驗證通過\"}]", "1"},
            {"qa", "測試工程師", "用例與缺陷追蹤為主",
                    "[{\"key\":\"case_design\",\"label\":\"用例設計\",\"hint\":\"如：設計XX模塊用例30條\"},"
                            + "{\"key\":\"test_exec\",\"label\":\"執行測試\",\"hint\":\"如：執行XX用例，發現3缺陷\"},"
                            + "{\"key\":\"defect_track\",\"label\":\"缺陷追蹤\",\"hint\":\"如：跟催XX阻塞缺陷\"},"
                            + "{\"key\":\"regression\",\"label\":\"回歸\",\"hint\":\"如：XX版本回歸通過\"}]", "1"},
            {"ops", "運營專員", "活動與內容節奏為主",
                    "[{\"key\":\"campaign\",\"label\":\"活動執行\",\"hint\":\"如：上線XX活動，首日UV…\"},"
                            + "{\"key\":\"content\",\"label\":\"內容製作\",\"hint\":\"如：產出XX素材5份\"},"
                            + "{\"key\":\"data_review\",\"label\":\"數據復盤\",\"hint\":\"如：復盤XX轉化率環比…\"},"
                            + "{\"key\":\"merchant\",\"label\":\"商家溝通\",\"hint\":\"如：對接XX商家選品\"}]", "0"},
            {"general", "通用", "任何崗位兜底",
                    "[{\"key\":\"routine\",\"label\":\"常規事務\",\"hint\":\"如：處理XX日常事務\"},"
                            + "{\"key\":\"project\",\"label\":\"項目協作\",\"hint\":\"如：參與XX項目週會\"},"
                            + "{\"key\":\"adhoc\",\"label\":\"臨時任務\",\"hint\":\"如：支援XX臨時需求\"},"
                            + "{\"key\":\"learning\",\"label\":\"學習成長\",\"hint\":\"如：學習XX課程/文檔\"}]", "0"},
    };

    private void doTemplateSeed() {
        for (String[] t : TEMPLATES) {
            // 只补不覆盖：管理员在模板管理里改过词表后，启动重放不得把他的调整打回去
            jdbcTemplate.update(
                    "INSERT INTO biz_cpm_template (template_key, name, role_hint, categories_json, "
                            + "work_hours_enabled, is_builtin, enabled, created_by, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, 1, 1, 'system', 'system') "
                            + "ON DUPLICATE KEY UPDATE template_key = template_key",
                    t[0], t[1], t[2], t[3], Integer.parseInt(t[4]));
        }
        log.info("CPM 內置崗位模板已補種: {} 套", TEMPLATES.length);
    }

    private void verifyTemplates() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_template WHERE is_builtin = 1 AND deleted = 0", Integer.class);
        if (count == null || count < TEMPLATES.length) {
            throw new IllegalStateException("內置模板未就绪：期望 " + TEMPLATES.length + " 套，实际 " + count);
        }
    }

    /* ==================== 4. 汇报规则单行 ==================== */

    private void doRuleSeed() {
        jdbcTemplate.update(
                "INSERT INTO biz_cpm_rule (rule_slot, enabled, period_types_json, deadline_day, deadline_time, "
                        + "remind_before_hours, receiver_manager, group_push, personal_push, created_by, updated_by) "
                        + "VALUES (?, 1, '[\"week\"]', 5, '18:00', 4, 1, 1, 1, 'system', 'system') "
                        + "ON DUPLICATE KEY UPDATE rule_slot = rule_slot",
                CpmConstants.RULE_SLOT_DEFAULT);
        log.info("CPM 匯報規則單行已補種");
    }

    private void verifyRule() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_rule WHERE rule_slot = ?", Integer.class,
                CpmConstants.RULE_SLOT_DEFAULT);
        if (count == null || count != 1) {
            throw new IllegalStateException("匯報規則單行未就緒（config_slot=default 必须恰好一行）");
        }
    }

    /* ==================== 通用工具（与 MeetingSchemaMigrationInitializer 同实现同守卫） ==================== */

    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表腳本 " + script + "，cpm 域表無法創建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取建表腳本失敗 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").replaceAll("(?m)^\\s*#.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    private boolean tableExists(String table) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return n != null && n > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }

    private boolean indexExists(String table, String indexName) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        return n != null && n > 0;
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    private Long queryAdminRoleId() {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, ADMIN_ROLE_CODE)
                .stream().findFirst().orElse(null);
    }

    /** 两步写（INSERT IGNORE + 补空 UPDATE）：MySQL 8 的 INSERT...SELECT + ON DUPLICATE 会报 1052 */
    private void upsertRoleGrant(Long roleId, String menuKey, String actions) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            throw new IllegalStateException("菜單落地後仍查不到 menu_key=" + menuKey);
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }
}
