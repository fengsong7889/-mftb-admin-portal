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

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 產研交付系統（RDM）菜单与系统准入初始化。
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
     * v3.15：把 rdm-requirement 的可授动作集对齐到种子（管理员已裁决）。
     * <p>v3.14 只补了 view_all/dispatch/contribute；执行时发现本环境该行的实际可授集是
     * [view, export]，create（提需求）与 edit（产品受理）早已被摘掉，授权中心勾不到两者，
     * 退役 rdm-intake 后需求侧受理权就无处可授。管理员已明确选定：恢复 create/edit 为可授。
     * <p>可授 ≠ 已授：本迁移只动 sys_menu.actions 这一列元数据，不往 sys_role_menu /
     * sys_department_menu 写任何一行，因此本轮**没有任何人得到新能力**；
     * 谁可以勾这两个动作仍由管理员在授权中心显式决定。
     * <p>上一版 v3.13 已完成生命周期分组，本轮仍不改结构、不改路径。
     * <p>本轮仍保持双锚点过渡：rdm-intake 的 view/edit 仍是全量可见与分配权的现行判定依据，
     * RdmAccessGuard 同时认新锚点，迁移完成前不拆旧。
     */
    private static final String VERSION_KEY = "rdm:menu-seed:v3.20";
    /**
     * v3.16 授权镜像登记号：与菜单结构迁移分号登记，因为它**只能跑一次**。
     * <p>不能放进每次启动重放的 migrate()：管理员事后在新锚点上撤销的授权，
     * 会被重放的镜像从旧锚点又加回来（“撤权不复活”是方案 §五 的红线）。
     */
    private static final String MIRROR_VERSION_KEY = "rdm:anchor-grant-mirror:v1";
    /**
     * v3.35 分组授权继承登记号：与菜单结构迁移分号登记，因为同样**只能跑一次**。
     * <p>继承本身只为结构升级当次补位；若每次启动重放，管理员在授权中心撤销的子菜单授权
     * 会被父菜单的存量授权用 INSERT IGNORE 再插回来（“撤权不复活”红线）。
     * <p>将来再有新建分组需要继承，另起 v2 key，不要回退成每次执行。
     */
    private static final String GROUP_GRANT_INHERIT_VERSION_KEY = "rdm:menu-group-grant-inherit:v1";
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
     * <p>v3.14 另走 {@code ACTION_SYNC} 只补登记新动作：常量对已存在的行无效（upsert 不动 actions）。
     */
    private static final String LIST_ACTIONS = "[\"view\",\"create\",\"edit\",\"export\",\"view_all\",\"dispatch\",\"contribute\"]";
    private static final String FULL_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    /** 研发侧写操作集（任务/迭代上报不涉及删除） */
    private static final String DELIVERY_ACTIONS = "[\"view\",\"create\",\"edit\",\"export\"]";
    /**
     * 可授动作集「以种子为准」的菜单白名单：{菜单 key}。
     * <p>v3.15 列入 rdm-requirement：管理员已裁决恢复 create/edit 可授，叠加 v3.14 的三个新锚点，
     * 该菜单的可授集应等于种子 {@code LIST_ACTIONS}。
     * <p>v3.17 列入 rdm-dashboard-project：项目写接口（新增/编辑/暂停恢复）的锚点，
     * 不列入则存量行的 [view,export] 不会被补齐，非超管永远用不了项目写流程。
     * <p>语义仍是**只并集追加、绝不删减**：管理员额外自定义出来的动作会被保留。
     * <p>只有显式授权的菜单才进这张表：默认不刷，否则会把别人特意摘掉的能力悄悄补回去，那是扩权。
     */
    private static final String[] ACTION_SYNC_FROM_SEED = {
            RdmConstants.MENU_REQUIREMENT,
            RdmConstants.MENU_DASHBOARD_PROJECT,
    };
    /**
     * 迭代排期额外带 delete：菜单收敛后「删除迭代」接口的锚点从已退役的 rdm-product 移到这里。
     * <p>种子的 actions 是「该菜单可授哪些动作」，不列上 delete 则管理员在授权中心永远勾不到
     * 这个能力，接口就只剩超管能用（他靠代码直通，不依赖授权行）。
     */
    private static final String ITERATION_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    /**
     * 進度日報「手動觸發」頁的可授動作集：view + trigger。
     * <p>為什麼 trigger 不併進 edit：手動觸發會向釘釘群與多位負責人發<b>不可撤回</b>的訊息，
     * 「能改規則/模板」與「能刷群」是兩種權力，必須可分開授予；
     * 不列上 trigger 則管理員在授權中心永遠夠不到這個能力，接口就只剩超管能用。
     */
    private static final String TRIGGER_ACTIONS = "[\"view\",\"trigger\"]";
    /**
     * 項目總覽（v3.17）：可授集必须含 create/edit。
     * <p>RdmProjectController 的新增挂 create、编辑挂 edit，而「暫停/恢復推進」就是走编辑
     * PATCH 改 pausedFlag；种子只列 view/export 时授权中心勾不到写权，
     * 实测非超管账号点暂停/新增一律 403「没有 [rdm-dashboard-project] 的[编辑]权限」。
     * <p>v3.20 补 delete：空壳项目（未挂任何需求）支持删除，接口挂 delete 动作；
     * 不列入则授权中心永远勾不到，只有超管能删。
     * <p>可授 ≠ 已授：本改动只动 sys_menu.actions 元数据，谁能勾仍由管理员显式决定。
     */
    private static final String PROJECT_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\",\"notify\"]";

    /**
     * 團隊負載（rdm-resource-load）：可授动作集。
     * <p>view=查看本人；view_all=查看全员（不授予其他项目业务正文/验收/签署权限）；
     * edit=维护本人剩余工时/个人例外日历；dispatch=分派工作（每次写入还需满足来源业务动作权限）；
     * manage=名册与容量维护（不包含业务派单或验收权）；export=导出有权查看的负载数据。
     * <p>可授 ≠ 已授：本改动只动 sys_menu.actions 元数据，谁能勾仍由管理员显式决定。
     */
    private static final String RESOURCE_LOAD_ACTIONS = "[\"view\",\"view_all\",\"edit\",\"dispatch\",\"manage\",\"export\"]";

    /**
     * 菜单种子：{menuKey, 中文名, 英文名, path, component, icon, type, sort, parentKey, actions}。
     * <p>v3.13 生命周期分组：
     * 個人工作台 → 項目與計劃 → 需求中心 → 研發執行 → 測試與質量 → 發布與驗收 → 效能復盤 → 交付配置。
     * 先建项目再挂靠需求，项目入口排在需求中心之前。
     */
    private static final String[][] MENUS = {
            // 1) 個人工作台：跨阶段待办入口，顶级单叶
            {"rdm-workbench", "個人工作台", "Personal Workbench", "/rdm-workbench", "RdmWorkbench", "HistoryOutlined", "2", "16", null, VIEW_ONLY},
            // 2) 項目與計劃：先建项目再挂靠需求（复用 rdm-dashboard key）
            {"rdm-dashboard", "項目與計劃", "Projects & Planning", null, null, "RiseOutlined", "1", "17", null, VIEW_ONLY},
            {"rdm-dashboard-project", "項目總覽", "Project Overview", "/rdm-project", "ProjectOverview", "ProjectOutlined", "2", "1", "rdm-dashboard", PROJECT_ACTIONS},
            {"rdm-delivery-iteration", "迭代排期", "Iteration Planning", "/rdm-iteration", "IterationPlan", "ScheduleOutlined", "2", "2", "rdm-dashboard", ITERATION_ACTIONS},
            // 團隊負載：从研发工作台资源负载 Tab 升级为独立菜单，放在项目与计划分组下（sort=3，風險中心后移为 4）
            {"rdm-resource-load", "團隊負載", "Team Workload", "/rdm-resource-load", "ResourceLoad", "TeamOutlined", "2", "3", "rdm-dashboard", RESOURCE_LOAD_ACTIONS},
            {"rdm-dashboard-risk", "風險中心", "Risk Center", "/rdm-risk", "RiskCenter", "AlertOutlined", "2", "4", "rdm-dashboard", VIEW_EXPORT},
            // 3) 需求中心：业务侧提出与审批 + 分配侧统筹（复用 rdm-pool-group key）
            {"rdm-pool-group", "需求中心", "Requirement Center", null, null, "ContainerOutlined", "1", "18", null, VIEW_ONLY},
            {"rdm-intake-approval", "提需求", "Submit Requirement", "/rdm-intake-approval", "RequirementIntake", "SendOutlined", "2", "1", "rdm-pool-group", VIEW_ONLY},
            {"rdm-intake", "認領/分配", "Claim & Assign", "/rdm-intake", "RequirementPool", "InboxOutlined", "2", "2", "rdm-pool-group", FULL_ACTIONS},
            {"rdm-requirement", "需求跟進清單", "Requirement Follow-up", "/rdm-requirement", "RequirementList", "FileTextOutlined", "2", "3", "rdm-pool-group", LIST_ACTIONS},
            // 4) 研發執行：研发同学日常任务与工时上报（复用 rdm-delivery key）
            {"rdm-delivery", "研發執行", "Development", null, null, "NodeIndexOutlined", "1", "19", null, VIEW_ONLY},
            {"rdm-delivery-board", "研發工作台", "Dev Workbench", "/rdm-delivery", "DeliveryBoard", "RocketOutlined", "2", "1", "rdm-delivery", DELIVERY_ACTIONS},
            // 5) 測試與質量：测试批次执行 + 质量结果分析（新建分组）
            {"rdm-test-quality-group", "測試與質量", "Testing & Quality", null, null, "ExperimentOutlined", "1", "20", null, VIEW_ONLY},
            {"rdm-delivery-test", "測試工作台", "Test Workbench", "/rdm-test", "TestWorkbench", "BugOutlined", "2", "1", "rdm-test-quality-group", DELIVERY_ACTIONS},
            {"rdm-dashboard-quality", "質量分析", "Quality Analysis", "/rdm-quality", "QualityBoard", "SafetyCertificateOutlined", "2", "2", "rdm-test-quality-group", VIEW_EXPORT},
            // 6) 發布與驗收：验收中心 + 发布批次 + 版本追溯（新建分组）
            {"rdm-release-accept-group", "發布與驗收", "Release & Acceptance", null, null, "CloudUploadOutlined", "1", "21", null, VIEW_ONLY},
            {"rdm-acceptance", "驗收中心", "Acceptance Center", "/rdm-acceptance", "AcceptanceList", "CheckSquareOutlined", "2", "1", "rdm-release-accept-group", VIEW_CREATE},
            {"rdm-delivery-release", "發布中心", "Release Center", "/rdm-release", "ReleaseCenter", "CloudServerOutlined", "2", "2", "rdm-release-accept-group", DELIVERY_ACTIONS},
            {"rdm-dashboard-version", "版本追溯", "Version Trace", "/rdm-version-trace", "VersionTrace", "BranchesOutlined", "2", "3", "rdm-release-accept-group", VIEW_ONLY},
            // 7) 效能復盤：交付结果 + 周报 + 部门人员负载 + 趋势 + 产出积分（复用 rdm-efficiency key）
            {"rdm-efficiency", "效能復盤", "Review & Metrics", null, null, "DashboardOutlined", "1", "22", null, VIEW_ONLY},
            {"rdm-dashboard-board", "交付看板", "Delivery Overview", "/rdm-dashboard", "RdmDashboard", "BarChartOutlined", "2", "1", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-dashboard-report", "交付週報", "Weekly Report", "/rdm-weekly-report", "WeeklyReport", "CalendarOutlined", "2", "2", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-efficiency-output", "部門與人員產出", "Dept & People Output", "/rdm-output", "TeamOutput", "TeamOutlined", "2", "3", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-dashboard-trend", "效能量趨勢", "Metric Trend", "/rdm-metric-trend", "MetricTrend", "LineChartOutlined", "2", "4", "rdm-efficiency", VIEW_EXPORT},
            {"rdm-dashboard-score", "產出積分", "Output Scores", "/rdm-score", "ScoreBoard", "TrophyOutlined", "2", "5", "rdm-efficiency", VIEW_EDIT},
            // 8) 交付配置：规则改动影响所有人的分（复用 rdm-config-group key）
            {"rdm-config-group", "交付配置", "Delivery Settings", null, null, "SettingOutlined", "1", "23", null, VIEW_ONLY},
            {"rdm-config-status", "狀態與流轉", "Status & Transition", "/rdm-config-status", "StatusConfig", "PartitionOutlined", "2", "1", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-routing", "分發矩陣", "Assignment Matrix", "/rdm-config-routing", "RoutingConfig", "SwapOutlined", "2", "2", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-sla", "SLA 與逾期", "SLA & Overdue", "/rdm-config-sla", "SlaConfig", "FieldTimeOutlined", "2", "3", "rdm-config-group", VIEW_EDIT},
            {"rdm-config-score", "積分規則", "Score Rules", "/rdm-score-rule", "ScoreRuleConfig", "CalculatorOutlined", "2", "4", "rdm-config-group", VIEW_EDIT},
            {"rdm-task-type-config", "任務類型", "Task Types", "/rdm-task-type-config", "TaskTypeConfig", "TagsOutlined", "2", "5", "rdm-config-group", VIEW_EDIT},
            // 9) 進度日報（一级菜单，sort=24 接在交付配置 23 之后）：
            // 这是一套独立业务（多规则推送 + 模板库 + 记录 + 补发），面向项目经理/产品负责人，
            // 不应埋在「交付配置」下。四个二级菜单按职责拆开，权限也就能按职责拆开。
            {"rdm-daily-report-group", "進度日報", "Progress Digest", null, null, "BellOutlined", "1", "24", null, VIEW_ONLY},
            {"rdm-daily-report-rule", "推送配置", "Push Rules", "/rdm-daily-report-rules", "DailyReportRules", "SettingOutlined", "2", "1", "rdm-daily-report-group", VIEW_EDIT},
            {"rdm-daily-report-template", "模板配置", "Templates", "/rdm-daily-report-templates", "DailyReportTemplates", "FileTextOutlined", "2", "2", "rdm-daily-report-group", VIEW_EDIT},
            {"rdm-daily-report-record", "發送記錄", "Send History", "/rdm-daily-report-records", "DailyReportRecords", "HistoryOutlined", "2", "3", "rdm-daily-report-group", VIEW_ONLY},
            {"rdm-daily-report-trigger", "手動觸發", "Manual Trigger", "/rdm-daily-report-trigger", "DailyReportTrigger", "SendOutlined", "2", "4", "rdm-daily-report-group", TRIGGER_ACTIONS},
    };

    /** 改名意图：只当现名仍是旧默认名时才改，用户走「菜单配置」自定义的名字永远不被覆盖 */
    private static final String[][] RENAMES = {
            // v3.13 生命周期分组改名
            {"rdm-dashboard", "項目與計劃", "需求總看板"},
            {"rdm-dashboard", "項目與計劃", "需求看板"},
            {"rdm-pool-group", "需求中心", "需求池"},
            {"rdm-delivery", "研發執行", "研發交付"},
            {"rdm-efficiency", "效能復盤", "效能與產出"},
            {"rdm-config-group", "交付配置", "需求配置"},
            {"rdm-workbench", "個人工作台", "需求工作台"},
            {"rdm-delivery-board", "研發工作台", "交付工作台"},
            {"rdm-dashboard-quality", "質量分析", "質量口徑"},
            {"rdm-acceptance", "驗收中心", "需求驗收"},
            // 历史改名保留（确保未升级环境也能改过来）
            {"rdm-requirement", "需求清單", "需求台賬"},
            {"rdm-requirement", "需求清單", "我的需求"},
            {"rdm-requirement", "需求跟進清單", "需求清單"},
            {"rdm-requirement", "需求跟進清單", "需求台賬"},
            {"rdm-requirement", "需求跟進清單", "我的需求"},
            // 种子名曾误写简体（菜单名会写进 DB 并对用户可见，界面文案必须繁体）：
            // upsert 对已存在行不改 name，所以存量环境必须靠这里的旧名条件 UPDATE 才能改过来。
            {"rdm-requirement", "需求跟進清單", "需求跟进清单"},
            {"rdm-intake", "需求管理", "需求池·分配"},
            {"rdm-intake", "需求管理", "需求池/分配"},
            {"rdm-intake", "認領/分配", "需求管理"},
            {"rdm-intake", "認領/分配", "认领/分配"},
            {"rdm-intake-approval", "提需求", "提交需求"},
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
            // v3.20：日報推送升级为一级菜单「進度日報」并拆四个二级页后，旧单页菜单退役。
            // 授权按动作分流平移：能改配置的→能改规则+模板（等价能力，不扩权）；能触发的→能手动触发。
            // 两阶段：先搬授权再软删源行，中途失败会让 applyOnce 不记版本、下次重跑。
            {"rdm-config-daily-report", "rdm-daily-report-rule", "view,edit"},
            {"rdm-config-daily-report", "rdm-daily-report-template", "view,edit"},
            {"rdm-config-daily-report", "rdm-daily-report-trigger", "trigger"},
            {"rdm-config-daily-report", "rdm-daily-report-record", "view"},
    };

    /**
     * 分组改造时的「子菜单继承父菜单存量授权」映射：{分组 key, 子菜单 key...}。
     * <p>菜单 key 变化后（rdm-dashboard → rdm-dashboard-board/quality/...），原先被授了父 key 的
     * 角色/部门不会自动拥有新 key，升级当天就会出现“超管能看到、普通用户点开是空白”。
     * <p>映射里**只列本次新增或拆分的子菜单**：已存在的 rdm-config-* 三个子菜单不能加进来，
     * 否则每次启动都会把“仅有目录权”的角色多补一份子页权限（权限只减不增是红线）。
     */
    private static final String[][] GROUP_GRANT_INHERIT = {
            // v3.13 新建分组的叶子继承（只列新增叶子，存量叶子改挂父级不重复继承）
            {"rdm-test-quality-group", "rdm-delivery-test", "rdm-dashboard-quality"},
            {"rdm-release-accept-group", "rdm-acceptance", "rdm-delivery-release", "rdm-dashboard-version"},
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
            // v3.13 新建分组从研发交付分组继承授权（测试/发布叶子原来就在它下面）
            {"rdm-delivery", "rdm-test-quality-group", "rdm-release-accept-group"},
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
            // v3.13 生命周期分组排序对齐
            // 項目與計劃组内：project(15→1), risk(2→3), iteration 迁入后保持 2
            {"rdm-dashboard-project", "15", "1"},
            {"rdm-dashboard-risk", "2", "3"},
            // v3.18 團隊負載升级为独立菜单占 sort=3，風險中心后移为 4（与种子注释同一意图）
            {"rdm-dashboard-risk", "3", "4"},
            // 需求中心组内：requirement(19→3), intake 已在 2
            {"rdm-requirement", "19", "3"},
            {"rdm-intake", "20", "2"},
            // 測試與質量组内：test(24→1), quality(3→2)
            {"rdm-delivery-test", "24", "1"},
            {"rdm-dashboard-quality", "3", "2"},
            // 發布與驗收组内：acceptance(24→1), release(25→2), version(4→3)
            {"rdm-acceptance", "24", "1"},
            {"rdm-delivery-release", "25", "2"},
            {"rdm-dashboard-version", "4", "3"},
            // 效能復盤组内：score(1→5), trend(2→4), report(5→2), board 迁入后保持 1
            {"rdm-dashboard-score", "1", "5"},
            {"rdm-dashboard-trend", "2", "4"},
            {"rdm-dashboard-report", "5", "2"},
            // v3.18 rdm-dashboard 组插入團隊負載(sort=3)：risk 让位 3→4，否则同组撞 sort 启动校验失败
            {"rdm-dashboard-risk", "3", "4"},
            // 顶级排序：workbench(18→16)
            {"rdm-workbench", "18", "16"},
    };

    /**
     * 锚点收敛的动作归宿：{源菜单, 源动作, 目标菜单, 目标动作}。
     * <p>与 {@code RETIRED_MENU_MERGE} 的区别：那张表只做「同动作平移」，本表能做「动作改写」。
     * rdm-intake 退役时必须改写，因为全量可见与分配权在新锚点上叫 view_all/dispatch，
     * 直接同名搬运会把 intake:view 扫到 requirement:view（人人可看的宽权限）上，那才是真扩权。
     * <p>为什么现在就建表并每次启动校验，而不是等退役那批再做：现在没人持有新动作，
     * 映射不产生任何权限变化；但如果映射漏项，今天发现只是一条日志，退役当天发现就是一起
     * 静默降权事故。把覆盖率检查前置到退役之前的启动里，漂移就不可能留到退役那天。
     * <p>本表目前只用于校验，真正的平移写入属于「平移 + 切注解 + 软删」原子批次（未完成）。
     */
    private static final String[][] ANCHOR_REMAP = {
            {RdmConstants.MENU_INTAKE, "view", RdmConstants.MENU_REQUIREMENT, RdmConstants.ACTION_VIEW_ALL},
            {RdmConstants.MENU_INTAKE, "edit", RdmConstants.MENU_REQUIREMENT, RdmConstants.ACTION_DISPATCH},
            {RdmConstants.MENU_INTAKE, "create", RdmConstants.MENU_REQUIREMENT, RdmConstants.ACTION_CONTRIBUTE},
            // 导出与菜单同语义，不改名；它不携带 view_all/dispatch，所以单独一行
            {RdmConstants.MENU_INTAKE, "export", RdmConstants.MENU_REQUIREMENT, "export"},
            // 旧 intake:delete 的实际用途是删除迭代，语义归宿在迭代菜单而不是需求清单
            {RdmConstants.MENU_INTAKE, "delete", RdmConstants.MENU_DELIVERY_ITERATION, "delete"},
    };

    /** 本次需要预先校验覆盖率的存量锚点（退役后交给 {@code RETIRED_MENU_MERGE} 自己的断言） */
    private static final String ANCHOR_PRECHECK_MENU = RdmConstants.MENU_INTAKE;

    /**
     * 需要镜像授权的授权表与归属列：成对字面量常量，绝不接受外部输入拼 SQL。
     * <p>两张表的语义相同（“这个主体在这个菜单上可做哪些动作”），
     * 锚点收敛必须同时处理，漏一张就会造成“角色能用、部门不能用”。
     */
    private static final String[][] GRANT_TABLES = {
            {"sys_role_menu", "role_id"},
            {"sys_department_menu", "dept_id"},
    };

    /**
     * 授权动作的固定字典与输出顺序。
     * <p>并集写入时按这个顺序重组 JSON，保证同一动作集每次都生成同样的字串
     * （否则集合顺不同会被重放误判为“有变更”，每天刷一遍无效写入）。
     * <p>出现表外动作时直接抛出：宁可启动失败，也不能静默丢掉一个动作后把它当成“已迁移”。
     */
    private static final List<String> ACTION_ORDER = List.of(
            "view", "create", "edit", "delete", "export", "import", "enable", "disable",
            "view_all", "dispatch", "contribute",
            // trigger：日報推送的「手動觸發」专用动作。不併入 edit 是因为它会向釘釘群與多位
            // 負責人發不可撤回的訊息，「能改配置」與「能刷群」必須可分開授 予。
            "trigger",
            // notify：AI 助手把项目进度推送到钉钉群/个人；与 edit 分开，避免「能改项目」自动获得
            // 「能对外发消息」的权力。
            "notify");

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
        // 授权镜像是一次性迁移：applyOnce 已应用时不重跑，也不会进结构自愈的重放链
        versionTracker.applyOnce(MIRROR_VERSION_KEY, this::mirrorAnchorGrants, this::verifyAnchorMirror);
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
        // 新动作先登记到菜单行，再谈授权平移与退役：勾不到的动作等于不存在的动作
        syncSeedActions();
        // 锚点映射必须在退役之前就是完整的：漏项现在只是一条报错，退役那天就是静默降权
        assertAnchorRemapCoversLiveMenu(ANCHOR_PRECHECK_MENU);
        // 先搬完旧菜单授权再补新叶子继承：退役不能目标未就位就执行
        retireMenusMergingGrants();
        // 授权继承是一次性迁移：补完就交给授权中心，重放会把管理员撤销的授权再插回来
        versionTracker.applyOnce(GROUP_GRANT_INHERIT_VERSION_KEY,
                this::inheritGroupGrants, this::verifyGroupGrantNodes);
        grantAdminMenus();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("產研交付(RDM) 菜单已就绪（v3.20 可授动作集对齐：rdm-dashboard-project 补 delete，空壳项目/迭代可删）: 菜单数={}, system_code={}", MENUS.length, SystemCode.RDM.code());
    }

    /**
     * 把白名单菜单的可授动作集补齐到种子声明的水平（只并集追加，幂等）。见 {@code ACTION_SYNC_FROM_SEED}。
     * <p>为什么要单独一步：upsert 分支故意不动 actions（尊重「菜单配置」自定义），
     * 所以给已有菜单新增「可授动作」必须发这条定向 UPDATE；不刷则退役旧锚点时
     * 需求侧受理权无处可授，属静默降权。
     * <p>只补不删：结果永远是「现有动作 ∪ 种子动作」，管理员在该菜单上额外加的动作不会被抹掉。
     * <p>动作集直接取自 {@code MENUS} 而不是另拄一份 JSON 字面量，避免种子与同步表两处漂移。
     * <p>读-改-写之间不拼条件 SQL：本方法是启动期 CommandLineRunner 的唯一写入方，
     * 没有并发修改者；已对齐时重放空转。
     */
    private void syncSeedActions() {
        for (String menuKey : ACTION_SYNC_FROM_SEED) {
            // 种子动作集是 JSON 数组，必须走 parseActions；actionScope 是给「view,edit」这种逗号声明用的，
            // 两者弄混会把 ["view" 当成动作名而报「未登记的授权动作」（单测已钉住这一条）
            Set<String> declared = parseActions(seedActionsOf(menuKey));
            List<String> currentRaws = jdbcTemplate.queryForList(
                    "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0", String.class, menuKey);
            if (currentRaws.isEmpty()) {
                throw new IllegalStateException(menuKey + " 菜单不存在，无法对齐可授动作集");
            }
            Set<String> current = parseActions(currentRaws.get(0));
            if (current.containsAll(declared)) {
                continue; // 已覆盖种子声明的动作，重放空转
            }
            Set<String> union = new LinkedHashSet<>(current);
            union.addAll(declared);
            jdbcTemplate.update(
                    "UPDATE sys_menu SET actions = ?, updated_by = 'system' WHERE menu_key = ? AND deleted = 0",
                    writeActions(union), menuKey);
            log.info("菜单可授动作集对齐 {}: {} → {}（种子外另保留 {} 项，未被删减）",
                    menuKey, current, declared, union.size() - declared.size());
        }
    }

    /** 从种子表取该菜单声明的可授动作集；菜单不在种子里直接抛（白名单写错不能静默空转） */
    private static String seedActionsOf(String menuKey) {
        for (String[] m : MENUS) {
            if (m[0].equals(menuKey)) {
                return m[9];
            }
        }
        throw new IllegalStateException("菜单 " + menuKey + " 不在种子里，无法按种子对齐动作集");
    }

    /**
     * 按 {@code ANCHOR_REMAP} 把一个菜单上的动作集改写成「目标菜单 → 应写动作集」的分流结果。
     * <p>纯函数、包内可见，给退役迁移与单测共用同一份归宿口径；没归宿的动作直接抛出：
     * 宁可启动失败，也不能把「剩下的动作当成已迁移」。允许一个源动作映到多个目标（不 break）。
     */
    static Map<String, Set<String>> remapAnchorGrants(String fromMenuKey, Set<String> actions) {
        Map<String, Set<String>> targets = new LinkedHashMap<>();
        for (String action : actions) {
            boolean matched = false;
            for (String[] row : ANCHOR_REMAP) {
                if (row[0].equals(fromMenuKey) && row[1].equals(action)) {
                    targets.computeIfAbsent(row[2], key -> new LinkedHashSet<>()).add(row[3]);
                    matched = true;
                }
            }
            if (!matched) {
                throw new IllegalStateException("锚点 " + fromMenuKey + " 的动作 " + action
                        + " 在 ANCHOR_REMAP 里没有归宿，退役后这个能力会静默丢失");
            }
        }
        return targets;
    }

    /**
     * 把旧锚点上的能力按 {@code ANCHOR_REMAP} **镜像**到新锚点：不删源、不改菜单结构。
     * <p>为什么必须在切注解之前落地：注解一旦不再认 rdm-intake，仍只持有旧锚点的主体会直接 403；
     * 两者在同一次启动里先生效镜像、后生效新注解，才算“平移不降权”。
     * <p>可见副作用（必须告知而不静默）：若某主体原本在目标菜单上一行授权都没有，
     * 镜像会新建一行，而菜单可见性 = 持有该菜单任一动作 → 该主体侧栏会多出目标菜单入口。
     * 注意是“侧栏”而不是“权限扩大”：拿到的仍是同一个能力，只是入口提前可见。
     * <p>方法只在 applyOnce 里执行一次，因此内部可以放心做并集写入而不会撑大“撤权不复活”的风险。
     */
    void mirrorAnchorGrants() {
        int changed = 0;
        for (String[] table : GRANT_TABLES) {
            for (String[] rule : ANCHOR_REMAP) {
                changed += mirrorGrantRule(table[0], table[1], rule);
            }
        }
        log.info("锚点授权镜像（rdm-intake → rdm-requirement/迭代排期）：新建或更新 {} 条授权行；"
                + "源菜单与其授权保持不变，未软删任何菜单", changed);
    }

    /** 一条映射规则在一张授权表上的镜像；返回实际发生写入的行数 */
    private int mirrorGrantRule(String table, String ownerColumn, String[] rule) {
        Long fromId = queryMenuIdByKey(rule[0]);
        Long toId = queryMenuIdByKey(rule[2]);
        if (fromId == null || toId == null) {
            // 源已退役或目标未就位：空转。宁可不写，也不能把授权扫到查不到的菜单上
            return 0;
        }
        int changed = 0;
        for (Map<String, Object> source : queryGrantees(table, ownerColumn, fromId)) {
            if (!parseActions(source.get("actions")).contains(rule[1])) {
                continue;
            }
            Long ownerId = ((Number) source.get("owner_id")).longValue();
            changed += grantActionOn(table, ownerColumn, toId, ownerId, rule[3]);
        }
        return changed;
    }

    /**
     * 在目标菜单上为单个主体并集写入一个动作：已有则只补少的，没有则新建一行。
     * <p>只补不删：绝不抹掉目标菜单上管理员已经自定义过的其他动作。
     */
    private int grantActionOn(String table, String ownerColumn, Long menuId, Long ownerId, String action) {
        List<String> current = jdbcTemplate.queryForList(
                "SELECT actions FROM " + table + " WHERE menu_id = ? AND " + ownerColumn + " = ?",
                String.class, menuId, ownerId);
        if (current.isEmpty()) {
            jdbcTemplate.update("INSERT INTO " + table + " (" + ownerColumn + ", menu_id, actions) VALUES (?, ?, ?)",
                    ownerId, menuId, writeActions(Set.of(action)));
            return 1;
        }
        Set<String> target = parseActions(current.get(0));
        if (target.contains(action)) {
            return 0;
        }
        Set<String> union = new LinkedHashSet<>(target);
        union.add(action);
        jdbcTemplate.update("UPDATE " + table + " SET actions = ? WHERE menu_id = ? AND " + ownerColumn + " = ?",
                writeActions(union), menuId, ownerId);
        return 1;
    }

    /**
     * 后置校验：旧锚点上每个持有某动作的主体，新锚点上必须已拿到对应动作。
     * <p>不校验的话镜像漏写没有任何现象，等到注解不再认旧锚点那天才炸成 403，
     * 而且现场已经隔了一个版本，回溯成本极高。
     */
    void verifyAnchorMirror() {
        for (String[] table : GRANT_TABLES) {
            for (String[] rule : ANCHOR_REMAP) {
                assertMirrorRuleApplied(table[0], table[1], rule);
            }
        }
    }

    private void assertMirrorRuleApplied(String table, String ownerColumn, String[] rule) {
        Long fromId = queryMenuIdByKey(rule[0]);
        Long toId = queryMenuIdByKey(rule[2]);
        if (fromId == null || toId == null) {
            return;
        }
        for (Map<String, Object> source : queryGrantees(table, ownerColumn, fromId)) {
            if (!parseActions(source.get("actions")).contains(rule[1])) {
                continue;
            }
            Long ownerId = ((Number) source.get("owner_id")).longValue();
            List<String> targetRaws = jdbcTemplate.queryForList(
                    "SELECT actions FROM " + table + " WHERE menu_id = ? AND " + ownerColumn + " = ?",
                    String.class, toId, ownerId);
            if (targetRaws.isEmpty() || !parseActions(targetRaws.get(0)).contains(rule[3])) {
                throw new IllegalStateException("锚点镜像未生效: " + table + " owner=" + ownerId
                        + " 持有 " + rule[0] + ":" + rule[1] + "，但目标 " + rule[2] + ":" + rule[3] + " 未落地");
            }
        }
    }

    /**
     * 查某菜单上的全部授权主体与动作集。
     * <p>动作集在 Java 里用 parseActions 判包含，不用 SQL 的 LIKE/JSON_CONTAINS：
     * actions 是 text 列，旧数据存在空格与形式差异，LIKE 模式 `%"view"%` 又很容易和
     * `"view_all"` 混淆，解析失败则直接抛而不会当成“没持有”。
     */
    private List<Map<String, Object>> queryGrantees(String table, String ownerColumn, Long menuId) {
        return jdbcTemplate.queryForList(
                "SELECT " + ownerColumn + " AS owner_id, actions FROM " + table + " WHERE menu_id = ?", menuId);
    }

    /**
     * 校验存量锚点当前声明的每个动作都有归宿（菜单已退役时空转）。
     * <p>读的是 {@code sys_menu.actions} 实值而不是种子常量：管理员在「菜单配置」里
     * 给该菜单加了新动作时，映射不完整会直接挡住启动。这看似严厉，但漏项的真正代价发生在
     * 退役那天（持有者静默丢能力且无人报错），拿启动失败换一个可提前看到的原因，值得。
     */
    private void assertAnchorRemapCoversLiveMenu(String menuKey) {
        List<String> raws = jdbcTemplate.queryForList(
                "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0", String.class, menuKey);
        if (raws.isEmpty()) {
            return;
        }
        remapAnchorGrants(menuKey, parseActions(raws.get(0)));
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
     * 授权中心自定义过的，不得把它刷回父菜单的动作集。
     * <p>只在 v3.35 迁移里执行一次（见 {@code GROUP_GRANT_INHERIT_VERSION_KEY}）：
     * 每次启动重放会让“管理员撤销过的子菜单授权”复活。
     */
    void inheritGroupGrants() {
        // 先补新分组自己的授权，再处理叶子继承（顺序不能翻，否则新分组下的叶子无基准可继承）
        for (String[] mapping : GROUP_GRANT_SEED) {
            inheritOneGroup(mapping);
        }
        for (String[] mapping : GROUP_GRANT_INHERIT) {
            inheritOneGroup(mapping);
        }
    }

    /**
     * 授权继承的验收：只校验映射里的父子节点都存在，**不断言授权行**。
     * <p>继承后管理员撤销授权是正常运维动作，把授权行写进验收会让“合法的撤权”变成启动失败。
     */
    void verifyGroupGrantNodes() {
        for (String[][] table : new String[][][]{GROUP_GRANT_SEED, GROUP_GRANT_INHERIT}) {
            for (String[] mapping : table) {
                for (String key : mapping) {
                    if (queryMenuIdByKey(key) == null) {
                        throw new IllegalStateException(key + " 节点不存在，授权继承前提未满足");
                    }
                }
            }
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
        // v3.13 重排后的关键顺序必须真落地
        assertSortEquals("rdm-dashboard-project", 1);
        assertSortEquals("rdm-dashboard-risk", 4);
        assertSortEquals("rdm-resource-load", 3);
        assertSortEquals("rdm-delivery-test", 1);
        assertSortEquals("rdm-dashboard-score", 5);
        /*
         * 進度日報（一级 + 四二级）：sort 与动作集都要实查。
         * <p>缺 trigger 不会报错，只会让非超管在授权中心永远夠不到「手動觸發」，
         * 而该动作正是「漏发后补发」的唯一入口，因此必须进后置校验。
         */
        assertSortEquals(RdmConstants.MENU_DAILY_REPORT_GROUP, 24);
        assertSortEquals(RdmConstants.MENU_DAILY_REPORT_RULE, 1);
        assertSortEquals(RdmConstants.MENU_DAILY_REPORT_TEMPLATE, 2);
        assertSortEquals(RdmConstants.MENU_DAILY_REPORT_RECORD, 3);
        assertSortEquals(RdmConstants.MENU_DAILY_REPORT_TRIGGER, 4);
        assertMenuActionsInclude(RdmConstants.MENU_DAILY_REPORT_RULE, "view", "edit");
        assertMenuActionsInclude(RdmConstants.MENU_DAILY_REPORT_TEMPLATE, "view", "edit");
        assertMenuActionsInclude(RdmConstants.MENU_DAILY_REPORT_RECORD, "view");
        assertMenuActionsInclude(RdmConstants.MENU_DAILY_REPORT_TRIGGER, "view", "trigger");
        /*
         * v3.15 验收：rdm-requirement 的可授集必须等于种子声明的完整集。
         * <p>实查而不是信 UPDATE 回报：勾不到的动作等于不存在的动作，到退役那天才暴露就是降权事故。
         */
        assertMenuActionsInclude("rdm-requirement",
                "view", "create", "edit", "export", "view_all", "dispatch", "contribute");
        // v3.17/v3.20：項目總覽的写权锚点。缺 create/edit/delete 不会报错，只会让非超管
        // 永远勾不到「新增/编辑/暂停项目」，所以它必须和 rdm-requirement 一样进后置校验
        assertMenuActionsInclude(RdmConstants.MENU_DASHBOARD_PROJECT,
                "view", "create", "edit", "delete", "export");
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
        // v3.13 分组结构验收：新增分组必须是纯目录
        assertIsDirectoryGroup("rdm-test-quality-group");
        assertIsDirectoryGroup("rdm-release-accept-group");
        assertIsDirectoryGroup("rdm-pool-group");
    }

    /**
     * 断言菜单行的可授动作集包含给定动作。
     * <p>用「实查行内容」而不是「信 UPDATE 报的成功」：动作集没落库时不会报错，
     * 只会让管理员在授权中心找不到该勾的那一项，到退役旧锚点时才暴露就已是降权事故。
     */
    private void assertMenuActionsInclude(String menuKey, String... actions) {
        List<String> raws = jdbcTemplate.queryForList(
                "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0", String.class, menuKey);
        if (raws.isEmpty()) {
            throw new IllegalStateException(menuKey + " 菜单不存在，无法校验可授动作集");
        }
        Set<String> declared = parseActions(raws.get(0));
        List<String> missing = new java.util.ArrayList<>();
        for (String action : actions) {
            if (!declared.contains(action)) {
                missing.add(action);
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException(menuKey + " 的可授动作集缺少 " + missing + "，授权中心勾不到这些动作");
        }
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
