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
import java.util.stream.Collectors;

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
    static final String V_AI_MENU_OWNERSHIP = "core:ai-menu-system-ownership-v1.0";
    static final String V_SELLER_REPORTS = "core:seller-promotion-reports-v1.0";
    static final String V_SELLER_WORKBENCH = "core:seller-workbench-menu-v1.0";
    static final String V_TRANSLATION_SYSTEM = "core:translation-system-v1.0";
    private static final String SELLER_SYSTEM = "seller";
    private static final String TRANSLATION_SYSTEM = "i18n";
    private static final List<String> PROMOTION_REPORT_KEYS = List.of(
            "promotion-report-overview", "promotion-report-order", "promotion-report-compare");
    private static final String MISSING_AI_DESCENDANTS =
            "SELECT c.id FROM sys_menu c JOIN sys_menu p ON c.parent_id = p.id "
                    + "WHERE (c.system_code IS NULL OR c.system_code = '') AND p.system_code = ? "
                    + "AND c.deleted = 0 AND p.deleted = 0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
        // 展示元数据（名称/英文/简介/图标/排序）以代码种子为准，每次启动幂等刷新，
        // 使重命名等调整无需新增迁移即可对已初始化库生效；仅更新展示字段，
        // 不触碰 status/deleted 及系统准入关系。
        seedSystems();
        reconcileAiMenuOwnership();
        ensureSellerWorkbench();
        reconcileSellerReports();
        reconcileTranslationSystem();
    }

    /**
     * 翻译中心独立系统迁移：前端门户已展示「翻譯中心」卡片（code=i18n），但后端
     * i18n-center 菜单树历史上随 v1.0 一次性回填挂在 platform 下，导致授权中心系统列表
     * 与门户卡片对不上、非超管无法按翻译中心授权。本任务把 i18n-center 整棵子树的
     * system_code 定向改写为 i18n（覆盖旧值 platform），并按菜单授权反推角色/部门准入。
     * sys_system 的 i18n 行由每次启动的 seedSystems 幂等保证。任务条件化写入天然幂等，
     * 版本已应用时每次启动仍重放自愈。
     */
    void reconcileTranslationSystem() {
        if (!versionTracker.applyOnce(V_TRANSLATION_SYSTEM, this::doReconcileTranslationSystem, this::verifyTranslationSystem)) {
            doReconcileTranslationSystem();
        }
    }

    private void doReconcileTranslationSystem() {
        Long rootId = queryMenuIdByKey("i18n-center");
        if (rootId == null) {
            throw new IllegalStateException("i18n-center 顶级菜单不存在，菜单种子未就绪");
        }
        forceSubtreeSystem(rootId, TRANSLATION_SYSTEM);
        deriveSystemAccessFromMenuGrants(TRANSLATION_SYSTEM);
    }

    /** 按「持有该系统菜单授权」反推补授系统准入（角色/部门），INSERT IGNORE 幂等；admin 角色由代码直通无需登记。 */
    private void deriveSystemAccessFromMenuGrants(String systemCode) {
        int roles = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, ? FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = ? "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1 "
                        + "WHERE r.code <> 'admin'",
                systemCode, systemCode);
        int depts = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, ? FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = ?",
                systemCode, systemCode);
        if (roles > 0 || depts > 0) {
            log.info("{} 系统准入反推补授: roles+={} depts+={}", systemCode, roles, depts);
        }
    }

    private void verifyTranslationSystem() {
        Long rootId = queryMenuIdByKey("i18n-center");
        if (rootId == null) {
            throw new IllegalStateException("i18n-center 顶级菜单不存在");
        }
        // 按树遍历校验（不按 key 前缀猜），未来新增子菜单由自愈覆盖而非卡死启动
        List<Long> frontier = List.of(rootId);
        for (int depth = 0; depth < 6 && !frontier.isEmpty(); depth++) {
            String inClause = frontier.stream().map(String::valueOf).collect(Collectors.joining(","));
            Integer wrong = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE id IN (" + inClause + ") AND deleted = 0 "
                            + "AND (system_code IS NULL OR system_code <> ?)",
                    Integer.class, TRANSLATION_SYSTEM);
            if (wrong != null && wrong > 0) {
                throw new IllegalStateException("翻译中心菜单树存在未归属 i18n 的节点: " + wrong + " 条");
            }
            frontier = jdbcTemplate.queryForList(
                    "SELECT id FROM sys_menu WHERE deleted = 0 AND parent_id IN (" + inClause + ")", Long.class);
        }
    }

    /**
     * 商家工作台拆分的后端缺口：seller 顶级菜单 + 店铺随心推购买入口迁入 + 准入派生。
     * <p>sys_system 的 seller 行由每次启动的 {@link #seedSystems()} 幂等保证；报表层级
     * 归位与广告系统空目录停用由 {@link #reconcileSellerReports()} 完成。本任务只补
     * 此前缺失的一步——导致 seller-promotion-reports 迁移在生产永远「延后」的根因。
     * 任务全部条件化写入（幂等），版本已应用时每次启动仍重放自愈。
     */
    void ensureSellerWorkbench() {
        if (!versionTracker.applyOnce(V_SELLER_WORKBENCH, this::doEnsureSellerWorkbench, this::verifySellerWorkbench)) {
            doEnsureSellerWorkbench();
        }
    }

    private void doEnsureSellerWorkbench() {
        Long sellerCenterId = queryMenuIdByKey("seller-center");
        if (sellerCenterId == null) {
            // 软删残留会撞 uk_menu_key 全局唯一索引（v44 生产事故模式），先物理清理
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 1");
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, icon, type, sort_order, actions, system_code, status, deleted, updated_by) "
                            + "VALUES (NULL, 'seller-center', '商家工作台', 'Merchant Workbench', '', 'ShopOutlined', 1, 15, '[\"view\"]', ?, 1, 0, 'system')",
                    SELLER_SYSTEM);
            sellerCenterId = queryMenuIdByKey("seller-center");
            if (sellerCenterId == null) {
                throw new IllegalStateException("seller-center 菜单写入后回读缺失");
            }
            log.info("已创建商家工作台顶级菜单 seller-center (system_code={})", SELLER_SYSTEM);
        } else {
            // 归属/结构字段定向纠正，不覆盖用户自定义名称
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = NULL, type = 1, system_code = ?, icon = COALESCE(NULLIF(icon, ''), 'ShopOutlined') "
                            + "WHERE id = ? AND deleted = 0",
                    SELLER_SYSTEM, sellerCenterId);
        }

        // 购买入口与报表分析组迁入（条件化：种子重跑在 seller-center 存在时本来就会挂对父级）；
        // 报表叶子层级由随后的 reconcileSellerReports 归位到组下，此处刷其系统归属
        for (String migratedKey : new String[]{"promotion-sales-config", "promotion-report-group"}) {
            Long migratedId = queryMenuIdByKey(migratedKey);
            if (migratedId == null) {
                throw new IllegalStateException("随心推菜单 " + migratedKey + " 不存在，菜单种子未就绪");
            }
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, updated_by = 'system' "
                            + "WHERE id = ? AND deleted = 0 AND (parent_id IS NULL OR parent_id <> ? OR system_code IS NULL OR system_code <> ?)",
                    sellerCenterId, SELLER_SYSTEM, migratedId, sellerCenterId, SELLER_SYSTEM);
            forceSubtreeSystem(migratedId, SELLER_SYSTEM);
        }

        // 准入派生：持有商家工作台子树菜单授权的角色/部门补授 seller，拆分不断权
        deriveSystemAccessFromMenuGrants(SELLER_SYSTEM);
        Long adminRoleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId != null) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                    adminRoleId, sellerCenterId, "[\"view\"]");
        }
    }

    /**
     * 子树 system_code 强制跟随（覆盖显式旧值——拆分就是要改归属）。
     * 迭代按父链扩散，初始父仅为被迁根菜单，天然限定在子树内；MySQL 不允许在
     * UPDATE 目标表子查询中引用自身，故逐层执行（与 propagateSystemToDescendants 同法）。
     */
    private void forceSubtreeSystem(Long rootId, String systemCode) {
        List<Long> frontier = List.of(rootId);
        for (int depth = 0; depth < 6 && !frontier.isEmpty(); depth++) {
            String inClause = frontier.stream().map(String::valueOf).collect(Collectors.joining(","));
            jdbcTemplate.update(
                    "UPDATE sys_menu SET system_code = ?, updated_by = 'system' "
                            + "WHERE id IN (" + inClause + ") AND deleted = 0 AND (system_code IS NULL OR system_code <> ?)",
                    systemCode, systemCode);
            frontier = jdbcTemplate.queryForList(
                    "SELECT id FROM sys_menu WHERE deleted = 0 AND parent_id IN (" + inClause + ")", Long.class);
        }
    }

    private void verifySellerWorkbench() {
        Integer ok = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 0 AND status = 1 "
                        + "AND parent_id IS NULL AND type = 1 AND system_code = ?",
                Integer.class, SELLER_SYSTEM);
        if (ok == null || ok != 1) {
            throw new IllegalStateException("seller-center 顶级目录未就绪");
        }
        Integer purchase = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'promotion-sales-config' AND deleted = 0 AND system_code = ? "
                        + "AND parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 0) t)",
                Integer.class, SELLER_SYSTEM);
        if (purchase == null || purchase != 1) {
            throw new IllegalStateException("店铺随心推购买入口未迁入商家工作台");
        }
    }

    private Long queryMenuIdByKey(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    /** 延续已完成的商家工作台拆分，只迁移报表，不创建系统或重新推导准入授权。 */
    void reconcileSellerReports() {
        Integer systems = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_system WHERE code = ? AND deleted = 0", Integer.class, SELLER_SYSTEM);
        if (systems == null || systems == 0) {
            log.info("商家工作台尚未配置，延后迁移推广报表");
            return;
        }
        if (!versionTracker.applyOnce(V_SELLER_REPORTS, this::moveSellerReports, this::verifySellerReports)) {
            moveSellerReports();
            verifySellerReports();
        }
    }

    private Long requireMenuId(String key, String owner) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND system_code = ? AND deleted = 0",
                Long.class, key, owner);
        if (ids.size() != 1) throw new IllegalStateException("菜单未就绪或系统归属不符：" + key);
        return ids.get(0);
    }

    private void moveSellerReports() {
        log.info("开始迁移店铺随心推报表至商家工作台");
        Long sellerId = requireMenuId("seller-center", SELLER_SYSTEM);
        Long purchaseId = requireMenuId("promotion-sales-config", SELLER_SYSTEM);
        Long purchaseParent = jdbcTemplate.queryForObject(
                "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, purchaseId);
        if (!sellerId.equals(purchaseParent)) {
            throw new IllegalStateException("店铺随心推购买入口尚未迁入商家工作台，报表迁移中止");
        }
        jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = ?, system_code = ?, updated_by = 'system' "
                        + "WHERE menu_key = 'promotion-report-group' AND deleted = 0 "
                        + "AND (parent_id IS NULL OR parent_id <> ? OR system_code IS NULL OR system_code <> ?)",
                sellerId, SELLER_SYSTEM, sellerId, SELLER_SYSTEM);
        Long reportId = requireMenuId("promotion-report-group", SELLER_SYSTEM);
        for (String key : PROMOTION_REPORT_KEYS) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, updated_by = 'system' "
                            + "WHERE menu_key = ? AND deleted = 0 "
                            + "AND (parent_id IS NULL OR parent_id <> ? OR system_code IS NULL OR system_code <> ?)",
                    reportId, SELLER_SYSTEM, key, reportId, SELLER_SYSTEM);
        }
        List<Long> oldRoots = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = 'promotion_tool' AND system_code = 'ads' AND deleted = 0",
                Long.class);
        for (Long id : oldRoots) {
            Integer remaining = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE parent_id = ? AND deleted = 0 AND status = 1", Integer.class, id);
            if (remaining != null && remaining > 0) {
                throw new IllegalStateException("广告系统店铺随心推仍有未迁移菜单，不能停用目录");
            }
            jdbcTemplate.update("UPDATE sys_menu SET status = 0, updated_by = 'system' WHERE id = ? AND status <> 0", id);
        }
        log.info("店铺随心推报表迁移完成，保留购买入口、菜单 ID 及既有授权");
    }

    private void verifySellerReports() {
        Long sellerId = requireMenuId("seller-center", SELLER_SYSTEM);
        Long reportId = requireMenuId("promotion-report-group", SELLER_SYSTEM);
        if (!sellerId.equals(jdbcTemplate.queryForObject(
                "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, reportId))) {
            throw new IllegalStateException("报表分析未挂载至商家工作台");
        }
        for (String key : PROMOTION_REPORT_KEYS) {
            Long id = requireMenuId(key, SELLER_SYSTEM);
            if (!reportId.equals(jdbcTemplate.queryForObject(
                    "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, id))) {
                throw new IllegalStateException("推广报表层级未就绪：" + key);
            }
        }
        Integer remaining = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'promotion_tool' "
                        + "AND system_code = 'ads' AND deleted = 0 AND status = 1", Integer.class);
        if (remaining == null || remaining > 0) throw new IllegalStateException("广告系统仍存在店铺随心推入口");
    }

    /** 仅修补菜单归属；不得重跑系统准入推导，以免恢复已撤销的授权。 */
    void reconcileAiMenuOwnership() {
        if (!versionTracker.applyOnce(V_AI_MENU_OWNERSHIP,
                this::repairAiMenuOwnership, this::verifyAiMenuOwnership)) {
            repairAiMenuOwnership();
            verifyAiMenuOwnership();
        }
    }

    private void repairAiMenuOwnership() {
        log.info("开始修复 AI 菜单缺失的系统归属");
        String systemCode = SystemCode.AI.code();
        int affected = jdbcTemplate.update(
                "UPDATE sys_menu SET system_code = ? WHERE menu_key = 'ai-assistant' "
                        + "AND parent_id IS NULL AND deleted = 0 AND (system_code IS NULL OR system_code = '')",
                systemCode);
        // 逐层继承，仅填空值；显式属于其他系统的分支与已删除菜单均保持不变。
        for (int depth = 0; depth < 6; depth++) {
            List<Long> ids = jdbcTemplate.queryForList(MISSING_AI_DESCENDANTS, Long.class, systemCode);
            if (ids.isEmpty()) break;
            for (Long id : ids) {
                affected += jdbcTemplate.update(
                        "UPDATE sys_menu SET system_code = ? WHERE id = ? AND deleted = 0 "
                                + "AND (system_code IS NULL OR system_code = '')",
                        systemCode, id);
            }
        }
        log.info("AI 菜单系统归属修复完成：{} 条；未变更菜单 ID、状态与授权", affected);
    }

    private void verifyAiMenuOwnership() {
        Integer roots = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'ai-assistant' "
                        + "AND parent_id IS NULL AND deleted = 0 AND system_code = ?",
                Integer.class, SystemCode.AI.code());
        if (roots == null || roots != 1
                || !jdbcTemplate.queryForList(MISSING_AI_DESCENDANTS, Long.class, SystemCode.AI.code()).isEmpty()) {
            throw new IllegalStateException("AI 菜单系统归属未就绪，请检查根目录及后代归属");
        }
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

    /** 种子 12 个业务系统；portal 是哨兵值不落库。每次启动幂等刷新展示元数据。 */
    private void seedSystems() {
        Object[][] rows = {
                {SystemCode.ADS.code(),      "廣告推薦系統", "Ads & Recommendation", "广告销售、商家推广、团购秒杀（店铺随心推已迁至商家工作台）", "AimOutlined",               10},
                {SystemCode.MERCHANT.code(), "商戶運營系統",   "Merchant Ops",      "商户集团、门店、门店数据、地图规划",         "ShopOutlined",              20},
                {SystemCode.SELLER.code(),   "商家工作台",   "Merchant Workbench", "店铺随心推购买与推广报表，商家侧一站式工作空间", "ShopOutlined",            25},
                {SystemCode.SEARCH.code(),   "搜索運營系統",   "Search Ops",        "搜索词库、引导、策略、校验、报表",           "SearchOutlined",            30},
                {SystemCode.FINANCE.code(),  "財務系統",       "Finance",           "账户余额、批次、明细、对账、审批中心",       "AccountBookOutlined",       40},
                {SystemCode.AI.code(),       "AI 管理系統",    "AI Hub",            "模型、配额、授权、MCP、审计、能耗",          "RobotOutlined",             50},
                {SystemCode.HR.code(),       "HR 系統",        "Human Resources",   "员工、组织、职位、员工动态",                 "TeamOutlined",              60},
                {SystemCode.EAM.code(),      "物資管理系統",   "EAM",               "资产、耗材、采购、库存、盘点",               "InboxOutlined",             70},
                {SystemCode.OA.code(),       "OA 系統",        "OA",                "流程中心、流程事项、审批配置、员工自助",     "SolutionOutlined",          80},
                {SystemCode.IAM.code(),      "權限中心",       "IAM",               "角色、功能授权、数据授权、菜单配置",         "SafetyCertificateOutlined", 90},
                {SystemCode.PLATFORM.code(), "平台配置",       "Platform",          "通知、多语言、规则、版本、翻译工作台",       "SettingOutlined",          100},
                {SystemCode.TRANSLATION.code(), "翻譯中心",   "Translation Center", "多语言翻译、语料维护与质量校验，连接全球业务", "GlobalOutlined",         110},
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
