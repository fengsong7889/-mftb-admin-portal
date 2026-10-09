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
    /**
     * AI 系统的顶级菜单。v45 起 ai-assistant 包装目录已退役，这 9 个菜单直接挂顶级，
     * 归属修复与校验不能再以壳为锚点，否则退役后启动即失败。
     */
    /**
     * 翻译中心的顶级菜单。v45 起 i18n-center 包装目录已退役，这 5 个菜单直接挂顶级，
     * 归属自愈与校验不能再以壳为锚点。
     */
    static final List<String> TRANSLATION_TOP_LEVEL_MENUS = List.of(
            "translation-manage", "i18n-language", "i18n-import-export",
            "i18n-mt-engine", "i18n-dashboard");

    static final List<String> AI_TOP_LEVEL_MENUS = List.of(
            "ai-models", "ai-auth-manage", "ai-quota-manage", "ai-emp-permission",
            "ai-operation-auth", "ai-energy-billing", "ai-mcp-service",
            "ai-conversation-audit", "ai-access-request");

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
        // v45: i18n-center 壳已退役，改为逐个顶级菜单强制归属并向下覆盖；
        //      菜单是否齐备由菜单种子负责，此处缺失即跳过（不卡死启动）。
        for (String menuKey : TRANSLATION_TOP_LEVEL_MENUS) {
            Long rootId = queryMenuIdByKey(menuKey);
            if (rootId == null) {
                continue;
            }
            forceSubtreeSystem(rootId, TRANSLATION_SYSTEM);
        }
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
        // 按树遍历校验（不按 key 前缀猜），未来新增子菜单由自愈覆盖而非卡死启动
        for (String menuKey : TRANSLATION_TOP_LEVEL_MENUS) {
            Long rootId = queryMenuIdByKey(menuKey);
            if (rootId == null) {
                continue;
            }
            List<Long> frontier = List.of(rootId);
            for (int depth = 0; depth < 6 && !frontier.isEmpty(); depth++) {
                String inClause = frontier.stream().map(String::valueOf).collect(Collectors.joining(","));
                Integer wrong = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE id IN (" + inClause + ") AND deleted = 0 "
                                + "AND (system_code IS NULL OR system_code <> ?)",
                        Integer.class, TRANSLATION_SYSTEM);
                if (wrong != null && wrong > 0) {
                    throw new IllegalStateException("翻译中心菜单树存在未归属 i18n 的节点: " + wrong
                            + " 条，起点 " + menuKey);
                }
                frontier = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE deleted = 0 AND parent_id IN (" + inClause + ")", Long.class);
            }
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
        // v45: seller-center 包装目录已退役（系统视图按 system_code 裁剪，壳无运行时职责），
        //      购买入口与报表分析组直接作为商家工作台的顶级菜单存在。
        for (String migratedKey : new String[]{"promotion-sales-config", "promotion-report-group"}) {
            Long migratedId = queryMenuIdByKey(migratedKey);
            if (migratedId == null) {
                throw new IllegalStateException("随心推菜单 " + migratedKey + " 不存在，菜单种子未就绪");
            }
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = NULL, system_code = ?, updated_by = 'system' "
                            + "WHERE id = ? AND deleted = 0 AND (parent_id IS NOT NULL OR system_code IS NULL OR system_code <> ?)",
                    SELLER_SYSTEM, migratedId, SELLER_SYSTEM);
            forceSubtreeSystem(migratedId, SELLER_SYSTEM);
        }

        // 准入派生：持有商家工作台子树菜单授权的角色/部门补授 seller，拆分不断权
        deriveSystemAccessFromMenuGrants(SELLER_SYSTEM);
        Long adminRoleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId != null) {
            for (String entryKey : new String[]{"promotion-sales-config", "promotion-report-group"}) {
                Long entryId = queryMenuIdByKey(entryKey);
                if (entryId != null) {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                            adminRoleId, entryId, "[\"view\"]");
                }
            }
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
        // v45: 校验两个入口已是 seller 系统的顶级菜单（不再要求 seller-center 壳存在）
        for (String entryKey : new String[]{"promotion-sales-config", "promotion-report-group"}) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND parent_id IS NULL AND system_code = ?",
                    Integer.class, entryKey, SELLER_SYSTEM);
            if (ok == null || ok != 1) {
                throw new IllegalStateException("商家工作台入口未就绪或归属不符：" + entryKey);
            }
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

    /**
     * 归位商家工作台的报表层级：报表分析组是 seller 系统的顶级菜单，三个报表叶子挂其下。
     * <p>v45: seller-center / promotion_tool 包装目录已退役，因此不再校验「购买入口是否已迁入
     * seller-center」，也不再有「停用广告系统空壳目录」这一步——壳由
     * DataInitializer#retireSystemWrapperDirectories() 统一物理删除。
     * 菜单 ID 与既有授权全程不变，迁移只动 parent_id 与 system_code。
     */
    private void moveSellerReports() {
        log.info("开始归位店铺随心推报表层级");
        Long reportId = queryMenuIdByKey("promotion-report-group");
        if (reportId == null) {
            throw new IllegalStateException("报表分析菜单不存在，推广报表层级归位中止");
        }
        for (String key : PROMOTION_REPORT_KEYS) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, updated_by = 'system' "
                            + "WHERE menu_key = ? AND deleted = 0 "
                            + "AND (parent_id IS NULL OR parent_id <> ? OR system_code IS NULL OR system_code <> ?)",
                    reportId, SELLER_SYSTEM, key, reportId, SELLER_SYSTEM);
        }
        log.info("店铺随心推报表层级归位完成，保留购买入口、菜单 ID 及既有授权");
    }

    private void verifySellerReports() {
        Long reportId = requireMenuId("promotion-report-group", SELLER_SYSTEM);
        if (jdbcTemplate.queryForObject(
                "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, reportId) != null) {
            throw new IllegalStateException("报表分析应为商家工作台顶级菜单");
        }
        if (queryMenuIdByKey("promotion-sales-config") == null) {
            throw new IllegalStateException("商家工作台购买入口缺失，报表迁移结果不完整");
        }
        for (String key : PROMOTION_REPORT_KEYS) {
            Long id = requireMenuId(key, SELLER_SYSTEM);
            if (!reportId.equals(jdbcTemplate.queryForObject(
                    "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, id))) {
                throw new IllegalStateException("推广报表层级未就绪：" + key);
            }
        }
        // v45: 不再断言「promotion_tool 壳已停用」——该壳连同其余 11 个一级包装目录
        //      已由 DataInitializer(@Order 5) 的 retireSystemWrapperDirectories() 物理删除，
        //      本初始化器 @Order(15) 晚于其执行，壳存在反而是异常。
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
        // v45: 锚点从 ai-assistant 壳改为 AI 顶级菜单集合（壳已退役）；仍只填空值，
        //      显式属于其他系统的分支不动。
        int affected = 0;
        for (String menuKey : AI_TOP_LEVEL_MENUS) {
            affected += jdbcTemplate.update(
                    "UPDATE sys_menu SET system_code = ? WHERE menu_key = ? AND parent_id IS NULL "
                            + "AND deleted = 0 AND (system_code IS NULL OR system_code = '')",
                    systemCode, menuKey);
        }
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
        // 只校验「已存在的 AI 顶级菜单必须归属 ai」——菜单是否齐备由菜单种子负责，
        // 本初始化器不重复断言清单完整性，否则隔离库夹具与新增菜单都会误报。
        String placeholders = String.join(",", AI_TOP_LEVEL_MENUS.stream().map(k -> "?").toList());
        Object[] args = new Object[AI_TOP_LEVEL_MENUS.size() + 1];
        args[0] = SystemCode.AI.code();
        for (int i = 0; i < AI_TOP_LEVEL_MENUS.size(); i++) {
            args[i + 1] = AI_TOP_LEVEL_MENUS.get(i);
        }
        List<String> unowned = jdbcTemplate.queryForList(
                "SELECT menu_key FROM sys_menu WHERE parent_id IS NULL AND deleted = 0 "
                        + "AND (system_code IS NULL OR system_code <> ?) AND menu_key IN (" + placeholders + ")",
                String.class, args);
        if (!unowned.isEmpty()
                || !jdbcTemplate.queryForList(MISSING_AI_DESCENDANTS, Long.class, SystemCode.AI.code()).isEmpty()) {
            throw new IllegalStateException("AI 菜单系统归属未就绪，请检查顶级菜单及后代归属：" + unowned);
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

    /**
     * 种子 13 个业务系统；portal 是哨兵值不落库。每次启动幂等刷新展示元数据。
     * <p><b>名称真值规则</b>：{@code name} / {@code name_en} / {@code description} 必须逐字等于
     * 前端语言包 {@code portal.systems.<key>}（zh-TW 与 en），因为企业门户是系统名称的对外口径，
     * 而授权中心 / 侧边栏 / 系统切换器 / 首页都经 {@code getSystemDisplayName} 取同一套文案。
     * 系统名称不开放人工修改：本表是唯一定义处，改名称只能改这里并同步 5 个语言包，
     * 由前后端两侧的锁定用例共同把关（前端 src/constants/portalSystems.test.ts，
     * 后端 SystemPortalSchemaInitializerTest#seedSystemsMatchesPortalAuthoritativeNames）。
     * <p>key 映射：code=seller 归门户 merchantWorkbench，code=i18n 归门户 translation。
     * 列顺序：code / name / nameEn / description / icon / sortOrder。
     */
    private void seedSystems() {
        Object[][] rows = {
                {SystemCode.ADS.code(), "廣告推薦系統", "Advertising & Recommendations",
                        "廣告投放、商家推廣與團購活動，助力業務增長", "AimOutlined", 10},
                {SystemCode.MERCHANT.code(), "商戶運營系統", "Merchant Operations",
                        "統一管理商戶集團、門店資料與地圖規劃", "ShopOutlined", 20},
                {SystemCode.SELLER.code(), "商家工作台", "Merchant Workspace",
                        "門店經營、訂單處理與營業數據，一站式商家工作空間", "ShopOutlined", 25},
                {SystemCode.SEARCH.code(), "搜索運營系統", "Search Operations",
                        "管理搜索詞庫、引導策略與效果分析", "SearchOutlined", 30},
                {SystemCode.FINANCE.code(), "財務系統", "Finance",
                        "賬戶資金、收支明細與財務對賬，盡在掌握", "AccountBookOutlined", 40},
                {SystemCode.AI.code(), "人工智能管理系統", "Artificial Intelligence",
                        "統一管理智能模型、使用配額與安全審計", "RobotOutlined", 50},
                {SystemCode.HR.code(), "人力資源系統", "Human Resources",
                        "連接員工、組織與職位，掌握人事動態", "TeamOutlined", 60},
                {SystemCode.EAM.code(), "物資管理系統", "Asset Management",
                        "資產、耗材、採購與庫存的全生命週期管理", "InboxOutlined", 70},
                {SystemCode.RDM.code(), "產研協同系統", "R&D Collaboration",
                        "需求提交、審批、分配、研發交付、驗收上線與產出看板", "ProjectOutlined", 75},
                {SystemCode.OA.code(), "協同辦公系統", "Office Collaboration",
                        "流程申請、事項審批與員工自助，高效協作", "SolutionOutlined", 80},
                {SystemCode.IAM.code(), "權限中心", "Access Control",
                        "統一配置角色、功能與數據權限，守護訪問安全", "SafetyCertificateOutlined", 90},
                {SystemCode.PLATFORM.code(), "平台配置", "Platform Configuration",
                        "集中管理通知、多語言、業務規則與版本配置", "SettingOutlined", 100},
                {SystemCode.TRANSLATION.code(), "翻譯中心", "Translation Center",
                        "多語言翻譯、語料維護與品質校驗，連接全球業務", "GlobalOutlined", 110},
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

    /**
     * 顶级菜单归属回填。唯一真值来源：docs/system-portal/inventory.md §2。
     * <p>v45: 一级包装目录（merchant_group / search / finance / ai-assistant / hr /
     * asset-management / oa-center / permission / system-config / i18n-center /
     * promotion_tool / seller-center）已退役，原属它们的子菜单提升为顶级，
     * 因此本表按「顶级菜单 → 系统」逐条登记；菜单配置属 iam 治理面，不随平台配置。
     */
    private void backfillTopLevelMenuSystem() {
        updateMenuSystem(SystemCode.PORTAL.code(),    List.of("home"));
        updateMenuSystem(SystemCode.MERCHANT.code(),  List.of("merchant-group-list", "store-list"));
        updateMenuSystem(SystemCode.SELLER.code(),    List.of("promotion-sales-config", "promotion-report-group"));
        updateMenuSystem(SystemCode.ADS.code(),       List.of("merchant_promotion", "group-purchase"));
        updateMenuSystem(SystemCode.SEARCH.code(),    List.of("search-config-new", "search-guide", "search-library",
                "search-verify-group", "report"));
        updateMenuSystem(SystemCode.FINANCE.code(),   List.of("promotion", "merchant-reconcile", "approval"));
        updateMenuSystem(SystemCode.AI.code(),        List.of("ai-models", "ai-auth-manage", "ai-quota-manage",
                "ai-emp-permission", "ai-operation-auth", "ai-energy-billing", "ai-mcp-service",
                "ai-conversation-audit", "ai-access-request"));
        updateMenuSystem(SystemCode.HR.code(),        List.of("hr-profile", "hr-lifecycle", "hr-config",
                "org-center", "perf-center", "perf-report-center", "ess-center"));
        updateMenuSystem(SystemCode.EAM.code(),       List.of("asset-dashboard", "consumable-ops", "asset-flow-ops",
                "eam-procurement", "asset-basic"));
        updateMenuSystem(SystemCode.RDM.code(),       List.of("rdm-center", "rdm-dashboard", "rdm-efficiency",
                "rdm-workbench", "rdm-requirement", "rdm-submit", "rdm-pool-group", "rdm-query",
                "rdm-product", "rdm-delivery", "rdm-acceptance", "rdm-config-group"));
        updateMenuSystem(SystemCode.OA.code(),        List.of("process-center", "oa-requests", "workflow-config"));
        // 菜单配置是治理面菜单，归 iam 而非 platform
        updateMenuSystem(SystemCode.IAM.code(),       List.of("authorization-center", "role-management",
                "function-permission", "data-permission", "system-authorization", "menu-config"));
        updateMenuSystem(SystemCode.PLATFORM.code(),  List.of("rule-config", "rule-center", "version-history",
                "notification-config"));
        updateMenuSystem(SystemCode.TRANSLATION.code(), List.of("translation-manage", "i18n-language",
                "i18n-import-export", "i18n-mt-engine", "i18n-dashboard"));
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
