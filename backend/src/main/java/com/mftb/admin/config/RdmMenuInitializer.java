package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 產研協同系統（RDM）菜单与系统准入初始化。
 * <p>
 * 按需求生命周期维护一级菜单（system_code=rdm）与一个配置分组，并把 admin 角色授权、
 * {@code sys_system} 准入一并补齐：
 * <ol>
 *   <li>菜单 upsert（已存在则只对齐层级/启用态，名称留给「菜单配置」自定义）；</li>
 *   <li>admin 角色回填全量动作（{@code sys_user.role=admin} 直通，绑定 sys_admin 角色的员工依赖 sys_role_menu）；</li>
 *   <li>按菜单授权反推角色/部门系统准入，避免严管模式下 PermissionAspect 系统校验拦截。</li>
 * </ol>
 * 幂等口径遵循后端 SQL 规范：结构类动作全部条件化写入，失败抛出（不吞异常），
 * 由 {@code applyOnce(versionKey, task, verify)} 保证「任务与校验都成功才记版本」；
 * 版本已应用时每次启动仍重放 upsert 自愈。参考 SQL：{@code backend/sql/203_rdm_menu_seed.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(24)
public class RdmMenuInitializer implements CommandLineRunner {

    /** 结构升级 v3.4：看板分组新增 產出積分 / 效能量趨勢 两个二级菜单，需求配置分组新增 積分規則 */
    private static final String VERSION_KEY = "rdm:menu-seed:v3.4";
    private static final String ADMIN_ROLE_CODE = "admin";
    /** 被取消的旧一级目录（软删，保留回滚能力） */
    private static final String LEGACY_ROOT_KEY = "rdm-center";
    private static final String VIEW_ONLY = "[\"view\"]";
    private static final String VIEW_CREATE = "[\"view\",\"create\"]";
    private static final String VIEW_EDIT = "[\"view\",\"edit\"]";
    private static final String VIEW_EXPORT = "[\"view\",\"export\"]";
    private static final String FULL_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    /** 研发侧写操作集（任务/迭代上报不涉及删除） */
    private static final String DELIVERY_ACTIONS = "[\"view\",\"create\",\"edit\",\"export\"]";

    /**
     * 菜单种子：{menuKey, 中文名, 英文名, path, component, icon, type, sort, parentKey, actions}。
     * <p>一级菜单接在既有顶级菜单（i18n-center=15）之后，占 16..24，
     * 顶部一律是管理者打开先看的东西，后面严格按需求生命周期动线排列：
     * 总看板 → 个人待办 → 提交 → 台账 → 分配 → 产品处理 → 研发交付 → 验收 → 配置。
     * 「需求配置」与「研發交付」为分组（type=1，无 path），各自下挂二级叶子。
     */
    private static final String[][] MENUS = {
            // 看板区也是多视图（结果/质量/追溯/周报），升为一级分组，避免 PMO 只能在顶部按钮里找入口
            {"rdm-dashboard", "需求總看板", "Requirement Overview", null, null, "RiseOutlined", "1", "16", null, VIEW_ONLY},
            {"rdm-dashboard-board", "交付看板", "Delivery Overview", "/rdm-dashboard", "RdmDashboard", "BarChartOutlined", "2", "1", "rdm-dashboard", VIEW_EXPORT},
            {"rdm-dashboard-quality", "質量口徑", "Quality Metrics", "/rdm-quality", "QualityBoard", "SafetyCertificateOutlined", "2", "2", "rdm-dashboard", VIEW_EXPORT},
            {"rdm-dashboard-version", "版本追溯", "Version Trace", "/rdm-version-trace", "VersionTrace", "BranchesOutlined", "2", "3", "rdm-dashboard", VIEW_ONLY},
            {"rdm-dashboard-report", "交付週報", "Weekly Report", "/rdm-weekly-report", "WeeklyReport", "CalendarOutlined", "2", "4", "rdm-dashboard", VIEW_EXPORT},
            // M4 产出积分与效能量：绩效敏感，单独成菜单而不是挂在交付看板里
            {"rdm-dashboard-score", "產出積分", "Output Scores", "/rdm-score", "ScoreBoard", "TrophyOutlined", "2", "5", "rdm-dashboard", VIEW_EDIT},
            {"rdm-dashboard-trend", "效能量趨勢", "Metric Trend", "/rdm-metric-trend", "MetricTrend", "LineChartOutlined", "2", "6", "rdm-dashboard", VIEW_EXPORT},
            {"rdm-workbench", "需求工作台", "Requirement Workbench", "/rdm-workbench", "RdmWorkbench", "DashboardOutlined", "2", "17", null, VIEW_ONLY},
            {"rdm-submit", "提交需求", "Submit Requirement", "/rdm-submit", "RequirementSubmit", "FormOutlined", "2", "18", null, VIEW_CREATE},
            {"rdm-requirement", "需求台賬", "Requirement Ledger", "/rdm-requirement", "RequirementList", "FileTextOutlined", "2", "19", null, VIEW_EXPORT},
            {"rdm-intake", "需求池·分配", "Requirement Pool", "/rdm-intake", "RequirementPool", "InboxOutlined", "2", "20", null, FULL_ACTIONS},
            {"rdm-product", "產品需求處理", "Product Backlog", "/rdm-product", "ProductBoard", "AppstoreOutlined", "2", "21", null, FULL_ACTIONS},
            // 研發交付是研发侧唯一有明确子环节的区域，升为一级分组（与「需求配置」同法）
            {"rdm-delivery", "研發交付", "R&D Delivery", null, null, "NodeIndexOutlined", "1", "22", null, VIEW_ONLY},
            {"rdm-delivery-board", "交付工作台", "Delivery Workbench", "/rdm-delivery", "DeliveryBoard", "RocketOutlined", "2", "1", "rdm-delivery", DELIVERY_ACTIONS},
            {"rdm-delivery-iteration", "迭代排期", "Iteration Planning", "/rdm-iteration", "IterationPlan", "ScheduleOutlined", "2", "2", "rdm-delivery", DELIVERY_ACTIONS},
            {"rdm-delivery-req", "交付中需求", "In-delivery Requirements", "/rdm-delivery-req", "RequirementList", "FileSearchOutlined", "2", "3", "rdm-delivery", VIEW_EXPORT},
            {"rdm-acceptance", "需求驗收", "Requirement Acceptance", "/rdm-acceptance", "AcceptanceList", "CheckSquareOutlined", "2", "23", null, VIEW_CREATE},
            {"rdm-config-group", "需求配置", "Requirement Settings", null, null, "SettingOutlined", "1", "24", null, VIEW_ONLY},
            {"rdm-config-status", "狀態與流轉", "Status & Transition", "/rdm-config-status", "StatusConfig", "PartitionOutlined", "2", "1", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-routing", "分發矩陣", "Assignment Matrix", "/rdm-config-routing", "RoutingConfig", "SwapOutlined", "2", "2", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-sla", "SLA 與逾期", "SLA & Overdue", "/rdm-config-sla", "SlaConfig", "FieldTimeOutlined", "2", "3", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-score", "積分規則", "Score Rules", "/rdm-score-rule", "ScoreRuleConfig", "CalculatorOutlined", "2", "4", "rdm-config-group", VIEW_EDIT},
    };

    /** 改名意图：只当现名仍是旧默认名时才改，用户走「菜单配置」自定义的名字永远不被覆盖 */
    private static final String[][] RENAMES = {
            {"rdm-dashboard", "需求總看板", "需求看板"},
            {"rdm-requirement", "需求台賬", "我的需求"},
            {"rdm-intake", "需求池·分配", "需求池/分配"},
    };

    /**
     * 分组改造时的「子菜单继承父菜单存量授权」映射：{分组 key, 子菜单 key...}。
     * <p>菜单 key 变化后（rdm-dashboard → rdm-dashboard-board/quality/...），原先被授了父 key 的
     * 角色/部门不会自动拥有新 key，升级当天就会出现“超管能看到、普通用户点开是空白”。
     * <p>映射里**只列本次新增或拆分的子菜单**：已存在的 rdm-config-* 三个子菜单不能加进来，
     * 否则每次启动都会把“仅有目录权”的角色多补一份子页权限（权限只减不增是红线）。
     */
    private static final String[][] GROUP_GRANT_INHERIT = {
            {"rdm-delivery", "rdm-delivery-board", "rdm-delivery-iteration", "rdm-delivery-req"},
            {"rdm-dashboard", "rdm-dashboard-board", "rdm-dashboard-quality", "rdm-dashboard-version", "rdm-dashboard-report"},
            // v3.4 新增叶子：持有看板权的人自然看得到积分与趋势，持有配置分组权的人才能配规则
            {"rdm-dashboard", "rdm-dashboard-score", "rdm-dashboard-trend"},
            {"rdm-config-group", "rdm-config-score"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        // 版本已应用时仍每次启动重放（upsert 天然幂等），防止生产库被回滚/手工删除导致入口丢失
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
    }

    /* ==================== 迁移任务 ==================== */

    private void migrate() {
        for (String[] m : MENUS) {
            upsertMenu(m);
        }
        // 子菜单已改挂顶级，此时才能退役旧一级目录
        retireLegacyRoot();
        flattenExistingRows();
        renameLegacyMenus();
        demoteToGroup("rdm-delivery");
        demoteToGroup("rdm-dashboard");
        inheritGroupGrants();
        grantAdminMenus();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("產研協同(RDM) 菜单已就绪（一级菜单 + 看板/研發交付/需求配置三个分组）: 菜单数={}, system_code={}", MENUS.length, SystemCode.RDM.code());
    }

    /**
     * 软删被取消的一级目录。必须在其子菜单已改挂顶级之后执行（upsert 不删节点），
     * 否则会出现“空目录”挂在侧边栏；同时清理其残留授权，避免无意义权限。
     */
    private void retireLegacyRoot() {
        Long legacyId = queryMenuIdByKey(LEGACY_ROOT_KEY);
        if (legacyId == null) {
            return;
        }
        Integer children = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE parent_id = ? AND deleted = 0", Integer.class, legacyId);
        if (children != null && children > 0) {
            throw new IllegalStateException(LEGACY_ROOT_KEY + " 仍有 " + children + " 个子菜单未提升，不能退役");
        }
        jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", legacyId);
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", legacyId);
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, status = 0, updated_by = 'system' WHERE id = ?", legacyId);
        log.info("已退役一级目录 {}（菜单拍平，子菜单已上升一级）", LEGACY_ROOT_KEY);
    }

    /**
     * 存量行结构对齐：顶级菜单的 sort_order 必须与新一级排序一致。
     * <p>常规情下种子故意不动 sort（尊重「菜单配置」自定义）；但本次是**结构迁移**（从二级升为一级），
     * 旧 sort（1..8）会与其他一级菜单同位竞争导致侧边栏顺序飘移，故此处定向刷一次。
     */
    private void flattenExistingRows() {
        for (String[] m : MENUS) {
            if (m[8] != null) {
                continue;
            }
            Long menuId = queryMenuIdByKey(m[0]);
            if (menuId != null) {
                jdbcTemplate.update("UPDATE sys_menu SET sort_order = ? WHERE id = ? AND deleted = 0",
                        Integer.parseInt(m[7]), menuId);
            }
        }
    }

    /**
     * 存量行改名（仅匹配旧默认名）。
     * <p>upsert 的自愈分支故意不动 name，以保留「菜单配置」页的自定义；
     * 因此分类调整带来的改名必须另外发一条带旧名条件的 UPDATE，幂等且不覆盖自定义名。
     */
    private void renameLegacyMenus() {
        for (String[] r : RENAMES) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET name = ?, name_en = ?, updated_by = 'system' "
                            + "WHERE menu_key = ? AND deleted = 0 AND name = ?",
                    r[1], labelOf(r[0]), r[0], r[2]);
        }
    }

    /** 从种子表取菜单英文名，避开两处手工同步 */
    private static String labelOf(String menuKey) {
        for (String[] m : MENUS) {
            if (m[0].equals(menuKey)) {
                return m[2];
            }
        }
        return null;
    }

    /**
     * 存量行降级为分组（仅匹配旧值，幂等）。
     * <p>rdm-delivery(v3.2)、rdm-dashboard(v3.3) 原先都是叶子菜单（直接路由到页面）；
     * 升为一级分组后，旧行残留的 path/component 会让侧边栏把分组本身当成可跳转页，与子菜单产生两个入口。
     * upsert 分支故意不动 path/component（尊重「菜单配置」自定义），因此需要一条带旧值条件的定向 UPDATE。
     */
    private void demoteToGroup(String menuKey) {
        int affected = jdbcTemplate.update(
                "UPDATE sys_menu SET path = NULL, component = NULL, updated_by = 'system' "
                        + "WHERE menu_key = ? AND deleted = 0 AND (path IS NOT NULL OR component IS NOT NULL)",
                menuKey);
        if (affected > 0) {
            log.info("{} 已从叶子菜单降为一级分组，清理 path/component: {} 行", menuKey, affected);
        }
    }

    /**
     * 子菜单继承父菜单存量授权（结构升级的关键一步，见 {@code GROUP_GRANT_INHERIT}）。
     * <p>菜单 key 发生变化（如 rdm-dashboard → rdm-dashboard-board/quality/...）后，
     * 原先被授了父 key 的角色/部门不会自动拥有新 key，升级当日就会出现
     * “超管能看到、普通用户点开是空白”的漂移。此处把父分组上的授权原样复制到每个子菜单。
     * <p>用 INSERT IGNORE（而非 ON DUPLICATE KEY UPDATE）：已存在的子菜单授权可能是管理员在
     * 授权中心自定义过的，本迁移每次启动都会重放，不得把它刷回父菜单的动作集。
     */
    private void inheritGroupGrants() {
        for (String[] mapping : GROUP_GRANT_INHERIT) {
            String parentKey = mapping[0];
            Long parentId = queryMenuIdByKey(parentKey);
            if (parentId == null) {
                throw new IllegalStateException(parentKey + " 分组不存在，无法继承授权");
            }
            for (int i = 1; i < mapping.length; i++) {
                String childKey = mapping[i];
                Long childId = queryMenuIdByKey(childKey);
                if (childId == null) {
                    throw new IllegalStateException(childKey + " 子菜单未落地，无法继承授权");
                }
                int roles = jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                                + "SELECT rm.role_id, ?, rm.actions FROM sys_role_menu rm WHERE rm.menu_id = ?",
                        childId, parentId);
                int depts = jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions) "
                                + "SELECT dm.dept_id, ?, dm.actions FROM sys_department_menu dm WHERE dm.menu_id = ?",
                        childId, parentId);
                if (roles > 0 || depts > 0) {
                    log.info("子菜单 {} 继承父菜单 {} 授权: 角色 {} 条, 部门 {} 条", childKey, parentKey, roles, depts);
                }
            }
        }
    }

    /** 单个菜单 upsert：新增写全字段，已存在只对齐层级/归属/启用态（名称与排序尊重「菜单配置」自定义） */
    private void upsertMenu(String[] m) {
        String menuKey = m[0];
        String name = m[1];
        String nameEn = m[2];
        String path = m[3];
        String component = m[4];
        String icon = m[5];
        int type = Integer.parseInt(m[6]);
        int sort = Integer.parseInt(m[7]);
        String parentKey = m[8];
        String actions = m[9];

        Long parentId = null;
        if (parentKey != null) {
            parentId = queryMenuIdByKey(parentKey);
            if (parentId == null) {
                throw new IllegalStateException("父菜单不存在，无法挂载 " + menuKey + "（父级：" + parentKey + "）");
            }
        }

        Long existing = queryMenuIdByKey(menuKey);
        if (existing != null) {
            // deleted=1 的记录已被 queryMenuIdByKey 过滤；此处只对齐结构与归属
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, status = 1, type = ? "
                            + "WHERE id = ? AND deleted = 0",
                    parentId, SystemCode.RDM.code(), type, existing);
            return;
        }

        // 软删残留会撞 uk_menu_key 全局唯一索引，先物理清理（与 v44 生产事故同源）
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, "
                        + "actions, system_code, status, updated_by, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'system', 0)",
                parentId, menuKey, name, nameEn, path, component, icon, type, sort, actions, SystemCode.RDM.code());
    }

    /** admin 角色补齐全部 RDM 菜单授权（幂等：ON DUPLICATE KEY 覆盖为全量动作） */
    private void grantAdminMenus() {
        for (String[] m : MENUS) {
            Long menuId = queryMenuIdByKey(m[0]);
            if (menuId == null) {
                throw new IllegalStateException("菜单落地后仍查不到 menuKey=" + m[0]);
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT r.id, ?, ? FROM sys_role r WHERE r.code = ? AND r.deleted = 0 "
                            + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                    menuId, m[9], ADMIN_ROLE_CODE);
        }
    }

    /** 按「持有 rdm 菜单授权」反推角色/部门系统准入；admin 由代码直通无需登记 */
    private void deriveSystemAccess() {
        String system = SystemCode.RDM.code();
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, ? FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = ? "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1",
                system, system);
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, ? FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = ?",
                system, system);
    }

    /* ==================== 后置校验 ==================== */

    private void verify() {
        List<String> missing = new java.util.ArrayList<>();
        for (String[] m : MENUS) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 AND system_code = ?",
                    Integer.class, m[0], SystemCode.RDM.code());
            if (ok == null || ok == 0) {
                missing.add(m[0]);
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("RDM 菜单未就绪（缺失或归属/启用态不符）: " + missing);
        }
        Integer adminGrants = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.system_code = ? AND m.deleted = 0",
                Integer.class, ADMIN_ROLE_CODE, SystemCode.RDM.code());
        if (adminGrants == null || adminGrants < MENUS.length) {
            throw new IllegalStateException("admin 角色未补齐 RDM 菜单授权: 实际 " + adminGrants + " 条");
        }
        // 拍平结构验收：旧一级目录不得仍存在，顶级菜单必须真的挂在顶级
        Integer legacyActive = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, LEGACY_ROOT_KEY);
        if (legacyActive != null && legacyActive > 0) {
            throw new IllegalStateException(LEGACY_ROOT_KEY + " 未被退役，侧边栏会出现空目录");
        }
        for (String[] m : MENUS) {
            if (m[8] != null) {
                continue;
            }
            Integer notTop = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND parent_id IS NOT NULL",
                    Integer.class, m[0]);
            if (notTop != null && notTop > 0) {
                throw new IllegalStateException(m[0] + " 未上升到一级菜单");
            }
        }
        // 分类调整后的名称必须已落地（旧名残留说明改名 SQL 未执行）
        for (String[] r : RENAMES) {
            Integer stale = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND name = ?",
                    Integer.class, r[0], r[2]);
            if (stale != null && stale > 0) {
                throw new IllegalStateException(r[0] + " 仍叫旧名「" + r[2] + "」，改名未生效");
            }
        }
        // 分组结构验收：分组本身必须不可跳转（否则侧边栏出现两个入口），子菜单必须存在、启用且归属正确
        for (String[] mapping : GROUP_GRANT_INHERIT) {
            String groupKey = mapping[0];
            Integer groupActive = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1",
                    Integer.class, groupKey);
            if (groupActive == null || groupActive == 0) {
                throw new IllegalStateException(groupKey + " 分组未就绪");
            }
            Integer stillLeaf = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND path IS NOT NULL",
                    Integer.class, groupKey);
            if (stillLeaf != null && stillLeaf > 0) {
                throw new IllegalStateException(groupKey + " 仍持有 path，未降级为一级分组");
            }
            for (int i = 1; i < mapping.length; i++) {
                String childKey = mapping[i];
                Integer child = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                                + "AND path IS NOT NULL AND component IS NOT NULL AND parent_id = "
                                + "(SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0) t)",
                        Integer.class, childKey, groupKey);
                if (child == null || child == 0) {
                    throw new IllegalStateException(childKey + " 子菜单未就绪（缺失/停用/归属或路由不正确）");
                }
            }
        }
    }

    private Long queryMenuIdByKey(String key) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, key);
        return ids.isEmpty() ? null : ids.get(0);
    }
}
