package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 用车管理（EAM 车辆域）B1 结构迁移：建 7 张 {@code biz_vehicle*} 表 + 编号规则 + 菜单种子。
 *
 * <p>DDL 只在 classpath 脚本 {@code 220_vehicle_core_tables.sql} 存一份
 * （{@code backend/sql/} 下同名文件为参考副本），避免 Java 与 SQL 双份漂移。
 *
 * <p>遵循迁移规范：{@code applyOnce(versionKey, task, verify)} 带后置校验，任务与校验都成功才记版本；
 * 读取或执行失败一律抛出（不吞异常），下次启动自动重试。
 *
 * <p><b>启动顺序（关键）</b>：必须早于 {@code PermissionAnnotationValidator(@Order 30)}，
 * 否则该校验器扫 {@code @RequirePermission} 时 vehicle-* 菜单尚未入库，会误报
 * 「menuKey 在 sys_menu 中不存在，相关接口对非超管全部拒绝」。同时必须晚于
 * {@code DataInitializer(@Order 5)}（需要 asset-management 已存在）与
 * {@code SystemPortalSchemaInitializer(@Order 15)}（需要 sys_menu.system_code 列已存在）。
 * 取 29；菜单排序不受影响，因为 {@code fixAssetMenuGrouping} 只硬设 2~5，
 * 本分组故意落在末位 6。
 *
 * <p><b>菜单归属</b>：车辆业务菜单 = 顶级分组「車輛管理」（{@code parent_id = NULL}，与现在的
 * 耗材管理/資產運營/採購與供應/基礎數據 同层）+ 4 个子菜单，
 * {@code system_code} 显式写 {@code eam}。
 *
 * <p>不能挂在 {@code asset-management} 下：该一级壳已由
 * {@code DataInitializer.retireSystemWrapperDirectories()} 每次启动物理删除（连同软删残留），
 * EAM 各分组已提升为顶级。同理不能依赖 {@code propagateSystemToDescendants} 回填归属，
 * 它在 @Order(15) 只跑一次，早于本初始化器插入菜单，留 NULL 会让门户导航剪枝丢掉整棵子树。
 */
@Slf4j
@Component
@Order(29)
@RequiredArgsConstructor
public class VehicleSchemaMigrationInitializer implements CommandLineRunner {

    /** v1.0：7 张车辆域表 + 4 条编号规则 */
    private static final String VERSION_SCHEMA = "vehicle:schema:v1.0";
    private static final String SCHEMA_SCRIPT = "220_vehicle_core_tables.sql";

    /** v1.1：車輛管理分组 + 4 个业务菜单 + admin 授权 */
    private static final String VERSION_MENU = "vehicle:menu:v1.0";

    private static final String MENU_GROUP = "vehicle-management";

    /**
     * 分组与叶子均用 type=2（二级节点）：与 consumable-ops / eam-procurement 现有口径一致，
     * type=1 仅用于顶级系统菜单。写成三元表达式只会永远落在同一个值，反而误导读代码的人。
     */
    private static final int MENU_TYPE_LEAF = 2;

    private static final String[] TABLES = {
            "biz_vehicle", "biz_vehicle_use", "biz_vehicle_trip",
            "biz_vehicle_driver_qualification", "biz_vehicle_use_department",
            "biz_vehicle_manager", "biz_vehicle_use_event",
    };

    /**
     * 结构后置校验的关键唯一键：缺任意一个都会让并发写入长出重复事实，
     * 所以按硬条件钉住，而不是只验"表存在"。
     */
    private static final String[][] REQUIRED_UNIQUE_KEYS = {
            {"biz_vehicle", "uk_vehicle_active_plate"},
            {"biz_vehicle", "uk_vehicle_active_code"},
            {"biz_vehicle", "uk_vehicle_active_asset"},
            {"biz_vehicle_use", "uk_vehicle_use_no"},
            {"biz_vehicle_use", "uk_vehicle_use_request"},
            {"biz_vehicle_use", "uk_vehicle_use_reservation"},
            {"biz_vehicle_trip", "uk_vehicle_trip_use"},
            {"biz_vehicle_trip", "uk_vehicle_trip_active_vehicle"},
            {"biz_vehicle_trip", "uk_vehicle_trip_active_driver"},
            {"biz_vehicle_use_event", "uk_vehicle_event_request"},
    };

