package com.mftb.admin.config;

import com.mftb.admin.constant.MeetingConstants;
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
import java.util.ArrayList;
import java.util.List;

/**
 * 会议管理（meeting）B1 迁移：5 张 {@code biz_meeting*} 表 + 会议室菜单种子 + 全局规则与通知场景。
 *
 * <p>DDL 只在 classpath 脚本 {@code 230_meeting_core_tables.sql} 存一份
 * （{@code backend/sql/} 下同名文件为参考副本，由结构锁用例断言逐字一致），避免 Java 与 SQL 双份漂移。
 *
 * <p>三个版本键的分工：
 * <ul>
 *   <li>{@code meeting:schema:v1.0}：建表 + 后置校验（表存在、关键唯一键就位、实体依赖列存在）；</li>
 *   <li>{@code meeting:menu:v1.0}：「會議管理」分组 + 4 个 M1 菜单 + admin 授权 + 系统准入反推；</li>
 *   <li>{@code meeting:seed:v1.0}：全局预约规则、编号规则、通知场景三条——这些是"即使表建好了、
 *       没配规则与场景就等于功能不可用"的必需品，单独成键便于失败后只重试这一步。</li>
 * </ul>
 *
 * <p><b>启动顺序</b>：取 28，必须早于 {@code PermissionAnnotationValidator(@Order 30)}
 * （否则控制器上的 meeting-* 菜单还没入库，会误报"接口对非超管全部拒绝"），
 * 并晚于 {@code SystemPortalSchemaInitializer(@Order 15)}（{@code sys_menu.system_code} 列与 sys_system 行就绪）。
 *
 * <p><b>菜单归属</b>：{@code system_code} 显式写 {@code meeting}。
 * {@code propagateSystemToDescendants} 只在门户底座迁移那一次运行，晚于本初始化器插入的菜单留 NULL
 * 会让门户导航剪枝与系统准入落到未定义行为（菜单静默消失比报错更难查）。
 */
@Slf4j
@Component
@Order(28)
@RequiredArgsConstructor
public class MeetingSchemaMigrationInitializer implements CommandLineRunner {

    static final String VERSION_SCHEMA = "meeting:schema:v1.0";
    static final String VERSION_MENU = "meeting:menu:v1.0";
    static final String VERSION_SEED = "meeting:seed:v1.0";
    /** M2：周期系列 + 黑名单两张表、预约单 cancel_scope 补列 */
    static final String VERSION_SCHEMA_M2 = "meeting:schema:v1.1";
    /** M2：給「會議管理」分組補上「預約規則」菜單 */
    static final String VERSION_MENU_M2 = "meeting:menu:v1.1";
    /**
     * 一级菜单重构：把 5 个叶子从单一「會議管理」分组拆成「會議中心」（使用侧）与「會議治理」（行政侧）。
     *
     * <p>为什么单独一个版本键：v1.0/v1.1 已记录的库不会重跑各自的 task，
     * 把新分组写进旧 task 里，真实环境永远不会出现（用车域踩过同一个坑）。
     * 本版本执行后，v1.0/v1.1 的 verify 里"5 个叶子都挂在 MENU_GROUP 下"的断言即被本版本取代，
     * 那两个 verify 只在各自版本键首次落地时运行，不会回头校验旧形态。
     */
    static final String VERSION_MENU_V12 = "meeting:menu:v1.2";
    /**
     * 种子文案修正：230 脚本里示例房间的位置描述误写简体「走廊尽头」。
     *
     * <p>为什么要单独一个版本键而不是只改脚本：CREATE TABLE ... 与种子 INSERT 都只在首次落地时执行，
     * 已经跑过 seed:v1.0 的库不会重读脚本，只改 SQL 文件等于永远修不上已有环境。
     * UPDATE 带旧值作条件，因此管理员在界面上改过位置描述的房间不会被覆盖。
     */
    static final String VERSION_SEED_V11 = "meeting:seed:v1.1";

    private static final String SCHEMA_SCRIPT = "230_meeting_core_tables.sql";
    private static final String SCHEMA_SCRIPT_M2 = "231_meeting_series_blacklist.sql";

    private static final String SYSTEM_CODE = SystemCode.MEETING.code();
    private static final String ADMIN_ROLE_CODE = "admin";
    private static final int MENU_TYPE_LEAF = 2;
    /** 分组用 type=1：与考勤 v2 分组同口径，顶级叶子用 2 */
    private static final int MENU_TYPE_GROUP = 1;

    private static final String MENU_GROUP = "meeting-management";
    /** 治理侧一级菜单（v1.2 新增）；图标 MonitorOutlined 已核对 sys_menu 现有菜单无重复 */
    private static final String MENU_GROUP_ADMIN = "meeting-admin";

    private static final String[] TABLES = {
            "biz_meeting_room", "biz_meeting_booking", "biz_meeting_attendee",
            "biz_meeting_event", "biz_meeting_notify_log",
    };

