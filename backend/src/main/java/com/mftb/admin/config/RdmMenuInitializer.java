package com.mftb.admin.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    /**
     * v3.10：取消 rdm-query（需求查询）独立菜单，把全量可见并回 rdm-intake。
     * <p>上一轮 v3.8 拆出 rdm-query 是为了把「数据范围」从 rdm-requirement 的 export/delete
     * 上解绑——这个价值保留（全量可见不再认导出权），但落点错了：分配权必然蕴含可见权，
     * 两者拆成两个窄权限菜单只会让管理员要同步维护两份授权。
     * <p>为什么递增而不是改 v3.8/v3.9：本轮退役了一个已入库的菜单并改变了 canSeeAll 的口径，
     * 复用旧 key 会让已记账环境留着 rdm-query 菜单、而代码已不再认它的全量权。
     */
    private static final String VERSION_KEY = "rdm:menu-seed:v3.11";
    private static final String ADMIN_ROLE_CODE = "admin";
    /** 被取消的旧一级目录（软删，保留回滚能力） */
    private static final String LEGACY_ROOT_KEY = "rdm-center";
    private static final String VIEW_ONLY = "[\"view\"]";
    private static final String VIEW_CREATE = "[\"view\",\"create\"]";
    private static final String VIEW_EDIT = "[\"view\",\"edit\"]";
    private static final String VIEW_EXPORT = "[\"view\",\"export\"]";
    /**
     * 需求清单：查看+导出是宽权限，create（提需求）从「提交需求」平移过来，
     * edit 是需求侧处理（受理/PRD/评审/变更）从「產品需求處理」平移过来。
     * <p>这里故意不含分配权 —— 分配只认 rdm-intake:edit，两者分开才能避免误授。
     */
    private static final String LIST_ACTIONS = "[\"view\",\"create\",\"edit\",\"export\"]";
    private static final String FULL_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    /** 研发侧写操作集（任务/迭代上报不涉及删除） */
    private static final String DELIVERY_ACTIONS = "[\"view\",\"create\",\"edit\",\"export\"]";
    /**
     * 迭代排期额外带 delete：菜单收敛后「删除迭代」接口的锚点从已退役的 rdm-product 移到这里。
     * <p>种子的 actions 是「该菜单可授哪些动作」，不列上 delete 则管理员在授权中心永远勾不到
     * 这个能力，接口就只剩超管能用（他靠代码直通，不依赖授权行）。
     */
    private static final String ITERATION_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";

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
            // 风险是「每天都要看并要行动」的视图（跟催/解塞/分发），与周度复盘的看板频次不同，因此单独成页
            {"rdm-dashboard-risk", "風險中心", "Risk Center", "/rdm-risk", "RiskCenter", "AlertOutlined", "2", "2", "rdm-dashboard", VIEW_EXPORT},
            {"rdm-dashboard-quality", "質量口徑", "Quality Metrics", "/rdm-quality", "QualityBoard", "SafetyCertificateOutlined", "2", "3", "rdm-dashboard", VIEW_EXPORT},
            {"rdm-dashboard-version", "版本追溯", "Version Trace", "/rdm-version-trace", "VersionTrace", "BranchesOutlined", "2", "4", "rdm-dashboard", VIEW_ONLY},
            {"rdm-dashboard-report", "交付週報", "Weekly Report", "/rdm-weekly-report", "WeeklyReport", "CalendarOutlined", "2", "5", "rdm-dashboard", VIEW_EXPORT},
            /*
             * 效能與產出：「看人和效率」的三个视图归同一分组。
             * <p>原本它们与「看结果」的看板混在一个分组里达 8 个子项；而「部門與人員產出」
             * 与「產出積分」不同：前者是在途负载/吞吐（找瓶颈），后者是绩效结果（可追溯的分）。
             */
            {"rdm-efficiency", "效能與產出", "Efficiency & Output", null, null, "DashboardOutlined", "1", "17", null, VIEW_ONLY},
            {"rdm-dashboard-score", "產出積分", "Output Scores", "/rdm-score", "ScoreBoard", "TrophyOutlined", "2", "1", "rdm-efficiency", VIEW_EDIT},
            {"rdm-dashboard-trend", "效能量趨勢", "Metric Trend", "/rdm-metric-trend", "MetricTrend", "LineChartOutlined", "2", "2", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-efficiency-output", "部門與人員產出", "Dept & People Output", "/rdm-output", "TeamOutput", "TeamOutlined", "2", "3", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-workbench", "需求工作台", "Requirement Workbench", "/rdm-workbench", "RdmWorkbench", "HistoryOutlined", "2", "18", null, VIEW_ONLY},
            {"rdm-requirement", "需求清單", "Requirement List", "/rdm-requirement", "RequirementList", "FileTextOutlined", "2", "19", null, LIST_ACTIONS},
            /*
             * v3.11：拆「需求池·分配」为一级分组下的两个二级菜单，让提出/审批侧与分配侧各得其所。
             * <p>原本一页里塞「待分配 / 待我審批 / 全部需求」三个视角，但审批人（提出人的主管或高层）
             * 与分配人（技术负责人/PM）不是同一批角色：高层会误入分配区，PM 每天看到无关的审批列。
             * <p>关键约束：rdm-intake 这个 menuKey 是 canSeeAll（view）与分配权（edit）的锚点，
             * 被 12 处服务端引用与存量 sys_role_menu/sys_department_menu 授权记录绑定，
             * 所以只改显示名与层级位置（upsert 会对齐 parent_id，alignSeedSorts 会对齐排序），
             * key/path/actions 一律不动 —— 不这样就得做授权平移，既有降权也有扩权风险。
             * 新菜单 rdm-intake-approval 只给 view：审批动作由服务端按「OA 当前审批人=我」收敛，
             * 分配动作仍只认 rdm-intake:edit，本菜单不携分配权。
             */
            {"rdm-pool-group", "需求池", "Requirement Pool", null, null, "ContainerOutlined", "1", "20", null, VIEW_ONLY},
            {"rdm-intake-approval", "提交需求", "Submit & Approval", "/rdm-intake-approval", "RequirementIntake", "SendOutlined", "2", "1", "rdm-pool-group", VIEW_ONLY},
            {"rdm-intake", "需求管理", "Requirement Pool", "/rdm-intake", "RequirementPool", "InboxOutlined", "2", "2", "rdm-pool-group", FULL_ACTIONS},
            // 研發交付是研发侧唯一有明确子环节的区域，升为一级分组（与「需求配置」同法）
            {"rdm-delivery", "研發交付", "R&D Delivery", null, null, "NodeIndexOutlined", "1", "23", null, VIEW_ONLY},
            {"rdm-delivery-board", "交付工作台", "Delivery Workbench", "/rdm-delivery", "DeliveryBoard", "RocketOutlined", "2", "1", "rdm-delivery", DELIVERY_ACTIONS},
            {"rdm-delivery-iteration", "迭代排期", "Iteration Planning", "/rdm-iteration", "IterationPlan", "ScheduleOutlined", "2", "2", "rdm-delivery", ITERATION_ACTIONS},
            {"rdm-acceptance", "需求驗收", "Requirement Acceptance", "/rdm-acceptance", "AcceptanceList", "CheckSquareOutlined", "2", "24", null, VIEW_CREATE},
            {"rdm-config-group", "需求配置", "Requirement Settings", null, null, "SettingOutlined", "1", "25", null, VIEW_ONLY},
            {"rdm-config-status", "狀態與流轉", "Status & Transition", "/rdm-config-status", "StatusConfig", "PartitionOutlined", "2", "1", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-routing", "分發矩陣", "Assignment Matrix", "/rdm-config-routing", "RoutingConfig", "SwapOutlined", "2", "2", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-sla", "SLA 與逾期", "SLA & Overdue", "/rdm-config-sla", "SlaConfig", "FieldTimeOutlined", "2", "3", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-score", "積分規則", "Score Rules", "/rdm-score-rule", "ScoreRuleConfig", "CalculatorOutlined", "2", "4", "rdm-config-group", VIEW_EDIT},
    };

    /** 改名意图：只当现名仍是旧默认名时才改，用户走「菜单配置」自定义的名字永远不被覆盖 */
    private static final String[][] RENAMES = {
            {"rdm-dashboard", "需求總看板", "需求看板"},
            // 台账→清单：两个历史默认名都要覆盖，否则自定义过名字的不动、没改过的也改不过来
            {"rdm-requirement", "需求清單", "需求台賬"},
            {"rdm-requirement", "需求清單", "我的需求"},
            // v3.11 拆分：需求池不再兼任审批总台，改名「需求管理」并挂进「需求池」分组
            {"rdm-intake", "需求管理", "需求池·分配"},
            {"rdm-intake", "需求管理", "需求池/分配"},
    };

    /**
     * 退役菜单的授权归宿：{被退役菜单, 目标菜单, 要搬的动作}。动作用 `*` 表示全部。
     * <p>迁移语义是「**同一动作平移到目标菜单**」：持有旧菜单某 action 的角色/部门，
     * 在目标菜单上拿到同一个 action，绝不写入旧行里没有的动作 —— 所以既不会降权也不会扩权。
     * <p>为什么按动作分流而不是整体搬：产品需求处理上一个 `delete` 其实是「删除迭代」接口，
     * 它的语义归属是「迭代排期」菜单，而不是需求清单；整体搬会把删除迭代的能力扫给看需求的人。
     * <p>同一个 fromKey 允许多行（按动作分流），退役采用两阶段：先把所有目标搬完再软删源行，
     * 否则第一行处理完就删了源，后续行的动作会无人接而静默丢失。
     * <p>动作集必须覆盖源菜单 actions 全集，否则持有未登记动作的角色会静默降权；
     * 这一点由 {@code assertRetireCoverageComplete} 在迁移前实查，缺则启动失败。
     */
    private static final String[][] RETIRED_MENU_MERGE = {
            {"rdm-product", "rdm-requirement", "view,create,edit,export"},
            {"rdm-product", "rdm-delivery-iteration", "delete"},
            {"rdm-delivery-req", "rdm-requirement", "*"},
            {"rdm-submit", "rdm-requirement", "*"},
            // v3.10：需求查询并回需求池。它当初被拆出来是为了把数据范围从导出权解绑，
            // 这个价值保留（全量可见不再认 rdm-requirement:export），但落点错了：
            // 分配权必然蕴含可见权，两者应同一个窄权限菜单。rdm-query 的 view 平移到 intake 的 view 上，
            // 能力等价，不会新增动作。
            {"rdm-query", "rdm-intake", "*"},
    };

    /**
     * 分组改造时的「子菜单继承父菜单存量授权」映射：{分组 key, 子菜单 key...}。
     * <p>菜单 key 变化后（rdm-dashboard → rdm-dashboard-board/quality/...），原先被授了父 key 的
     * 角色/部门不会自动拥有新 key，升级当天就会出现“超管能看到、普通用户点开是空白”。
     * <p>映射里**只列本次新增或拆分的子菜单**：已存在的 rdm-config-* 三个子菜单不能加进来，
     * 否则每次启动都会把“仅有目录权”的角色多补一份子页权限（权限只减不增是红线）。
     */
    private static final String[][] GROUP_GRANT_INHERIT = {
            {"rdm-delivery", "rdm-delivery-board", "rdm-delivery-iteration"},
            {"rdm-dashboard", "rdm-dashboard-board", "rdm-dashboard-quality", "rdm-dashboard-version", "rdm-dashboard-report"},
            {"rdm-config-group", "rdm-config-score"},
            // v3.5 新增叶子：風險中心沿用看板存量授权；部門與人員產出沿用新分组授权
            {"rdm-dashboard", "rdm-dashboard-risk"},
            {"rdm-efficiency", "rdm-efficiency-output"},
            /*
             * 注：rdm-dashboard-score / rdm-dashboard-trend 已从本表移除。它们是 v3.4 已继承过的存量叶子，
             * 本次只改挂到 rdm-efficiency（菜单行 id 不变，自身授权随行）；若继续列在这里，
             * 管理员在授权中心主动撤销后会被每次启动重放静静补回，违反「权限只减不增」。
             */
    };

    /**
     * 新建「分组节点」的授权来源：{存量分组, 新分组...}。
     * <p>rdm-efficiency 是本次新建的顶级分组，本身没有存量授权，不把看板分组的授权先复制一份，
     * 它下面的新叶子就没有继承基准。
     * <p>必须在 {@code GROUP_GRANT_INHERIT} 之前处理，同一次启动内才能形成继承链；
     * 新分组下的叶子只能从它继承，而它本身没有存量授权。
     */
    private static final String[][] GROUP_GRANT_SEED = {
            {"rdm-dashboard", "rdm-efficiency"},
    };

    /**
     * v3.5 分组重排后的排序对齐。
     * <p>为什么需要单独一步：upsertMenu 对已存在的行只对齐归属与启用态，故意不碰名称与排序
     * （尊重管理员在「菜单配置」里的自定义），所以本次只在 MENUS 里改 sort 对旧菜单无效，
     * 新建的「風險中心」会与仍为 2 的「質量口徑」撞位。
     * <p>只对「当前排序仍等于旧默认值」的行生效：管理员手工调过顺序的一律不动。
     * 每行按自己的 menu_key + 旧 sort 定位，彼此不受执行顺序影响。
     */
    private static final String[][] SORT_ALIGN = {
            {"rdm-dashboard-quality", "2", "3"},
            {"rdm-dashboard-version", "3", "4"},
            {"rdm-dashboard-report", "4", "5"},
            {"rdm-dashboard-score", "5", "1"},
            {"rdm-dashboard-trend", "6", "2"},
            /*
             * v3.11：rdm-intake 从顶级（sort 20）改挂到 rdm-pool-group 下，成为分组内第二项。
             * 它跟父分组同用了 20，虽不影响组内排序（1 在前、20 在后），但同一层里留个 20 会让后续
             * 插入子项时没有空位，所以按旧默认值对齐为 2（管理员自定义过排序则不动）。
             */
            {"rdm-intake", "20", "2"},
    };

    /**
     * 授权动作的固定字典与输出顺序。
     * <p>并集写入时按这个顺序重组 JSON，保证同一动作集每次都生成同样的字串
     * （否则集合顺不同会被重放误判为“有变更”，每天刷一遍无效写入）。
     * <p>出现表外动作时直接抛出：宁可启动失败，也不能静默丢掉一个动作后把它当成“已迁移”。
     */
    private static final List<String> ACTION_ORDER = List.of(
            "view", "create", "edit", "delete", "export", "import", "enable", "disable");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;
    private final ObjectMapper objectMapper;

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
        alignSeedSorts();
        // 先搬完旧菜单授权再补新叶子继承：退役不能目标未就位就执行
        retireMenusMergingGrants();
        inheritGroupGrants();
        grantAdminMenus();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("產研協同(RDM) 菜单已就绪（一级菜单 + 需求總看板/效能與產出/研發交付/需求配置四个分组）: 菜单数={}, system_code={}", MENUS.length, SystemCode.RDM.code());
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
     * 退役被收敛的菜单，并把它们已有的授权平移到目标菜单。
     * <p>与 {@code retireLegacyRoot}（退役空目录）不同：退役带授权的菜单必须先把授权搬干净，
     * 否则“有产品需求处理权、没有需求清单权”的角色升级当日会直接看不到需求。
     * <p>先搬授权再软删行，两边授权都写完才删；中途失败抛出会让 applyOnce 不记版本，
     * 下次启动从头重跑（菜单行尚未软删，所以重跑是安全的）。
     */
    private void retireMenusMergingGrants() {
        // 迁移前先确认「每个动作都有归宿」：漏配会让持有该动作的角色静默降权，事后极难发现
        assertRetireCoverageComplete();

        // 阶段 1：把所有分流目标搬完。不能边搬边删，否则同一源的后续分流行会因源已消失而静默丢动作
        for (String[] row : RETIRED_MENU_MERGE) {
            Long fromId = queryMenuIdByKey(row[0]);
            if (fromId == null) {
                // 已退役；migrate() 每次启动都重放，这里必须是空转
                continue;
            }
            Long toId = queryMenuIdByKey(row[1]);
            if (toId == null) {
                throw new IllegalStateException("退役 " + row[0] + " 时目标菜单 " + row[1] + " 不存在，拒绝执行（否则授权无处落地）");
            }
            Set<String> scope = actionScope(row[2]);
            int roles = mergeGrantsInto("sys_role_menu", "role_id", fromId, toId, scope);
            int depts = mergeGrantsInto("sys_department_menu", "dept_id", fromId, toId, scope);
            if (roles > 0 || depts > 0) {
                log.info("菜单 {} 的动作 [{}] 平移到 {}: 角色 {} 条、部门 {} 条", row[0], row[2], row[1], roles, depts);
            }
        }

        // 阶段 2：源菜单清场（先删授权再软删菜单行）
        for (String fromKey : retiredKeys()) {
            Long fromId = queryMenuIdByKey(fromKey);
            if (fromId == null) {
                continue;
            }
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", fromId);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", fromId);
            jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, status = 0, updated_by = 'system' WHERE id = ?", fromId);
            log.info("菜单 {} 已退役（授权已按动作平移至归宿菜单）", fromKey);
        }
    }

    /**
     * 事前校验：每个待退役菜单在自己行里声明的动作，必须全部在 {@code RETIRED_MENU_MERGE} 里有归宿。
     * <p>只按目标写分流而漏掉某个动作时，持该动作的角色不会报错、只会静默失去能力，
     * 到用户发现“按钮点不动了”才回溯，成本极高 —— 所以宁可在启动时就失败。
     */
    private void assertRetireCoverageComplete() {
        for (String fromKey : retiredKeys()) {
            List<String> declaredRaws = jdbcTemplate.queryForList(
                    "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0", String.class, fromKey);
            if (declaredRaws.isEmpty()) {
                continue; // 已退役，无需再校验
            }
            Set<String> declared = parseActions(declaredRaws.get(0));
            Set<String> covered = new LinkedHashSet<>();
            for (String[] row : RETIRED_MENU_MERGE) {
                if (row[0].equals(fromKey)) {
                    covered.addAll(actionScope(row[2]));
                }
            }
            Set<String> uncovered = new LinkedHashSet<>(declared);
            uncovered.removeAll(covered);
            if (!uncovered.isEmpty()) {
                throw new IllegalStateException("退役菜单 " + fromKey + " 的动作 " + uncovered
                        + " 没有登记归宿菜单，迁移后这些能力会静默丢失；请在 RETIRED_MENU_MERGE 补上分流");
            }
        }
    }

    /** 去重且保序的被退役菜单 key（同一 key 可能因动作分流占多行） */
    private static List<String> retiredKeys() {
        Set<String> seen = new LinkedHashSet<>();
        for (String[] row : RETIRED_MENU_MERGE) {
            seen.add(row[0]);
        }
        return List.copyOf(seen);
    }

    /** 解析分流动作声明：`*` 表示全部，其余必须都在 {@code ACTION_ORDER} 字典内 */
    private static Set<String> actionScope(String spec) {
        Set<String> scope = new LinkedHashSet<>();
        if ("*".equals(spec.trim())) {
            scope.addAll(ACTION_ORDER);
            return scope;
        }
        for (String part : spec.split(",")) {
            String action = part.trim();
            if (action.isEmpty()) {
                continue;
            }
            if (!ACTION_ORDER.contains(action)) {
                throw new IllegalStateException("RETIRED_MENU_MERGE 里出现未登记的授权动作: " + action);
            }
            scope.add(action);
        }
        return scope;
    }

    /**
     * 把来源菜单上的授权逐条并入目标菜单，动作集取并集、只增不减。
     * <p>目标已有该 owner 时只追加缺少的动作，绝不删掉已有动作（管理员在授权中心的自定义不被覆盖）；
     * 并集没变化时不写，保证重放幂等。
     * <p>表名与列名只接受本类内的字面量常量，不拼接任何外部输入。
     *
     * @param scope 本次允许平移的动作集（按分流过滤，避免把不属于该目标的动作一并扫过去）
     * @return 实际发生写入（新建或修改）的条数
     */
    private int mergeGrantsInto(String table, String ownerColumn, Long fromId, Long toId, Set<String> scope) {
        List<Map<String, Object>> sources = jdbcTemplate.queryForList(
                "SELECT " + ownerColumn + " AS owner_id, actions FROM " + table + " WHERE menu_id = ?", fromId);
        int changed = 0;
        for (Map<String, Object> source : sources) {
            Long ownerId = ((Number) source.get("owner_id")).longValue();
            Set<String> moving = parseActions(source.get("actions"));
            moving.retainAll(scope);
            if (moving.isEmpty()) {
                continue;
            }
            List<String> current = jdbcTemplate.queryForList(
                    "SELECT actions FROM " + table + " WHERE menu_id = ? AND " + ownerColumn + " = ?",
                    String.class, toId, ownerId);
            if (current.isEmpty()) {
                jdbcTemplate.update("INSERT INTO " + table + " (" + ownerColumn + ", menu_id, actions) VALUES (?, ?, ?)",
                        ownerId, toId, writeActions(moving));
                changed++;
                continue;
            }
            Set<String> target = parseActions(current.get(0));
            Set<String> union = new LinkedHashSet<>(target);
            union.addAll(moving);
            if (!union.equals(target)) {
                jdbcTemplate.update("UPDATE " + table + " SET actions = ? WHERE menu_id = ? AND " + ownerColumn + " = ?",
                        writeActions(union), toId, ownerId);
                changed++;
            }
        }
        return changed;
    }

    /**
     * 解析 actions JSON 数组。
     * <p>脏数据不吞：解析失败直接抛出，否则会当成“没授权可迁移”而误记迁移成功。
     */
    private Set<String> parseActions(Object raw) {
        if (raw == null) {
            return new LinkedHashSet<>();
        }
        String text = String.valueOf(raw).trim();
        if (text.isEmpty() || "null".equals(text)) {
            return new LinkedHashSet<>();
        }
        try {
            return new LinkedHashSet<>(objectMapper.readValue(text, new TypeReference<List<String>>() {
            }));
        } catch (Exception e) {
            throw new IllegalStateException("actions 字段不是合法的 JSON 数组，无法安全合并授权: " + text, e);
        }
    }

    /** 按 {@code ACTION_ORDER} 输出 JSON；发现表外动作直接失败，不静默丢弃 */
    private String writeActions(Set<String> actions) {
        List<String> ordered = ACTION_ORDER.stream().filter(actions::contains).toList();
        if (ordered.size() != actions.size()) {
            Set<String> unknown = new LinkedHashSet<>(actions);
            unknown.removeAll(ordered);
            throw new IllegalStateException("发现未登记的授权动作，拒绝写入: " + unknown);
        }
        try {
            return objectMapper.writeValueAsString(ordered);
        } catch (Exception e) {
            throw new IllegalStateException("授权动作序列化失败: " + actions, e);
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
        // 先补新分组自己的授权，再处理叶子继承（顺序不能翻，否则新分组下的叶子无基准可继承）
        for (String[] mapping : GROUP_GRANT_SEED) {
            inheritOneGroup(mapping);
        }
        for (String[] mapping : GROUP_GRANT_INHERIT) {
            inheritOneGroup(mapping);
        }
    }

    /** 把父节点上的角色/部门授权原样复制到列出的子节点（INSERT IGNORE，不覆盖自定义） */
    private void inheritOneGroup(String[] mapping) {
        String parentKey = mapping[0];
        Long parentId = queryMenuIdByKey(parentKey);
        if (parentId == null) {
            throw new IllegalStateException(parentKey + " 分组不存在，无法继承授权");
        }
        for (int i = 1; i < mapping.length; i++) {
            String childKey = mapping[i];
            Long childId = queryMenuIdByKey(childKey);
            if (childId == null) {
                throw new IllegalStateException(childKey + " 节点未落地，无法继承授权");
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
                // 措辞不写“子菜单”：本方法也用于把存量分组的授权复制给新建分组
                log.info("菜单 {} 继承 {} 授权: 角色 {} 条, 部门 {} 条", childKey, parentKey, roles, depts);
            }
        }
    }

    /** 按 {@code SORT_ALIGN} 对齐排序：仅当当前值仍是旧默认值时才动（不覆盖管理员自定义） */
    private void alignSeedSorts() {
        for (String[] row : SORT_ALIGN) {
            int changed = jdbcTemplate.update(
                    "UPDATE sys_menu SET sort_order = ?, updated_by = 'system' "
                            + "WHERE menu_key = ? AND deleted = 0 AND sort_order = ?",
                    Integer.parseInt(row[2]), row[0], Integer.parseInt(row[1]));
            if (changed > 0) {
                log.info("菜单排序对齐: {} {} → {}", row[0], row[1], row[2]);
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
        for (String[] mapping : GROUP_GRANT_SEED) {
            String groupKey = mapping[0];
            for (int i = 1; i < mapping.length; i++) {
                String newGroupKey = mapping[i];
                Integer active = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 AND type = 1",
                        Integer.class, newGroupKey);
                if (active == null || active == 0) {
                    throw new IllegalStateException(newGroupKey + " 新分组未就绪（缺失/停用/不是容器类型）");
                }
                Integer hasPath = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND path IS NOT NULL",
                        Integer.class, newGroupKey);
                if (hasPath != null && hasPath > 0) {
                    throw new IllegalStateException(newGroupKey + " 带了 path，不是纯分组节点");
                }
                // 新分组必须是一级：若错挂到其他菜单下，侧边栏会少一层入口
                Integer notTop = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND parent_id IS NOT NULL",
                        Integer.class, newGroupKey);
                if (notTop != null && notTop > 0) {
                    throw new IllegalStateException(newGroupKey + " 未作为一级分组挂在顶级");
                }
                // 存量分组必须存在，否则继承基准缺失
                if (queryMenuIdByKey(groupKey) == null) {
                    throw new IllegalStateException(groupKey + " 存量分组不存在，无法验证授权继承链");
                }
            }
        }
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
        // 排序对齐验收：同一分组内不得出现重复 sort（否则新叶子会与旧菜单撞位，侧边栏顺序不稳定）
        Integer dupSorts = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT parent_id, sort_order FROM sys_menu "
                        + "WHERE system_code = ? AND deleted = 0 AND status = 1 AND parent_id IS NOT NULL "
                        + "GROUP BY parent_id, sort_order HAVING COUNT(*) > 1) t",
                Integer.class, SystemCode.RDM.code());
        if (dupSorts != null && dupSorts > 0) {
            throw new IllegalStateException("RDM 同一分组内存在 " + dupSorts + " 组重复 sort_order，菜单顺序会不稳定");
        }
        // 重排后的关键顺序必须真落地（只信 UPDATE 报的成功不算）
        assertSortEquals("rdm-dashboard-quality", 3);
        assertSortEquals("rdm-dashboard-risk", 2);
        assertSortEquals("rdm-dashboard-score", 1);
        // v3.7 退役验收：被收敛的菜单不得仍有存活行，也不得残留孤儿授权（残留会让授权树出现幽灵节点）
        for (String[] row : RETIRED_MENU_MERGE) {
            String retiredKey = row[0];
            Integer alive = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                    Integer.class, retiredKey);
            if (alive != null && alive > 0) {
                throw new IllegalStateException(retiredKey + " 应已退役但仍存在");
            }
            Integer orphan = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                            + "WHERE m.menu_key = ? AND m.deleted = 1",
                    Integer.class, retiredKey);
            if (orphan != null && orphan > 0) {
                throw new IllegalStateException(retiredKey + " 退役后仍残留 " + orphan + " 条角色授权，迁移未搬干净");
            }
        }
        /*
         * 分配侧两个能力必须同时落在 rdm-intake 上，而且是同一个菜单：
         * - edit 是全系统唯一的分配权（canDispatch 就查这个），菜单被误删不会报错，
         *   只会让需求永远分不出去；
         * - view 是全量可见（canSeeAll 已改认它），缺了它需求池就只能读到自己相关的单子，
         *   界面不报错但永远筛不出待分配的全貌。
         */
        assertAdminHoldsAction(RdmConstants.MENU_INTAKE, "edit");
        assertAdminHoldsAction(RdmConstants.MENU_INTAKE, "view");
        assertAdminHoldsAction("rdm-requirement", "create");
        assertAdminHoldsAction("rdm-intake-approval", "view");
        // 菜单名只提醒不阻断：名字是「菜单配置」里允许自定义的运维项，
        // 拿它当启动门禁会让一次正常改名把服务改崩（结构类断言仍保持硬失败）
        warnIfMenuNameDiffers(RdmConstants.MENU_INTAKE, "需求管理");
        warnIfMenuNameDiffers("rdm-intake-approval", "提交需求");
        // 分组必须是真正的目录：带 path 的“分组”会在侧边栏变成可点叶子，两层结构退化
        assertIsDirectoryGroup("rdm-pool-group");
    }

    /** 断言菜单是一级分组（type=1、无 path、无 component） */
    private void assertIsDirectoryGroup(String menuKey) {
        List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT type, path, component FROM sys_menu WHERE menu_key = ? AND deleted = 0", menuKey);
        if (rows.isEmpty()) {
            throw new IllegalStateException(menuKey + " 分组菜单不存在，无法校验结构");
        }
        java.util.Map<String, Object> row = rows.get(0);
        int type = ((Number) row.get("type")).intValue();
        if (type != 1 || row.get("path") != null || row.get("component") != null) {
            throw new IllegalStateException(menuKey + " 应是无 path/component 的一级分组，实际 type="
                    + type + ", path=" + row.get("path") + ", component=" + row.get("component"));
        }
    }

    /**
     * 菜单默认名与期望不一致时只告警。
     * <p>改名原因有两个：RENAMES 故意不覆盖管理员自定义名（那是用户的权利）；
     * 而本方法原先是抛异常，等于把“在菜单配置里改了个名字”变成下次启动直接失败、
     * 就绪探针 DOWN。名字错不会造成数据或权限后果，所以降级为 warn；
     * 真正的结构不变量（分组必须是目录、分配权必须在原位）仍由其他断言硬拦。
     */
    private void warnIfMenuNameDiffers(String menuKey, String expectedName) {
        List<String> names = jdbcTemplate.queryForList(
                "SELECT name FROM sys_menu WHERE menu_key = ? AND deleted = 0", String.class, menuKey);
        if (names.isEmpty()) {
            throw new IllegalStateException(menuKey + " 菜单不存在，无法校验名称");
        }
        if (!expectedName.equals(names.get(0))) {
            log.warn("菜单 {} 当前名为「{}」（种子默认名「{}」）：若为管理员自定义则无需处理，"
                    + "若种子默认名已落错请检查 RENAMES 旧名条目", menuKey, names.get(0), expectedName);
        }
    }

    /**
     * 断言菜单存在、启用，且 admin 在该菜单上持有指定动作。
     * <p>用 Java 解析而不是 SQL 的 JSON_CONTAINS：actions 列是 text，脏数据下 JSON 函数会静默返回
     * NULL 而让断言假通过，走 {@code parseActions} 则非法值直接抛出。
     */
    private void assertAdminHoldsAction(String menuKey, String action) {
        List<String> rows = jdbcTemplate.queryForList(
                "SELECT rm.actions FROM sys_role_menu rm "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.menu_key = ? AND m.deleted = 0 AND m.status = 1",
                String.class, ADMIN_ROLE_CODE, menuKey);
        if (rows.isEmpty()) {
            throw new IllegalStateException(menuKey + " 不存在或未授权给 admin（菜单收敛可能误删了权限锚点）");
        }
        boolean held = rows.stream().anyMatch(raw -> parseActions(raw).contains(action));
        if (!held) {
            throw new IllegalStateException(menuKey + " 上 admin 未持有 " + action + " 动作，实际授权: " + rows);
        }
    }

    private void assertSortEquals(String menuKey, int expected) {
        Integer actual = jdbcTemplate.queryForObject(
                "SELECT sort_order FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, menuKey);
        if (actual == null || actual != expected) {
            throw new IllegalStateException(menuKey + " 排序应为 " + expected + "，实际 " + actual);
        }
    }

    private Long queryMenuIdByKey(String key) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, key);
        return ids.isEmpty() ? null : ids.get(0);
    }
}
