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
 *   <li>{@code cpm:template-seed:v1.0}：内置 5 套岗位模板词表（INSERT 只补不覆 盖，管理员改过不顶）；</li>
 *   <li>{@code cpm:rule-seed:v1.0}：汇报规则单行（config_slot=default）；</li>
 *   <li>{@code cpm:schema:v1.1}：阶段三投入时段表 + 条目侧时间/回写列（337 脚本 + 逐列判定 ALTER）；</li>
 *   <li>{@code cpm:schema:v1.2}：阶段三状态与来源 CHECK 放宽（取值由 CpmConstants 拼，
 *       校验实查 CHECK_CLAUSE 而不是只验约束存在）；</li>
 *   <li>{@code cpm:report-revision:v1.0}：阶段三汇报正式版本表 + 版本指向列（338 脚本）。</li>
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
    /** 節假日配置菜单（v1.0 已落库，按不修改已应用迁移的规矩另开一位） */
    static final String VERSION_MENU_HOLIDAY = "cpm:menu:v1.1";
    static final String VERSION_TEMPLATE = "cpm:template-seed:v1.0";
    static final String VERSION_RULE = "cpm:rule-seed:v1.0";
    /* 阶段三：新增量一律另开键——已记录 v1.0 的环境不会回头重跑旧 task（沿用 meeting 域口径） */
    static final String VERSION_TIME_SCHEMA = "cpm:schema:v1.1";
    static final String VERSION_ENUM_EXPAND = "cpm:schema:v1.2";
    static final String VERSION_REVISION = "cpm:report-revision:v1.0";
    /** 台账底座：工作項分组 + 工时口径日历 + 条目侧排期/计划属性/备注列 */
    static final String VERSION_WORKLOG_SCHEMA = "cpm:schema:v1.3";
    /** 全局法定名单种子：没有它，每个员工都要自己重标一遍节假日，而工时是全局口径 */
    static final String VERSION_CALENDAR_SEED = "cpm:calendar-seed:v1.0";

    private static final String SCHEMA_SCRIPT = "336_cpm_core.sql";
    private static final String TIME_SCHEMA_SCRIPT = "337_cpm_time_schema.sql";
    private static final String REVISION_SCHEMA_SCRIPT = "338_cpm_report_revision.sql";
    private static final String WORKLOG_SCHEMA_SCRIPT = "344_cpm_worklog_ledger.sql";

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

    /** 阶段三新增：条目侧时间/回写列（实体按字段拼 SELECT，缺列=首次查询就报语法错） */
    private static final String[][] TIME_ITEM_COLUMNS = {
            {"biz_cpm_item", "first_start_at"},
            {"biz_cpm_item", "last_end_at"},
            {"biz_cpm_item", "work_hours_source"},
            {"biz_cpm_item", "rdm_task_id"},
            {"biz_cpm_item", "rdm_sync_enabled"},
            {"biz_cpm_item", "rdm_sync_state"},
            {"biz_cpm_item", "rdm_sync_message"},
            {"biz_cpm_item", "rdm_synced_at"},
            {"biz_cpm_item", "rdm_progress_seen"},
    };

    /** 阶段三新增：版本指向列 */
    private static final String[][] REVISION_COLUMNS = {
            {"biz_cpm_report", "published_revision_id"},
            {"biz_cpm_report", "draft_hash"},
            {"biz_cpm_push_record", "revision_id"},
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
        versionTracker.applyOnce(VERSION_MENU_HOLIDAY, this::doHolidayMenuMigrate, this::verifyHolidayMenu);
        versionTracker.applyOnce(VERSION_TEMPLATE, this::doTemplateSeed, this::verifyTemplates);
        versionTracker.applyOnce(VERSION_RULE, this::doRuleSeed, this::verifyRule);
        versionTracker.applyOnce(VERSION_TIME_SCHEMA, this::doTimeSchema, this::verifyTimeSchema);
        versionTracker.applyOnce(VERSION_ENUM_EXPAND, this::doEnumExpand, this::verifyEnumExpand);
        versionTracker.applyOnce(VERSION_REVISION, this::doRevisionSchema, this::verifyRevisionSchema);
        versionTracker.applyOnce(VERSION_WORKLOG_SCHEMA, this::doWorklogSchema, this::verifyWorklogSchema);
        versionTracker.applyOnce(VERSION_CALENDAR_SEED, this::doCalendarSeed, this::verifyCalendarSeed);
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
                "UPDATE sys_menu SET status = ? WHERE menu_key IN ('cpm-my','cpm-holiday','cpm-report','cpm-team','cpm-template','cpm-rule') "
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

    /**
     * cpm:menu:v1.1——新增「節假日配置」一级菜单。
     *
     * <p>v1.0 已在开发库/生产库落过，按「不修改已应用迁移」的铁律只增不改；
     * 单独开一个版本位，新鲜库与存量库走同一条路径。
     *
     * <p>为什么单独成菜单而不是 cpm-my 的子页：它改的是「工时怎么算」这条全局口径
     * （节假日/補班/調休/請假直接决定台账耗时与汇报数字），影响面超出工作記錄页，
     * 在菜单上看得见、也能在授权中心单独收回，比藏在页面按钮里更可控。
     * 图标 CalendarOutlined 在 cpm 系统内未占用（hr-leave、rdm 交付周报属其他系统）。
     */
    private void doHolidayMenuMigrate() {
        // 同 v1.0：menuKey/名称/路径/组件/图标必须逐条字面量，check-menu-consistency 只识别这种形态
        ensureMenu(null, "cpm-holiday", "節假日配置", "/cpm-holiday",
                "HolidayConfig", "CalendarOutlined", 6, CpmConstants.ACTIONS_VIEW_EDIT, "Holiday Calendar");
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId != null) {
            upsertRoleGrant(adminRoleId, "cpm-holiday", CpmConstants.ACTIONS_VIEW_EDIT);
        }
        permissionService.evictAll();
        log.info("持續績效菜單已補齊：節假日配置（cpm-holiday）");
    }

    private void verifyHolidayMenu() {
        Integer ok = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                        + "AND system_code = ? AND parent_id IS NULL",
                Integer.class, CpmConstants.MENU_HOLIDAY, SYSTEM_CODE);
        if (ok == null || ok == 0) {
            throw new IllegalStateException("CPM 菜單 " + CpmConstants.MENU_HOLIDAY + " 未就緒（缺失/归属/启用态不符）");
        }
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

    /* ==================== 阶段三 5. 投入时段表 + 条目时间/回写列 ==================== */

    /**
     * 时段表建表 + 条目补列。
     *
     * <p>补列走 {@link #addColumnIfAbsent} 而不是把 ALTER 写进脚本：MySQL 8 没有
     * {@code ADD COLUMN IF NOT EXISTS}，脚本重放会直接报错；而 applyOnce 只保证「本键跑一次」，
     * 半途失败重跑时必须逐列判定，否则一列已存在就让整步永远记不上版本。
     */
    private void doTimeSchema() {
        int executed = executeScript(TIME_SCHEMA_SCRIPT);
        log.info("持續績效投入時段建表腳本已執行: {} 條語句（{}）", executed, TIME_SCHEMA_SCRIPT);
        // 条目侧全部可空/有默认：旧代码不读这些列，回滚只需回代码，不必回结构
        addColumnIfAbsent("biz_cpm_item", "first_start_at",
                "ALTER TABLE biz_cpm_item ADD COLUMN first_start_at DATETIME NULL COMMENT '首次開工時點（時段回算，不是手填）'");
        addColumnIfAbsent("biz_cpm_item", "last_end_at",
                "ALTER TABLE biz_cpm_item ADD COLUMN last_end_at DATETIME NULL COMMENT '最近收工時點（時段回算）'");
        addColumnIfAbsent("biz_cpm_item", "work_hours_source",
                "ALTER TABLE biz_cpm_item ADD COLUMN work_hours_source VARCHAR(8) NOT NULL DEFAULT 'manual' "
                        + "COMMENT '工時來源：segment=時段回算 manual=手工快填；兩者精度不同，匯總必須分列'");
        addColumnIfAbsent("biz_cpm_item", "rdm_task_id",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_task_id BIGINT NULL COMMENT '進度回寫目標 rdm_work_task.id；需求級關聯為 NULL'");
        addColumnIfAbsent("biz_cpm_item", "rdm_sync_enabled",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_sync_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '1=允許把本條目進度回寫 RDM（導入任務時默認置 1）'");
        addColumnIfAbsent("biz_cpm_item", "rdm_sync_state",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_sync_state VARCHAR(16) NULL COMMENT '回寫結果：pending/success/conflict/rejected/error'");
        addColumnIfAbsent("biz_cpm_item", "rdm_sync_message",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_sync_message VARCHAR(200) NULL COMMENT '回寫結果說明（RDM 原文案，供界面如實回顯）'");
        addColumnIfAbsent("biz_cpm_item", "rdm_synced_at",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_synced_at DATETIME NULL COMMENT '最近一次回寫時間'");
        addColumnIfAbsent("biz_cpm_item", "rdm_progress_seen",
                "ALTER TABLE biz_cpm_item ADD COLUMN rdm_progress_seen INT NULL COMMENT '上次已知的 RDM 進度，回寫時作 expectedProgress 用；缺它就只能靜默覆蓋他人交付真值'");
    }

    private void verifyTimeSchema() {
        if (!tableExists("biz_cpm_time_entry")) {
            throw new IllegalStateException("biz_cpm_time_entry 表未就緒，投入时段无处落库");
        }
        for (String[] col : TIME_ITEM_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1] + " 列缺失，时段回算与回写状态无处落值");
            }
        }
        // 增强 for 的右侧必须是表达式，裸数组初始化器不合法（javadoc 里那条语法限制同此）
        String[] timeConstraints = {"fk_cpm_time_item", "ck_cpm_time_duration", "ck_cpm_time_range"};
        for (String constraint : timeConstraints) {
            if (!constraintExists("biz_cpm_time_entry", constraint)) {
                throw new IllegalStateException("biz_cpm_time_entry 缺少約束 " + constraint
                        + "，跨夜/超 24 小時的脏时段会被原样写入统计");
            }
        }
        if (!indexExists("biz_cpm_time_entry", "idx_cpm_time_user_date")) {
            throw new IllegalStateException("biz_cpm_time_entry 缺少 idx_cpm_time_user_date，工时汇总会按人全表扫");
        }
    }

    /* ==================== 阶段三 6. 状态与来源 CHECK 放宽 ==================== */

    /**
     * 放宽三条 CHECK 的取值集合（阶段三新增 cancelled/deferred 两个状态与 rdm_task 一种来源）。
     *
     * <p>为什么不能只在 Java 白名单里加值、不动 DDL：存量环境的 CHECK 仍是旧四项，
     * 界面点得出来、写库却报「數據庫操作異常」——白名单与约束必须同时放宽，且约束取值
     * 一律由 {@link CpmConstants} 拼出，不在这里手写第二份字面量。
     *
     * <p>MySQL 8 没有 {@code DROP CHECK IF EXISTS}，所以先查存在再丢；脚本副本只作参考文档。
     */
    private void doEnumExpand() {
        widenStatusCheck("biz_cpm_item", "ck_cpm_item_status", "status");
        widenStatusCheck("biz_cpm_item_update", "ck_cpm_update_status", "status");
        if (checkConstraintExists("biz_cpm_item", "ck_cpm_item_source")) {
            jdbcTemplate.execute("ALTER TABLE biz_cpm_item DROP CHECK ck_cpm_item_source");
        }
        jdbcTemplate.execute("ALTER TABLE biz_cpm_item ADD CONSTRAINT ck_cpm_item_source CHECK (source_type IN ("
                + quotedList(CpmConstants.SOURCE_TYPES) + "))");
    }

    private void widenStatusCheck(String table, String constraint, String column) {
        if (checkConstraintExists(table, constraint)) {
            jdbcTemplate.execute("ALTER TABLE " + table + " DROP CHECK " + constraint);
        }
        jdbcTemplate.execute("ALTER TABLE " + table + " ADD CONSTRAINT " + constraint
                + " CHECK (" + column + " IN (" + quotedList(CpmConstants.ITEM_STATUSES) + "))");
    }

    /**
     * 校验必须实查 CHECK_CLAUSE，而不是「约束存在」。
     *
     * <p>本步改的是取值集合：约束在但仍是旧四项时，新状态提交照样被数据库打回，
     * 却会被记成「已迁移」——比没记更危险（同 meeting:schema:v1.2 的复盘）。
     */
    private void verifyEnumExpand() {
        for (String[] target : new String[][]{
                {"biz_cpm_item", "ck_cpm_item_status"}, {"biz_cpm_item_update", "ck_cpm_update_status"}}) {
            String clause = checkClauseOf(target[0], target[1]);
            for (String status : CpmConstants.ITEM_STATUSES) {
                if (!clause.contains("'" + status + "'")) {
                    throw new IllegalStateException(target[0] + " 的 " + target[1]
                            + " 仍未包含 " + status + "，该状态写库会被 CHECK 打回");
                }
            }
        }
        String sourceClause = checkClauseOf("biz_cpm_item", "ck_cpm_item_source");
        for (String source : CpmConstants.SOURCE_TYPES) {
            if (!sourceClause.contains("'" + source + "'")) {
                throw new IllegalStateException("ck_cpm_item_source 仍未包含 " + source + "，该来源导入会直接失败");
            }
        }
    }

    /* ==================== 阶段三 7. 汇报正式版本 ==================== */

    /**
     * 版本表建表 + 汇报/推送记录补列 + 复合外键。
     *
     * <p>「当前生效哪一版」由 {@code biz_cpm_report.published_revision_id} 单点指向，
     * 因此版本表自身不设软删列——软删一个版本等于毁取证链。
     */
    private void doRevisionSchema() {
        int executed = executeScript(REVISION_SCHEMA_SCRIPT);
        log.info("持續績效匯報版本建表腳本已執行: {} 條語句（{}）", executed, REVISION_SCHEMA_SCRIPT);
        addColumnIfAbsent("biz_cpm_report", "published_revision_id",
                "ALTER TABLE biz_cpm_report ADD COLUMN published_revision_id BIGINT NULL COMMENT '當前正式版本，NULL=階段二遺留的舊發布（無版本行）'");
        addColumnIfAbsent("biz_cpm_report", "draft_hash",
                "ALTER TABLE biz_cpm_report ADD COLUMN draft_hash CHAR(64) NULL COMMENT '當前工作草稿與快照的內容摘要，用於判定是否存在未發布變更'");
        addColumnIfAbsent("biz_cpm_push_record", "revision_id",
                "ALTER TABLE biz_cpm_push_record ADD COLUMN revision_id BIGINT NULL COMMENT '本次通知綁定的正式版本；歷史連結指向當時那一版'");
        // 复合 FK 只在两列都在位后才能建；缺列时建约束会直接失败，宁可不建也不要吞异常
        if (columnExists("biz_cpm_report", "published_revision_id")
                && !constraintExists("biz_cpm_report", "fk_cpm_report_revision")) {
            jdbcTemplate.execute("ALTER TABLE biz_cpm_report ADD CONSTRAINT fk_cpm_report_revision "
                    + "FOREIGN KEY (id, published_revision_id) REFERENCES biz_cpm_report_revision (report_id, id)");
        }
        if (columnExists("biz_cpm_push_record", "revision_id")
                && !constraintExists("biz_cpm_push_record", "fk_cpm_push_revision")) {
            // 推送记录只有 ref_id（汇报 id 或认定 id），没有 report_id 列：
            // 复合外键 (report_id, revision_id) 在这个表上根本不存在左列，MySQL 直接报
            // "Key column 'report_id' doesn't exist in table"。版本行自身已由
            // fk_cpm_revision_report 钉住所属汇报，这里只需保证 revision_id 指向真实版本。
            jdbcTemplate.execute("ALTER TABLE biz_cpm_push_record ADD CONSTRAINT fk_cpm_push_revision "
                    + "FOREIGN KEY (revision_id) REFERENCES biz_cpm_report_revision (id)");
        }
    }

    private void verifyRevisionSchema() {
        if (!tableExists("biz_cpm_report_revision")) {
            throw new IllegalStateException("biz_cpm_report_revision 表未就緒，修訂重發布無處落版本");
        }
        for (String[] key : new String[][]{
                {"biz_cpm_report_revision", "uk_cpm_revision_no"},
                {"biz_cpm_report_revision", "uk_cpm_revision_request"},
                {"biz_cpm_report_revision", "uk_cpm_revision_owner"}}) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下会长出重复版本号或重复幂等键");
            }
        }
        for (String[] col : REVISION_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1] + " 列缺失，当前版本指向与通知绑定无处落值");
            }
        }
        if (!constraintExists("biz_cpm_report_revision", "fk_cpm_revision_report")) {
            throw new IllegalStateException("版本表缺 fk_cpm_revision_report，孤儿版本会让历史页读出已删汇报的内容");
        }
        // 两处指向版本行的外键是「通知绑定当时那一版」这条口径的数据库级保证：
        // 缺了它们，代码里的一个笔误就能让历史通知跳到新版本上，而接口一切正常。
        if (!constraintExists("biz_cpm_report", "fk_cpm_report_revision")) {
            throw new IllegalStateException("biz_cpm_report 缺 fk_cpm_report_revision，当前版本指针可以指向别的汇报");
        }
        if (!constraintExists("biz_cpm_push_record", "fk_cpm_push_revision")) {
            throw new IllegalStateException("biz_cpm_push_record 缺 fk_cpm_push_revision，通知能绑定到不存在的版本");
        }
    }

    /* ==================== 台账 8. 工作項分组 + 工时口径日历 ==================== */

    /** 台账给条目补的列（全部可空或有默认）：旧代码不读这些列，回滚只需回代码不必回结构 */
    private static final String[][] WORKLOG_ITEM_COLUMNS = {
            {"biz_cpm_item", "group_id"},
            {"biz_cpm_item", "plan_start"},
            {"biz_cpm_item", "plan_end"},
            {"biz_cpm_item", "plan_type"},
            {"biz_cpm_item", "inserted_at"},
            {"biz_cpm_item", "note_html"},
            {"biz_cpm_item", "note_text"},
    };

    /**
     * 全局法定名单种子（user_id=0）。
     *
     * <p>为什么由系统铺而不是让用户自己标：工时是全局口径，法定假日对所有人一致。
     * 不铺的话每个新员工入职都要把当年节假日重标一遍，漏标的人周报数字就是错的。
     *
     * <p>用 INSERT IGNORE 而不是先查后插：{@code uk_cpm_calendar_day} 已经把
     * 「同人同日」锁住，重复启动只会被唯一键挡回，不会盖掉运维后来改过的名单。
     */
    private static final String[] SEED_HOLIDAYS_2026 = {
            "2026-01-01", "2026-01-02", "2026-01-03",
            "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
            "2026-02-20", "2026-02-21", "2026-02-22",
            "2026-04-04", "2026-04-05", "2026-04-06",
            "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
            "2026-06-19", "2026-06-20", "2026-06-21",
            "2026-09-25", "2026-09-26", "2026-09-27",
            "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
            "2026-10-05", "2026-10-06", "2026-10-07",
    };

    /** 调休上班的周末（全局）：只有这一类计入工时 */
    private static final String[] SEED_MAKEUPS_2026 = {"2026-02-14", "2026-02-28", "2026-10-10"};

    private void doWorklogSchema() {
        int executed = executeScript(WORKLOG_SCHEMA_SCRIPT);
        log.info("持續績效台账建表脚本已执行: {} 条语句（{}）", executed, WORKLOG_SCHEMA_SCRIPT);
        addColumnIfAbsent("biz_cpm_item", "group_id",
                "ALTER TABLE biz_cpm_item ADD COLUMN group_id BIGINT NULL COMMENT '所属工作項 biz_cpm_worklog_group.id；NULL=未分组（旧日报流水）'");
        addColumnIfAbsent("biz_cpm_item", "plan_start",
                "ALTER TABLE biz_cpm_item ADD COLUMN plan_start DATE NULL COMMENT '计划起日（甘特条左端）；与时段回算的 first_start_at 是两种语义'");
        addColumnIfAbsent("biz_cpm_item", "plan_end",
                "ALTER TABLE biz_cpm_item ADD COLUMN plan_end DATE NULL COMMENT '计划止日（甘特条右端）'");
        addColumnIfAbsent("biz_cpm_item", "plan_type",
                "ALTER TABLE biz_cpm_item ADD COLUMN plan_type VARCHAR(16) NOT NULL DEFAULT 'planned' COMMENT 'planned=原计划 inserted=临时插入（周会要单独能念出来）'");
        addColumnIfAbsent("biz_cpm_item", "inserted_at",
                "ALTER TABLE biz_cpm_item ADD COLUMN inserted_at DATE NULL COMMENT '标记为临时插入的日期；原计划为 NULL'");
        addColumnIfAbsent("biz_cpm_item", "note_html",
                "ALTER TABLE biz_cpm_item ADD COLUMN note_html TEXT NULL COMMENT '备注富文本（服务端白名单净化后入库）'");
        addColumnIfAbsent("biz_cpm_item", "note_text",
                "ALTER TABLE biz_cpm_item ADD COLUMN note_text VARCHAR(2000) NULL COMMENT '备注纯文本降级：搜索/导出/推送用它，保证导出文本=页面文本'");
        // 外键只在列就位后加：先有列再有约束，否则存量库的 ALTER 会因列不存在而半途中断
        if (!constraintExists("biz_cpm_item", "fk_cpm_item_group")) {
            jdbcTemplate.execute("ALTER TABLE biz_cpm_item ADD CONSTRAINT fk_cpm_item_group "
                    + "FOREIGN KEY (group_id) REFERENCES biz_cpm_worklog_group (id)");
        }
        if (!constraintExists("biz_cpm_item", "ck_cpm_item_plan_type")) {
            jdbcTemplate.execute("ALTER TABLE biz_cpm_item ADD CONSTRAINT ck_cpm_item_plan_type "
                    + "CHECK (plan_type IN (" + quotedList(CpmConstants.PLAN_TYPES) + "))");
        }
        if (!constraintExists("biz_cpm_item", "ck_cpm_item_plan_range")) {
            jdbcTemplate.execute("ALTER TABLE biz_cpm_item ADD CONSTRAINT ck_cpm_item_plan_range "
                    + "CHECK (plan_start IS NULL OR plan_end IS NULL OR plan_end >= plan_start)");
        }
    }

    private void verifyWorklogSchema() {
        for (String table : new String[] {"biz_cpm_worklog_group", "biz_cpm_work_calendar"}) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就绪，工作台账无处落库");
            }
        }
        // 两条唯一键是并发正确性的全部依靠：缺一条就会长出同名工作項或同日双份口径
        for (String[] key : new String[][] {
                {"biz_cpm_worklog_group", "uk_cpm_group_title"},
                {"biz_cpm_work_calendar", "uk_cpm_calendar_day"},
        }) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，重复导入会让同一工作項/同一天口径长出两行");
            }
        }
        for (String[] col : WORKLOG_ITEM_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1] + " 列缺失，台账排期与计划属性无处落值");
            }
        }
    }

    private void doCalendarSeed() {
        int inserted = 0;
        for (String date : SEED_HOLIDAYS_2026) {
            inserted += jdbcTemplate.update("INSERT IGNORE INTO biz_cpm_work_calendar "
                    + "(user_id, work_date, day_type, created_by, updated_by, deleted) "
                    + "VALUES (0, ?, 'holiday', 'system', 'system', 0)", date);
        }
        for (String date : SEED_MAKEUPS_2026) {
            inserted += jdbcTemplate.update("INSERT IGNORE INTO biz_cpm_work_calendar "
                    + "(user_id, work_date, day_type, created_by, updated_by, deleted) "
                    + "VALUES (0, ?, 'makeup', 'system', 'system', 0)", date);
        }
        log.info("全局工时口径日历已种子化: 本次写入 {} 行（节假日 {} / 補班 {}）",
                inserted, SEED_HOLIDAYS_2026.length, SEED_MAKEUPS_2026.length);
    }

    private void verifyCalendarSeed() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_work_calendar WHERE deleted = 0 AND user_id = 0", Integer.class);
        if (n == null || n < SEED_HOLIDAYS_2026.length) {
            throw new IllegalStateException("全局法定名单未种子就位（当前 " + n + " 行），"
                    + "否则每个人的节假日都要自己重标，周报工时会各算一套");
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

    /**
     * 补列（MySQL 8 无 {@code ADD COLUMN IF NOT EXISTS}，必须先查再改）。
     *
     * <p>失败一律抛出，不 catch：吞掉异常会让 applyOnce 误记成功版本，下次启动不再重试，
     * 于是「生产库缺列」这种事故可以长期隐身（金字招牌Initializer 的历史教训）。
     */
    private void addColumnIfAbsent(String table, String column, String ddl) {
        if (columnExists(table, column)) {
            return;
        }
        jdbcTemplate.execute(ddl);
        log.info("cpm 迁移补列完成: {}.{}", table, column);
    }

    /** 约束（含 CHECK / FK）是否已存在且处于强制状态。 */
    private boolean constraintExists(String table, String constraintName) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? "
                        + "AND CONSTRAINT_NAME = ? AND ENFORCED = 'YES'",
                Integer.class, table, constraintName);
        return n != null && n > 0;
    }

    /**
     * CHECK 约束存在性判定（不表名版本：MySQL 8 的 CHECK_CONSTRAINTS 没有 TABLE_NAME 列，
     * 拿表名去筛它会报 Unknown column 并让整步迁移失败——开发库实测，同 meeting 域口径）。
     */
    private boolean checkConstraintExists(String table, String constraintName) {
        return constraintExists(table, constraintName);
    }

    /**
     * 取 CHECK 的实际谓词文本，用于证明「取值集合真的放宽了」。
     *
     * <p>两个必须照抄 meeting 域实测结论的细节，否则会把已放宽的约束误判成未放宽：
     * ① MySQL 8 回传的 CHECK_CLAUSE 会给字面量加字符集引入符并转义引号
     *    （实测 {@code _utf8mb4\'todo\'}），比对前先去掉反斜杠；
     * ② 表名要从 TABLE_CONSTRAINTS 关联取——CHECK_CONSTRAINTS 没有 TABLE_NAME 列，
     *    而约束名在同一 schema 内不保证全局唯一，只按约束名查会读到别的表的同名约束。
     */
    private String checkClauseOf(String table, String constraintName) {
        List<String> clauses = jdbcTemplate.queryForList(
                "SELECT cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc "
                        + "JOIN information_schema.TABLE_CONSTRAINTS tc "
                        + "  ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME "
                        + "WHERE cc.CONSTRAINT_SCHEMA = DATABASE() AND cc.CONSTRAINT_NAME = ? "
                        + "AND tc.TABLE_NAME = ? AND tc.ENFORCED = 'YES'",
                String.class, constraintName, table);
        if (clauses.isEmpty()) {
            throw new IllegalStateException("約束 " + table + "." + constraintName + " 未强制存在，無法校驗其取值集合");
        }
        return clauses.get(0).replace("\\", "");
    }

    /** 排序集合 → SQL IN 列表字面量（取值来自 CpmConstants，DDL 与校验同一真源） */
    private static String quotedList(java.util.Collection<String> values) {
        StringBuilder sb = new StringBuilder();
        for (String value : values) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append('\'').append(value).append('\'');
        }
        return sb.toString();
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