    /** M2 新增两张表（单独一组：v1.0 的校验必须能在 M2 脚本之前独立通过） */
    private static final String[] TABLES_M2 = {"biz_meeting_series", "biz_meeting_blacklist"};

    private static final String[][] REQUIRED_UNIQUE_KEYS_M2 = {
            {"biz_meeting_series", "uk_meeting_series_no"},
            {"biz_meeting_series", "uk_meeting_series_request"},
            {"biz_meeting_blacklist", "uk_meeting_blacklist_active"},
    };

    /**
     * 每次启动补建的列与索引（先查后加）。
     * <p>每条都是 {表, 对象名, DDL 片段}；列与索引分开两张表是因为
     * information_schema 的查询位置不同（COLUMNS 与 STATISTICS），不能共用一个存在性判断。
     */
    private static final String[][] REQUIRED_ADDED_COLUMNS = {
            {"biz_meeting_booking", "cancel_scope",
                    "ADD COLUMN cancel_scope VARCHAR(16) NULL COMMENT '取消範圍：this/future/all（周期會議三檔取消語義留痕）' AFTER cancel_reason"},
    };

    private static final String[][] REQUIRED_INDEXES = {
            {"biz_meeting_booking", "idx_meeting_booking_cancel_scope",
                    "ADD INDEX idx_meeting_booking_cancel_scope (cancel_scope)"},
            {"biz_meeting_attendee", "idx_meeting_attendee_notify",
                    "ADD INDEX idx_meeting_attendee_notify (booking_id, notify_status)"},
    };

    /**
     * 并发正确性完全依赖的唯一键集合。
     *
     * <p>缺任意一个的方向性后果都写在提示里：房间窗口唯一键缺失=同一间房同一时段可被订两次；
     * 幂等键缺失=重复点击长出两场会；投递去重键缺失=提醒 Job 每轮给全员重发一遍。
     */
    private static final String[][] REQUIRED_UNIQUE_KEYS = {
            {"biz_meeting_room", "uk_meeting_room_no"},
            {"biz_meeting_booking", "uk_meeting_booking_no"},
            {"biz_meeting_booking", "uk_meeting_booking_request"},
            {"biz_meeting_booking", "uk_meeting_booking_slot"},
            {"biz_meeting_attendee", "uk_meeting_attendee"},
            {"biz_meeting_event", "uk_meeting_event_request"},
            {"biz_meeting_notify_log", "uk_meeting_notify_dedup"},
    };

    /**
     * 实体依赖的列。
     *
     * <p>MyBatis-Plus 按实体字段拼 SELECT 列表：实体有字段而库里没列，表现是"能写不能读"
     * （写入时 null 被省略，读取时按列名拼 SELECT 直接报 bad SQL grammar）。
     * 把这类漂移钉进启动校验，而不是等用户打开列表页才发现。
     */
    private static final String[][] REQUIRED_COLUMNS = {
            {"biz_meeting_room", "floor_code"},
            {"biz_meeting_room", "hide_title"},
            {"biz_meeting_room", "checkin_required"},
            {"biz_meeting_room", "release_after_minutes"},
            {"biz_meeting_room", "admin_user_ids"},
            {"biz_meeting_room", "approval_required"},
            {"biz_meeting_room", "bookable_start_time"},
            {"biz_meeting_room", "bookable_end_time"},
            {"biz_meeting_booking", "delegate_for_id"},
            {"biz_meeting_booking", "delegate_for_name"},
            {"biz_meeting_booking", "series_id"},
            {"biz_meeting_booking", "series_seq"},
            {"biz_meeting_booking", "approval_outcome"},
            {"biz_meeting_booking", "flow_no"},
            {"biz_meeting_booking", "external_attendees"},
            {"biz_meeting_booking", "online_meeting_url"},
            {"biz_meeting_booking", "no_show_flag"},
            {"biz_meeting_booking", "release_by_id"},
            {"biz_meeting_booking", "checkin_by"},
            {"biz_meeting_booking", "request_hash"},
            {"biz_meeting_booking", "biz_url"},
            {"biz_meeting_attendee", "notify_note"},
            {"biz_meeting_attendee", "invalid_reason"},
            {"biz_meeting_attendee", "checkin_at"},
            {"biz_meeting_event", "request_key"},
            {"biz_meeting_event", "operator_emp_no"},
            {"biz_meeting_event", "room_id"},
            {"biz_meeting_notify_log", "receiver_dingtalk_id"},
            {"biz_meeting_notify_log", "next_retry_at"},
            {"biz_meeting_notify_log", "scenario"},
            {"biz_meeting_booking", "cancel_scope"},
            {"biz_meeting_series", "generated_count"},
            {"biz_meeting_series", "skipped_count"},
            {"biz_meeting_series", "attendee_json"},
            {"biz_meeting_series", "cancelled_scope"},
            {"biz_meeting_blacklist", "no_show_count"},
            {"biz_meeting_blacklist", "source"},
            {"biz_meeting_attendee", "checkin_at"},
    };