    /**
     * 实体依赖的关键列。
     *
     * <p>只验“表存在 + 唯一键就位”不够：MyBatis-Plus 按实体字段拼 SELECT 列表，
     * 实体多写一个字段或 DDL 漏一个列，都会到第一次查询才爆 bad SQL grammar。
     * 把这几列钉在启动校验里，把“实体与表结构漂移”从运行期故障前动为启动失败。
     */
    private static final String[][] REQUIRED_COLUMNS = {
            {"biz_vehicle", "owner_company_name"},
            {"biz_vehicle", "eam_asset_no"},
            {"biz_vehicle", "allow_direct_register"},
            {"biz_vehicle_use", "approval_outcome"},
            {"biz_vehicle_use", "backfill_entry_at"},
            {"biz_vehicle_trip", "vehicle_condition"},
            {"biz_vehicle_trip", "duration_hours"},
            // 实体声明了 backfillEntryAt 但初版 DDL 漏建，浏览器端到端测试里“能写不能读”
            // （写入时 null 被省略、读取时列不存在直接报错），此类漂移必须列入启动必验集
            {"biz_vehicle_trip", "backfill_entry_at"},
    };

    /**
     * 脚本建表后需补建的列与索引。
     *
     * <p>为什么单独列出来而不是只写在 DDL 里：DDL 是 CREATE TABLE IF NOT EXISTS，
     * 表已存在时整条语句不再生效，早期版本建立的库不会自动获得新列/新索引；
     * 先查后加能让两种情况收敛到同一结构。
     */
    private static final String[][] REQUIRED_ADDED_COLUMNS = {
            {"biz_vehicle_trip", "backfill_entry_at",
                    "ADD COLUMN backfill_entry_at DATETIME NULL COMMENT '事后补录时的系统登记时间；正常流程为 NULL' AFTER flags"},
    };

    private static final String[][] REQUIRED_INDEXES = {
            {"biz_vehicle_use", "uk_vehicle_use_reservation",
                    "ADD UNIQUE KEY uk_vehicle_use_reservation (active_reservation_vehicle)"},
            // 超时未还统计：status IN ('in_use','to_confirm') AND planned_end < NOW()。
            // 已有的 idx_vehicle_use_status 第二列是 planned_start，定不住 planned_end，
            // 待办统计改成服务端出数后这条 COUNT 每次进页面都要跑，必须能走索引区间
            {"biz_vehicle_use", "idx_vehicle_use_overdue",
                    "ADD INDEX idx_vehicle_use_overdue (status, planned_end)"},
    };

    private static final String[] SEQ_RULES = {
            BizSeqService.RULE_VEHICLE, BizSeqService.RULE_VEHICLE_USE,
    };

    /**
     * 每次启动同步编号规则的展示元数据（幂等 UPSERT）。
     *
     * <p>为什么不只靠脚本里的 INSERT IGNORE：那条语句写在 applyOnce 的脚本里，版本已记录的库
     * 不会重跑；且 INSERT IGNORE 对已存在的行什么都不做。不补这一步，旧行会永远停在
     * biz_menu/remark 为空、前缀还是 ZC/BL 的状态，规则菜单里既认不出也查不到依据。
     */
    private static final String[][] SEQ_RULE_SYNC = {
            // rule_key, rule_name, prefix, date_format, status, remark
            {"vehicle", "車輛編號", "VH", "", "1", "{prefix} + {n}位固定序號（無日期維度，全局自增）"},
            {"vehicle_use", "用車單號", "YC", "YYYYMMDD", "1",
                    "{prefix} + YYYYMMDD + {n}位自增序號；審批用車/直接登記/事後補錄共用同一序列"},
            {"vehicle_use_direct", "直接登記用車單號（已废弃）", "ZC", "YYYYMMDD", "0",
                    "已废弃：直接登记改用 vehicle_use（YC），避免多序列同前缀撞单号"},
            {"vehicle_use_backfill", "補錄用車單號（已废弃）", "BL", "YYYYMMDD", "0",
                    "已废弃：补录改用 vehicle_use（YC），路径区分由 source 列与「來源」列承担"},
    };