    /** M1 菜单：{key, 中文名, 英文名, path, component, icon, 组内 sort, actions} */
    private static final String[][] MENUS = {
            {MeetingConstants.MENU_MY, "我的會議", "My Meetings",
                    "/meeting-my", "MyMeeting", "UsergroupAddOutlined", "1",
                    MeetingConstants.ACTIONS_VIEW_EDIT},
            {MeetingConstants.MENU_BOOKING, "會議室預約", "Room Booking",
                    "/meeting-booking", "RoomBooking", "PlusSquareOutlined", "2",
                    MeetingConstants.ACTIONS_VIEW_EDIT},
            {MeetingConstants.MENU_ROOM, "會議室檔案", "Meeting Rooms",
                    "/meeting-room", "RoomFiles", "LayoutOutlined", "3",
                    MeetingConstants.ACTIONS_ROOM},
            {MeetingConstants.MENU_RECORD, "預約記錄", "Booking Records",
                    "/meeting-record", "BookingRecords", "BookOutlined", "4",
                    MeetingConstants.ACTIONS_VIEW_EDIT},
    };

    private static final String GROUP_ACTIONS = "[\"view\"]";

    /** M2 新增菜单：預約規則（规则 Tab + 黑名单 Tab），挂在同一分组下 */
    private static final String MENU_CONFIG_KEY = "meeting-config";

    /** 通知场景：{scenario_key, 触发点说明}；enabled 一律 0，由行政在通知配置里绑定应用后再开 */
    private static final String[][] NOTIFY_SCENARIOS = {
            {MeetingConstants.SCENARIO_INVITE, "meeting-b1"},
            {MeetingConstants.SCENARIO_REMIND, "meeting-b1"},
            {MeetingConstants.SCENARIO_OPS, "meeting-b1"},
    };