    /** 规则归属的业务菜单名（与既有规则同一命名风格：系统-模块） */
    private static final String SEQ_RULE_BIZ_MENU = "物資管理-車輛管理";

    /** 各菜单的授权动作（与前端 PERMISSION_ACTIONS 的取值集合一致） */
    private static final String ACTIONS_FILES = "[\"view\",\"create\",\"edit\",\"export\"]";
    private static final String ACTIONS_DISPATCH = "[\"view\",\"edit\"]";
    private static final String ACTIONS_LEDGER = "[\"view\",\"create\",\"edit\",\"export\"]";
    private static final String ACTIONS_MY_USE = "[\"view\",\"create\"]";

    /** 供 admin 授权与后置校验遍历的叶子菜单定义 */
    private static final String[][] MENUS = {
            {"vehicle-files", "車輛檔案", "Vehicle Management", "", "", "", "1", ACTIONS_FILES},
            {"vehicle-dispatch", "用車辦理", "", "", "", "", "2", ACTIONS_DISPATCH},
            {"vehicle-ledger", "用車台賬", "", "", "", "", "3", ACTIONS_LEDGER},
            {"my-vehicle-use", "我的用車", "", "", "", "", "4", ACTIONS_MY_USE},
    };

    private static final String GROUP_ACTIONS = "[\"view\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        versionTracker.applyOnce(VERSION_MENU, this::doMenuMigrate, this::verifyMenus);
        // 幂等修复与必验列必须放在 applyOnce 外面：版本已记录的库会整体跳过 task，
        // 如果把补列写在 task 里，新加的列在任何跑过 v1.0 的环境上永远不生效
        // （本轮端到端测试就是这么踩到 biz_vehicle_trip.backfill_entry_at 漏建的）。
        repairSchema();
        verifyColumns();
        syncSeqRules();
    }

    /** 把用车相关编号规则的归属菜单、拼接说明与前缀收敛到当前口径 */
    private void syncSeqRules() {
        for (String[] r : SEQ_RULE_SYNC) {
            int updated = jdbcTemplate.update(
                    "UPDATE sys_biz_seq_rule SET rule_name = ?, biz_menu = ?, prefix = ?, date_format = ?, "
                            + "seq_length = 4, status = ?, remark = ?, updated_at = NOW() WHERE rule_key = ?",
                    r[1], SEQ_RULE_BIZ_MENU, r[2], r[3], Integer.parseInt(r[4]), r[5], r[0]);
            if (updated == 0) {
                jdbcTemplate.update(
                        "INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                                + "seq_length, seq_start, status, remark) VALUES (?, ?, ?, ?, ?, 4, 1, ?, ?)",
                        r[0], r[1], SEQ_RULE_BIZ_MENU, r[2], r[3], Integer.parseInt(r[4]), r[5]);
            }
        }
        log.info("用車編號規則已同步: {} 條（vehicle_use 統一 YC，废弃规则已置 status=0）", SEQ_RULE_SYNC.length);
    }

    /** 每次启动把“实体声明了但库里没有”的列/索引补齐（先查后加，可重复执行） */
    private void repairSchema() {
        for (String[] col : REQUIRED_ADDED_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + col[0] + " " + col[2]);
            log.info("已补建用车列: {}.{}", col[0], col[1]);
        }
        for (String[] idx : REQUIRED_INDEXES) {
            if (indexExists(idx[0], idx[1])) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + idx[0] + " " + idx[2]);
            log.info("已补建用车索引: {}.{}", idx[0], idx[1]);
        }
    }

    /** 每次启动校验实体依赖的列都在位：把“能写不能读”提前到启动失败 */
    private void verifyColumns() {
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1]
                        + " 列缺失且自动补建未生效，请检查库账号是否有 ALTER 权限");
            }
        }
    }

    /* ==================== 1. 表结构 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("用车管理建表脚本已执行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
    }

    /**
     * 后置校验不写死列类型，而是钉住三件真正会让业务失真的结构：
     * 表存在、关键唯一键就位、编号规则就绪。缺任一都让启动大声失败，
     * 而不是等到并发写入长出重复行程或报「編號生成規則未配置」才发现。
     */
    private void verifySchema() {
        for (String table : TABLES) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪，用车域无法写入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，并发下会长出重复车辆档案/用车单/活动行程占用");
            }
        }
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1]
                        + " 列缺失，实体按字段拼 SELECT 会在首次查询时报 bad SQL grammar");
            }
        }
        for (String rule : SEQ_RULES) {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND status = 1",
                    Integer.class, rule);
            if (n == null || n == 0) {
                throw new IllegalStateException("编号规则 " + rule + " 未就绪（缺失时建单必报「編號生成規則未配置」）");
            }
        }
    }

    /* ==================== 2. 菜单种子 ==================== */

    private void doMenuMigrate() {
        // 物资管理的一级壳 asset-management 已退役，EAM 各分组均为 parent_id=NULL 的顶级菜单，
        // 因此車輛管理也建为顶级（sort=6，接在基礎數據之后），不能去找也不存在的父菜单。
        // system_code 历史上允许为 NULL，同样不能走 findFirst（null 元素会抛 NPE）
        String inferred = firstOrNull(jdbcTemplate.queryForList(
                "SELECT system_code FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0 LIMIT 1",
                String.class));
        String systemCode = inferred == null ? SystemCode.EAM.code() : inferred;

        // sort=5：与「基礎數據」互换位置（基础数据让到末位 6）。DataInitializer
        // .fixAssetMenuGrouping 每次启动硬设 耗材2/资产运营3/采购4/基础数据6，
        // 这里必须与它一致，否则两边互相顶来顶去
        Long groupId = ensureMenu(null, MENU_GROUP, "車輛管理",
                "", "", "CarOutlined", 5, GROUP_ACTIONS, "Vehicle Management", systemCode);
        if (groupId == null) {
            throw new IllegalStateException("車輛管理分组创建失败");
        }
        // 四个子菜单必须逐条以字面量参数调用：check-menu-consistency.mjs 的正则只识别
        // ensureMenu(变量, "key", "名称", "/path", "Component", "Icon", ...) 这种字面量形式，
        // 写成数组循环会让新菜单逸出门禁（看似绿了，其实根本没被校）。
        ensureMenu(groupId, "vehicle-files", "車輛檔案", "/vehicle-files",
                "VehicleFiles", "TruckOutlined", 1, ACTIONS_FILES, "Vehicle Files", systemCode);
        ensureMenu(groupId, "vehicle-dispatch", "用車辦理", "/vehicle-dispatch",
                "VehicleDispatch", "CarryOutOutlined", 2, ACTIONS_DISPATCH, "Vehicle Dispatch", systemCode);
        ensureMenu(groupId, "vehicle-ledger", "用車台賬", "/vehicle-ledger",
                "VehicleLedger", "CompassOutlined", 3, ACTIONS_LEDGER, "Vehicle Ledger", systemCode);
        ensureMenu(groupId, "my-vehicle-use", "我的用車", "/my-vehicle-use",
                "MyVehicleUse", "LoginOutlined", 4, ACTIONS_MY_USE, "My Vehicle Use", systemCode);

        grantAdmin();
        // 系统准入与菜单授权是两条线：车辆菜单归 eam，员工若只有 eam 菜单授权而无 eam 系统准入，
        // 门户导航剪枝会把整棵车辆子树丢掉。admin 在权限层直通，这里补齐非超管兜底。
        permissionService.evictAll();
        log.info("用車管理菜單已就緒（1 分组 + {} 子菜单，system_code={}）", MENUS.length, systemCode);
    }

    /**
     * 建菜单（已存在则校正父级/类型/门户域/排序/图标），返回 menu id。
     *
     * <p>方法名与前 8 个参数的顺序（parentId, menuKey, name, path, component, icon, sortOrder, actions）
     * 刻意与 {@code ConsumableSchemaInitializer.ensureMenu} 保持一致：前端
     * {@code scripts/check-menu-consistency.mjs} 正是按这个签名反射扫域初始化器声明的菜单，
     * 并逐项要求 keyToPath / App 路由 / BACKEND_CONNECTED_KEYS / ROUTE_MENU_KEY_MAP /
     * CONTROLLED_MENU_KEYS / MenuIcon 注册 / Sidebar 兜底图标对齐。
     * 自己另起方法名或打乱参数序，新菜单就会逸出门禁——等于绕过自家校验。
     * nameEn 与 systemCode 放在尾部，不影响前 6 位的正则匹配。
     */
    private Long ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions,
                            String nameEn, String systemCode) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            // 同 key 的逻辑删除行会占住 uk_menu_key，先物理清理软删残留再插入
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon,
                    MENU_TYPE_LEAF, sortOrder, actions, systemCode);
            id = queryMenuId(menuKey);
            log.info("已創建用車菜單: {} ({})", name, menuKey);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, name = ?, path = ?, component = ?, icon = ?, "
                            + "system_code = ?, sort_order = ?, status = 1, deleted = 0, updated_by = 'system' "
                            + "WHERE id = ?",
                    parentId, name, path, component, icon, systemCode, sortOrder, id);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                    nameEn, id);
        }
        return id;
    }

    /**
     * admin 角色授权：actions 必须非空，前端受控菜单在 actions 为空时会整项隐藏。
     * 分两步（INSERT IGNORE + 补空 UPDATE），不用 INSERT...SELECT + ON DUPLICATE，
     * 后者在 MySQL 8 会因同名列报 1052 ambiguous。
     */
    private void grantAdmin() {
        Long adminRoleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳过用車菜單授權");
            return;
        }
        upsertGrant(adminRoleId, MENU_GROUP, GROUP_ACTIONS);
        for (String[] m : MENUS) {
            upsertGrant(adminRoleId, m[0], m[7]);
        }
    }

    private void upsertGrant(Long roleId, String menuKey, String actions) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            return;
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    /**
     * 后置校验：菜单存在且父级、门户系统域、授权动作都到位。
     * 只验"有这一行"不够——父级错挂会让菜单出现在别的系统树里，静默且难查。
     */
    private void verifyMenus() {
        Long groupId = queryMenuId(MENU_GROUP);
        if (groupId == null) {
            throw new IllegalStateException("車輛管理分组未就緒");
        }
        // 顶级分组：parent 必须为 NULL（挂错层会让菜单出现在另一棵树上，静默且难查）
        if (parentOf(MENU_GROUP) != null) {
            throw new IllegalStateException("車輛管理分组应为顶级菜单，实际 parent_id=" + parentOf(MENU_GROUP));
        }
        if (!"eam".equals(systemCodeOf(MENU_GROUP))) {
            throw new IllegalStateException("車輛管理分组 system_code 非 eam，门户导航剪枝会丢掉整棵车辆子树");
        }
        for (String[] m : MENUS) {
            Long id = queryMenuId(m[0]);
            if (id == null) {
                throw new IllegalStateException("用車菜單未就緒: " + m[0]);
            }
            if (!groupId.equals(parentOf(m[0]))) {
                throw new IllegalStateException("用車菜單父級錯誤: " + m[0]);
            }
            if (!"eam".equals(systemCodeOf(m[0]))) {
                throw new IllegalStateException("用車菜單 system_code 非 eam: " + m[0]);
            }
        }
    }

    /* ==================== 3. 通用工具 ==================== */

    /** 逐条执行 classpath 脚本；读不到或执行失败一律抛出，交 applyOnce 记失败并在下次启动重试 */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + script + "，用车域表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("读取建表脚本失败 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    /** 列是否存在（MySQL 8 无 ADD COLUMN IF NOT EXISTS，先查后加是唯一安全的写法） */
    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean indexExists(String table, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        return count != null && count > 0;
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    private Long parentOf(String menuKey) {
        // 顶级菜单的 parent_id 就是 NULL，而 Stream.findFirst() 对 null 元素会直接抛 NPE，
        // 所以这里必须用 list.get(0) 取可空值，不能走 findFirst().orElse(null)
        return firstOrNull(jdbcTemplate.queryForList(
                "SELECT parent_id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey));
    }

    private String systemCodeOf(String menuKey) {
        return firstOrNull(jdbcTemplate.queryForList(
                "SELECT system_code FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", String.class, menuKey));
    }

    /** 取单列查询的首行值；无行与值为 NULL 统一返回 null（queryForList 会把 NULL 装进列表，而 findFirst 不行） */
    private static <T> T firstOrNull(java.util.List<T> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }
}