    /** 全局默认规则：与脚本里的 INSERT IGNORE 同一张表，这里负责把描述文案刷回当前口径 */
    private static final String[][] CONFIG_DEFAULTS = {
            {MeetingConstants.CFG_ADVANCE_DAYS, "30", "最可提前預約天數"},
            {MeetingConstants.CFG_MIN_LEAD_MINUTES, "0", "最少需提前多少分鐘預約（0=允許即時預約）"},
            {MeetingConstants.CFG_DEFAULT_DURATION, "60", "新建預約的默認時長（分鐘）"},
            {MeetingConstants.CFG_MAX_DURATION, "240", "單場會議最長時長（分鐘）"},
            {MeetingConstants.CFG_TIME_GRANULARITY, "15", "預約時間粒度（分鐘）"},
            {MeetingConstants.CFG_BOOKABLE_START, "08:00", "每日默認可預約起始時間"},
            {MeetingConstants.CFG_BOOKABLE_END, "22:00", "每日默認可預約結束時間"},
            {MeetingConstants.CFG_REMIND_MINUTES, "15", "會議開始前多少分鐘發提醒"},
            {MeetingConstants.CFG_CHECKIN_OPEN_MINUTES, "5", "允許提前多少分鐘簽到"},
            {MeetingConstants.CFG_RELEASE_AFTER, "15", "開始後未簽到多少分鐘自動釋放"},
            {MeetingConstants.CFG_NO_SHOW_THRESHOLD, "3", "近30天爽約達該次數則自動限制預約（0=不自動拉黑）"},
            {MeetingConstants.CFG_BLACKLIST_DAYS, "7", "自動限制預約的天數"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;
    private final BizSeqService bizSeqService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        versionTracker.applyOnce(VERSION_MENU, this::doMenuMigrate, this::verifyMenus);
        versionTracker.applyOnce(VERSION_SEED, this::doSeed, this::verifySeed);
        versionTracker.applyOnce(VERSION_SCHEMA_M2, this::doSchemaMigrateM2, this::verifySchemaM2);
        versionTracker.applyOnce(VERSION_MENU_M2, this::doMenuMigrateM2, this::verifyMenusM2);
        versionTracker.applyOnce(VERSION_MENU_V12, this::doMenuRestructure, this::verifyMenuRestructure);
        versionTracker.applyOnce(VERSION_SEED_V11, this::doSeedCopyFix, this::verifySeedCopyFix);
        // 移出 applyOnce 的部分每次启动重放：版本已记录的库不会重跑 task，
        // 编号规则/场景/配置的展示元数据若只写在 task 里，改动永远不会落到已有环境
        syncSeqRule();
        syncNotificationScenarios();
        // 补列必须放在 applyOnce 之外：CREATE TABLE IF NOT EXISTS 对已存在的表整体失效，
        // 只在 231 脚本里写 ADD COLUMN 的话，跑过 v1.1 的库再也拿不到后来新增的列
        repairSchema();
        bizSeqService.refreshRules();
        verifyColumns();
    }

    /* ==================== 1. 表结构 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("會議管理建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，會議域無法寫入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下會長出重複預約/重複軌跡/重複推送");
            }
        }
        // 此处绝不可调 verifyColumns()：REQUIRED_COLUMNS 覆盖 38 列，其中 cancel_scope 要等 231
        // 补列、biz_meeting_series / biz_meeting_blacklist 的 6 列要等 231 建表，v1.0 任务刚跑完时
        // 它们必然还不存在。开发库因 v1.0 早已记版本、applyOnce 直接 return，这个顺序错误从未暴露；
        // 生产全新库上它会让 v1.0 永远记不上版本 → 每次启动重跑重败 → Pod 崩溃循环（2026-10-14 实际踩过）。
        // 全量列校验统一由 run() 末尾的 verifyColumns() 承担：那时 repairSchema() 已补完列，
        // 且它每次启动都跑、不受 applyOnce 门控，覆盖面比塞进 v1.0 后置校验更严格。
        // 该不变量由 MeetingSchemaVerifyOrderingTest 钉住。
    }

    /** 实体列必验：每次启动都跑（新加字段在任何已跑过 v1.0 的环境上都要立刻暴露缺列） */
    private void verifyColumns() {
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1]
                        + " 列缺失，實體按字段拼 SELECT 會在首次查詢時報 bad SQL grammar");
            }
        }
    }

    /* ==================== 2. 菜单种子 ==================== */

    private void doMenuMigrate() {
        Long groupId = ensureGroup();
        if (groupId == null) {
            throw new IllegalStateException("會議管理分組創建失敗");
        }
        Long nullParent = groupId;
        // 四个子菜单必须逐条以字面量参数调用：scripts/check-menu-consistency.mjs 的正则只识别
        // ensureMenu(变量, "key", "名称", "/path", "Component", "Icon", ...) 这种字面量形态，
        // 写成数组循环会让这批新菜单落在主种子门禁盲区（看似绿了，其实一项都没被校验）
        ensureMenu(nullParent, "meeting-my", "我的會議", "/meeting-my",
                "MyMeeting", "UsergroupAddOutlined", 1, MeetingConstants.ACTIONS_VIEW_EDIT,
                "My Meetings");
        ensureMenu(nullParent, "meeting-booking", "會議室預約", "/meeting-booking",
                "RoomBooking", "PlusSquareOutlined", 2, MeetingConstants.ACTIONS_VIEW_EDIT,
                "Room Booking");
        ensureMenu(nullParent, "meeting-room", "會議室檔案", "/meeting-room",
                "RoomFiles", "LayoutOutlined", 3, MeetingConstants.ACTIONS_ROOM,
                "Meeting Rooms");
        ensureMenu(nullParent, "meeting-record", "預約記錄", "/meeting-record",
                "BookingRecords", "BookOutlined", 4, MeetingConstants.ACTIONS_VIEW_EDIT,
                "Booking Records");

        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("會議管理菜單已就緒（1 分組 + {} 子菜單，system_code={}）", MENUS.length, SYSTEM_CODE);
    }

    /**
     * 创建或对齐「會議管理」顶级分组。
     *
     * <p>顶级排序取"当前顶级菜单最大 sort + 10"而不是写死数字：写死会与后续新增的系统互相顶，
     * 且管理员在菜单配置里调过顺序后启动重放会把他的调整打回去。仅在首次插入时定价，
     * 已存在的行不动 sort。
     */
    private Long ensureGroup() {
        Long id = queryMenuId(MENU_GROUP);
        if (id != null) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET type = ?, icon = ?, system_code = ?, parent_id = NULL, status = 1, "
                            + "deleted = 0, updated_by = 'system' WHERE id = ?",
                    MENU_TYPE_GROUP, "VideoCameraOutlined", SYSTEM_CODE, id);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                    "Meeting Management", id);
            return id;
        }
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", MENU_GROUP);
        Integer maxSort = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(sort_order), 0) FROM sys_menu WHERE deleted = 0 AND parent_id IS NULL",
                Integer.class);
        int sortOrder = (maxSort == null ? 0 : maxSort) + 10;
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, type, icon, sort_order, actions, "
                        + "status, system_code, updated_by, deleted) "
                        + "VALUES (NULL, ?, ?, ?, ?, ?, ?, '', 1, ?, 'system', 0)",
                MENU_GROUP, "會議管理", "Meeting Management", MENU_TYPE_GROUP,
                "VideoCameraOutlined", sortOrder, SYSTEM_CODE);
        log.info("已創建會議管理分組: sort={}", sortOrder);
        return queryMenuId(MENU_GROUP);
    }

    /**
     * 新增或对齐叶子菜单。
     *
     * <p>方法名与前 8 个参数的顺序（parentId, menuKey, name, path, component, icon, sortOrder, actions）
     * 刻意与 {@code AttendanceMenuInitializer}/{@code VehicleSchemaMigrationInitializer} 一致：
     * {@code scripts/check-menu-consistency.mjs} 按这个签名反射扫描域初始化器声明的菜单，
     * 并逐项要求 keyToPath / App 路由 / CONTROLLED_MENU_KEYS / ROUTE_MENU_KEY_MAP / MenuIcon 对齐。
     * 名字与参数序自创，新菜单就逸出门禁。
     */
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
            log.info("已創建會議菜單: {} ({})", name, menuKey);
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

    /** admin 授权：actions 为空时前端受控菜单会整项隐藏，超管也看不到入口 */
    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過會議菜單授權");
            return;
        }
        upsertGrant(adminRoleId, MENU_GROUP, GROUP_ACTIONS);
        for (String[] m : MENUS) {
            upsertGrant(adminRoleId, m[0], m[7]);
        }
    }

    /** 两步写（INSERT IGNORE + 补空 UPDATE）：MySQL 8 的 INSERT...SELECT + ON DUPLICATE 会报 1052 */
    private void upsertGrant(Long roleId, String menuKey, String actions) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            throw new IllegalStateException("菜單落地後仍查不到 menu_key=" + menuKey);
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        // 只对空动作补默认值：管理员在授权中心主动收窄过的动作集不得被启动重放扩回去
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    /** 菜单授权与系统准入是两条线：只有 meeting 菜单授权而没有系统准入，门户剪枝会丢掉整棵子树 */
    private void deriveSystemAccess() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, ? FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = ? "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1 "
                        + "WHERE r.code <> ?",
                SYSTEM_CODE, SYSTEM_CODE, ADMIN_ROLE_CODE);
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, ? FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = ?",
                SYSTEM_CODE, SYSTEM_CODE);
    }

    private void verifyMenus() {
        Integer groupOk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                        + "AND system_code = ? AND parent_id IS NULL AND type = ?",
                Integer.class, MENU_GROUP, SYSTEM_CODE, MENU_TYPE_GROUP);
        if (groupOk == null || groupOk == 0) {
            throw new IllegalStateException("會議管理分組未就緒（需为顶级且 system_code=meeting）");
        }
        Long groupId = queryMenuId(MENU_GROUP);
        List<String> missing = new ArrayList<>();
        for (String[] m : MENUS) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND parent_id = ?",
                    Integer.class, m[0], SYSTEM_CODE, groupId);
            if (ok == null || ok == 0) {
                missing.add(m[0]);
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("會議菜單未就緒（缺失/父级/归属/启用态不符）: " + missing);
        }
        Integer grants = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.system_code = ? AND m.deleted = 0",
                Integer.class, ADMIN_ROLE_CODE, SYSTEM_CODE);
        int expected = MENUS.length + 1;
        if (grants == null || grants < expected) {
            throw new IllegalStateException("admin 角色未補齊會議菜單授權: 實際 " + grants + " 條，期望 >= " + expected);
        }
    }

    /* ==================== 3. 规则 / 编号 / 通知场景 ==================== */

    private void doSeed() {
        syncSeqRule();
        syncConfigDefaults();
        syncNotificationScenarios();
        bizSeqService.refreshRules();
    }

    private void verifySeed() {
        Integer seq = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND status = 1",
                Integer.class, MeetingConstants.SEQ_BOOKING);
        if (seq == null || seq == 0) {
            throw new IllegalStateException("編號規則 " + MeetingConstants.SEQ_BOOKING
                    + " 未就緒（缺失常報「編號生成規則未配置」）");
        }
        for (String[] cfg : CONFIG_DEFAULTS) {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_config WHERE config_key = ?", Integer.class, cfg[0]);
            if (n == null || n == 0) {
                throw new IllegalStateException("全局預約規則缺少 " + cfg[0] + "，房間列為 NULL 時無處回落");
            }
        }
        for (String[] s : NOTIFY_SCENARIOS) {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_notification_scenario WHERE scenario_key = ?",
                    Integer.class, s[0]);
            if (n == null || n == 0) {
                throw new IllegalStateException("通知場景 " + s[0] + " 未登記，邀約無處路由");
            }
        }
    }

    /** 编号规则的展示元数据每次启动同步：规则菜单里要能认出它是干什么的 */
    private void syncSeqRule() {
        syncSeqRule(MeetingConstants.SEQ_SERIES, "會議周期系列號", "MS");
        int updated = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET rule_name = ?, biz_menu = ?, prefix = ?, date_format = ?, "
                        + "seq_length = 4, status = 1, remark = ? WHERE rule_key = ?",
                "會議單號", "會議管理", "MT", "YYYYMMDD",
                "{prefix} + YYYYMMDD + {n}位自增序號", MeetingConstants.SEQ_BOOKING);
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                            + "seq_length, seq_start, status, remark) VALUES (?, ?, ?, ?, ?, 4, 1, 1, ?)",
                    MeetingConstants.SEQ_BOOKING, "會議單號", "會議管理", "MT", "YYYYMMDD",
                    "{prefix} + YYYYMMDD + {n}位自增序號");
        }
    }

    /** 通用的一条编号规则同步（M2 起的规则都用这个写法，避免复制三段一样的 UPDATE/INSERT） */
    private void syncSeqRule(String ruleKey, String ruleName, String prefix) {
        int updated = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET rule_name = ?, biz_menu = ?, prefix = ?, date_format = ?, "
                        + "seq_length = 4, status = 1, remark = ? WHERE rule_key = ?",
                ruleName, "會議管理", prefix, "YYYYMMDD", "{prefix} + YYYYMMDD + {n}位自增序號", ruleKey);
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                            + "seq_length, seq_start, status, remark) VALUES (?, ?, ?, ?, ?, 4, 1, 1, ?)",
                    ruleKey, ruleName, "會議管理", prefix, "YYYYMMDD", "{prefix} + YYYYMMDD + {n}位自增序號");
        }
    }

    /**
     * 全局规则默认值。
     *
     * <p>只补不存在的键，绝不覆盖已有值：管理员在配置页调过的提前期/时长上限
     * 如果被启动重放回默认值，等于每次发版都把公司规则改回出厂设置。
     */
    private void syncConfigDefaults() {
        for (String[] cfg : CONFIG_DEFAULTS) {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_config WHERE config_key = ?", Integer.class, cfg[0]);
            if (n == null || n == 0) {
                jdbcTemplate.update(
                        "INSERT INTO sys_config (config_key, config_value, description) VALUES (?, ?, ?)",
                        cfg[0], cfg[1], cfg[2]);
            }
        }
    }

    /**
     * 通知场景登记。
     *
     * <p>{@code enabled} 只在首次插入时为 0，之后一律不动：行政在通知配置里开启的场景
     * 不能因为发版重跑被关闭；{@code app_id} 也不回填默认应用，路由必须由人显式绑定。
     */
    private void syncNotificationScenarios() {
        for (String[] s : NOTIFY_SCENARIOS) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by) "
                            + "VALUES (?, NULL, 0, ?)",
                    s[0], s[1]);
        }
    }

    /* ==================== M2：周期系列与黑名单结构 ==================== */

    private void doSchemaMigrateM2() {
        int executed = executeScript(SCHEMA_SCRIPT_M2);
        log.info("會議管理 M2 建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT_M2);
    }

    /**
     * M2 结构后置校验。
     *
     * <p>系列表的两个计数列与黑名单的 source 列都在关键写入路径上（跳过场次数、自动/手动来源），
     * 缺列的表现同样是"能写不能读"，所以与 v1.0 一样钉到启动校验里。
     */
    private void verifySchemaM2() {
        for (String table : TABLES_M2) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，週期會議與黑名單無法寫入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS_M2) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下會長出重複編號、重複物化或同一人多條生效限制");
            }
        }
        Integer seq = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND status = 1",
                Integer.class, MeetingConstants.SEQ_SERIES);
        if (seq == null || seq == 0) {
            throw new IllegalStateException("編號規則 " + MeetingConstants.SEQ_SERIES
                    + " 未就緒（新建週期會議必報「編號生成規則未配置」）");
        }
    }

    /** 每次启动补齐"实体已有、库里还没有"的列与索引（先查后加，可重复执行，失败一律抛出） */
    private void repairSchema() {
        for (String[] col : REQUIRED_ADDED_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + col[0] + " " + col[2]);
            log.info("已補建會議域列: {}.{}", col[0], col[1]);
        }
        for (String[] idx : REQUIRED_INDEXES) {
            if (indexExists(idx[0], idx[1])) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + idx[0] + " " + idx[2]);
            log.info("已補建會議域索引: {}.{}", idx[0], idx[1]);
        }
    }

    /** 把种子里的简体位置描述改成繁中写法；只命中仍带旧值的行 */
    private void doSeedCopyFix() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_meeting_room SET location_desc = '走廊盡頭', updated_at = NOW() "
                        + "WHERE location_desc = '走廊尽头' AND deleted = 0");
        log.info("會議室種子文案已修正: {} 行（走廊尽头 → 走廊盡頭）", changed);
    }

    /** 残留旧值说明 UPDATE 没打中（例如列名/排序规则变了），必须让启动暴露它 */
    private void verifySeedCopyFix() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_meeting_room WHERE location_desc = '走廊尽头'", Integer.class);
        if (remains != null && remains > 0) {
            throw new IllegalStateException("種子位置描述仍为簡體: " + remains + " 行未修正");
        }
    }

    /* ==================== 4. 一級菜單重構（v1.2） ==================== */

    /**
     * 拆成两个一级菜单：會議中心（我的會議、會議室預約）与會議治理（會議室檔案、預約記錄、預約規則）。
     *
     * <p>为什么拆：会议室档案、预约记录、预约规则（含黑名单）都是行政维护动作，
     * 与"我要订个会议室"是两类使用者。挂在同一个一级菜单下时，普通员工每次展开都要跳过三条用不到的入口，
     * 行政也要在 5 条里翻治理项；拆开后两个一级菜单各自不超过 3 条。
     *
     * <p>为什么复用 {@code meeting-management} 这一行改名，而不是新建一个分组再删旧的：
     * 分组已经被角色授权过，换 menu_key 等于换 menu_id，所有已授权角色都得重新授权。
     */
    private void doMenuRestructure() {
        Long centerId = queryMenuId(MENU_GROUP);
        if (centerId == null) {
            throw new IllegalStateException("會議管理分組不存在，無法重構一級菜單（請先跑 " + VERSION_MENU + "）");
        }
        renameGroup(centerId, "會議中心", "Meeting Center");
        ensureAdminGroup(centerId);
        Long adminGroupId = queryMenuId(MENU_GROUP_ADMIN);
        // 使用侧：先看自己的会，再去订新的
        moveTo(centerId, MeetingConstants.MENU_MY, 1);
        moveTo(centerId, MeetingConstants.MENU_BOOKING, 2);
        // 治理侧：资源 → 记录 → 规则（行政的日常动线）
        moveTo(adminGroupId, MeetingConstants.MENU_ROOM, 1);
        moveTo(adminGroupId, MeetingConstants.MENU_RECORD, 2);
        moveTo(adminGroupId, MeetingConstants.MENU_CONFIG, 3);
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId != null) {
            upsertGrant(adminRoleId, MENU_GROUP_ADMIN, GROUP_ACTIONS);
        }
        // 新分组同样带 system_code=meeting：非 admin 角色一旦被授权，系统准入要跟着补上
        deriveSystemAccess();
        log.info("會議管理已重構為兩個一級菜單: 會議中心({}) / 會議治理({})", MENU_GROUP, MENU_GROUP_ADMIN);
    }

    /** 校验只看最终形态：改名与挂载都是幂等 UPDATE，重启重跑天然通过 */
    private void verifyMenuRestructure() {
        Long centerId = queryMenuId(MENU_GROUP);
        Long adminGroupId = queryMenuId(MENU_GROUP_ADMIN);
        if (centerId == null || adminGroupId == null) {
            throw new IllegalStateException("會議一級菜單未就緒: 會議中心=" + centerId + ", 會議治理=" + adminGroupId);
        }
        Integer renamed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE id = ? AND name = ? AND deleted = 0",
                Integer.class, centerId, "會議中心");
        if (renamed == null || renamed == 0) {
            throw new IllegalStateException("會議中心分組未更名（仍为舊名，v1.2 未生效）");
        }
        List<String> wrong = new ArrayList<>();
        for (String leaf : List.of(MeetingConstants.MENU_MY, MeetingConstants.MENU_BOOKING)) {
            if (!centerId.equals(parentIdOf(leaf))) {
                wrong.add(leaf + "→會議中心");
            }
        }
        for (String leaf : List.of(MeetingConstants.MENU_ROOM, MeetingConstants.MENU_RECORD, MeetingConstants.MENU_CONFIG)) {
            if (!adminGroupId.equals(parentIdOf(leaf))) {
                wrong.add(leaf + "→會議治理");
            }
        }
        if (!wrong.isEmpty()) {
            throw new IllegalStateException("會議菜單挂载不符: " + wrong);
        }
        Integer grants = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "WHERE rm.menu_id = ?",
                Integer.class, ADMIN_ROLE_CODE, adminGroupId);
        if (grants == null || grants == 0) {
            throw new IllegalStateException("admin 角色未獲得會議治理分組授權");
        }
    }

    /**
     * 建治理侧一级菜单。排序取"会议中心 sort + 1"：两个一级菜单在侧边栏相邻，
     * 且不与后续新增系统的顶级菜单互相顶；已存在时不动 sort（管理员在菜单配置里调过顺序不该被打回）。
     */
    private void ensureAdminGroup(Long centerGroupId) {
        Long id = queryMenuId(MENU_GROUP_ADMIN);
        if (id != null) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET type = ?, icon = ?, system_code = ?, parent_id = NULL, status = 1, "
                            + "deleted = 0, updated_by = 'system' WHERE id = ?",
                    MENU_TYPE_GROUP, "MonitorOutlined", SYSTEM_CODE, id);
            return;
        }
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", MENU_GROUP_ADMIN);
        Integer centerSort = jdbcTemplate.query(
                "SELECT sort_order FROM sys_menu WHERE id = ?", rs -> rs.next() ? (Integer) rs.getObject(1) : null,
                centerGroupId);
        int sortOrder = (centerSort == null ? 0 : centerSort) + 1;
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, type, icon, sort_order, actions, "
                        + "status, system_code, updated_by, deleted) "
                        + "VALUES (NULL, ?, ?, ?, ?, ?, ?, '', 1, ?, 'system', 0)",
                MENU_GROUP_ADMIN, "會議治理", "Meeting Governance", MENU_TYPE_GROUP,
                "MonitorOutlined", sortOrder, SYSTEM_CODE);
        log.info("已創建會議治理分組: sort={}", sortOrder);
    }

    /** 只改分组显示名（中英），不碰图标与动作：图标/动作可能被行政在界面上调过，迁移不该覆盖 */
    private void renameGroup(Long groupId, String name, String nameEn) {
        jdbcTemplate.update("UPDATE sys_menu SET name = ?, updated_by = 'system' WHERE id = ? AND name <> ?",
                name, groupId, name);
        jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '' OR name_en = 'Meeting Management')",
                nameEn, groupId);
    }

    /** 挂载到指定分组并同步排序；仅在确有变化时写库，重启不产生无谓 UPDATE */
    private void moveTo(Long parentId, String menuKey, int sortOrder) {
        Long menuRowId = queryMenuId(menuKey);
        if (menuRowId == null) {
            throw new IllegalStateException("會議葉子菜單不存在，無法重新掛載: " + menuKey);
        }
        Integer changed = jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = ?, sort_order = ?, updated_by = 'system' "
                        + "WHERE id = ? AND (parent_id IS NULL OR parent_id <> ? OR sort_order <> ?)",
                parentId, sortOrder, menuRowId, parentId, sortOrder);
        if (changed != null && changed > 0) {
            log.info("會議菜單已掛載: {} → parent_id={}, sort={}", menuKey, parentId, sortOrder);
        }
    }

    private Long parentIdOf(String menuKey) {
        return jdbcTemplate.query("SELECT parent_id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                rs -> rs.next() ? ((Number) rs.getObject(1)).longValue() : null, menuKey);
    }

    /* ==================== M2：預約規則菜單 ==================== */

    /**
     * 补上「預約規則」菜单。
     *
     * <p>单独一个版本键而不是改 v1.0：{@code ensureMenu} 对已存在菜单只对齐结构，
     * 已记录 v1.0 的库不会重跑整段 task，写进去的新菜单在真实环境里根本不会出现
     * （用车域与考勤日报动作集都踩过同一个坑）。
     */
    private void doMenuMigrateM2() {
        Long groupId = queryMenuId(MENU_GROUP);
        if (groupId == null) {
            throw new IllegalStateException("會議管理分組不存在，預約規則菜單无处掛載（請先跑 " + VERSION_MENU + "）");
        }
        // 与 M1 一样：menuKey 用字面量逐条调用，保证 check-menu-consistency.mjs 能扫到
        ensureMenu(groupId, "meeting-config", "預約規則", "/meeting-config",
                "MeetingConfig", "PropertySafetyOutlined", 5, MeetingConstants.ACTIONS_CONFIG,
                "Booking Rules");
        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("會議管理 M2 菜單已就緒: 預約規則(system_code={})", SYSTEM_CODE);
    }

    private void verifyMenusM2() {
        Long groupId = queryMenuId(MENU_GROUP);
        Integer ok = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                        + "AND system_code = ? AND parent_id = ?",
                Integer.class, MENU_CONFIG_KEY, SYSTEM_CODE, groupId);
        if (ok == null || ok == 0) {
            throw new IllegalStateException("預約規則菜單未就緒（缺失/父级/归属/启用态不符）");
        }
        Integer actionsWrong = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 "
                        + "AND (actions IS NULL OR actions <> ?)",
                Integer.class, MENU_CONFIG_KEY, MeetingConstants.ACTIONS_CONFIG);
        if (actionsWrong != null && actionsWrong > 0) {
            throw new IllegalStateException("預約規則菜單動作集未對齊，改規則與黑名單將無法授權");
        }
    }

    /* ==================== 通用工具 ==================== */

    /** 逐条执行 classpath 脚本；读不到或执行失败一律抛出，交 applyOnce 记失败并在下次启动重试 */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表腳本 " + script + "，會議域表無法創建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取建表腳本失敗 " + script + ": " + e.getMessage(), e);
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

    private boolean tableExists(String table) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return n != null && n > 0;
    }

    /** 列是否存在（MySQL 8 没有 ADD COLUMN IF NOT EXISTS，先查后加是唯一安全写法） */
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
}
