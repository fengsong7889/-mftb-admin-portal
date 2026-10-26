package com.mftb.admin.config;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 会议纪要（meeting）迁移：3 张 {@code biz_meeting_minutes*} 表 + 纪要单号规则 + 通知场景登记。
 *
 * <p>DDL 只在 classpath 脚本 {@code 267_meeting_minutes.sql} 存一份
 * （{@code backend/sql/} 下同名文件为参考副本，由结构锁用例断言逐字一致），
 * 避免 Java 与 SQL 双份漂移；结构契约也从同一份脚本切片登记（见 {@link MeetingMinutesSchema}）。
 *
 * <p><b>启动顺序</b>：取 29，必须晚于 {@code MeetingSchemaMigrationInitializer(@Order 28)}
 * ——纪要表有外键指向 {@code biz_meeting_booking}，早于它建表会在 MySQL 8 上直接 1215；
 * 也必须早于 {@code PermissionAnnotationValidator(@Order 30)}，否则纪要接口上的
 * {@code meeting-my} 注解会被判定为"菜单不存在"。
 *
 * <p><b>为什么不新增菜单</b>：纪要的归属本来就是"我与这场会的关系统计"，权限锚复用
 * {@code meeting-my:edit} 与 {@code meeting-record:edit}；新增菜单 key 必须同步递增
 * {@code sys_menu} 种子与 {@code MeetingAccessGrantInitializer} 的全员授权基线，
 * 漏一步就是接口对非超管永久 403。
 *
 * <p>编号规则与通知场景的展示元数据放在 {@code applyOnce} 之外每次启动同步：
 * 版本已记录的库不会重跑 task，写进 task 里的文案改动永远落不到已有环境。
 */
@Slf4j
@Component
@Order(29)
@RequiredArgsConstructor
public class MeetingMinutesSchemaMigrationInitializer implements CommandLineRunner {

    static final String VERSION_SCHEMA = "meeting:minutes:v1.0";

    /** v1.1：可跟踪事项 / 关联纪要 / 通知模板 / 推送开关 + 三个菜单 */
    static final String VERSION_SCHEMA_V2 = "meeting:minutes:v1.1";
    private static final String SCHEMA_SCRIPT_V2 = "268_meeting_minutes_v2.sql";

    /**
     * v1.2：会议通知卡片版式重排（参会人反馈“样式丑、信息不突出”）。
     *
     * <p>为什么单独一个版本键：v1.1 的模板种子只在首次插入，已跑过的库不会重读脚本；
     * 只改 268 脚本等于永远修不上现有环境。只更新 {@code updated_by='meeting-v2'} 的行，
     * 管理员在「通知模板」页改过的文案（updated_by 已变）不会被发版打回。
     */
    static final String VERSION_TEMPLATE_COPY_V12 = "meeting:minutes:v1.2";

    /** 新卡片文案：标题即会议名称，字段各自成段（钉钉 markdown 会把连续单换行归并成一行） */
    private static final String CARD_COPY_INVITE = String.join("\n\n",
            "**${meetingTitle}**",
            "會議時間：**${startTime}**",
            "會議室：**${roomName}**",
            "組織者：${organizer}${delegateLine}${agendaLine}${onlineLine}${extraLine}");
    private static final String CARD_COPY_REMIND = String.join("\n\n",
            "**${meetingTitle}**",
            "⏰ **會議即將開始**",
            "會議時間：**${startTime}**",
            "會議室：**${roomName}**",
            "組織者：**${organizer}**${onlineLine}");
    private static final String CARD_COPY_OPS = String.join("\n\n",
            "**${meetingTitle}**",
            "會議時間：**${startTime}**",
            "會議室：**${roomName}**",
            "原因：**${reason}**${extraLine}",
            "如需使用，請重新預約。");

    /** v1.1 建的四张表（顺序即外键依赖顺序） */
    private static final List<String> TABLES_V2 = List.of(
            "biz_meeting_minutes_item", "biz_meeting_minutes_link",
            "sys_notification_template", "sys_notification_switch");

    private static final String[][] REQUIRED_UNIQUE_KEYS_V2 = {
            {"biz_meeting_minutes_item", "uk_meeting_minutes_item"},
            {"biz_meeting_minutes_link", "uk_meeting_minutes_link"},
            {"sys_notification_template", "uk_notification_template_scene"},
            {"sys_notification_switch", "uk_notification_switch"},
    };

    /**
     * v1.1 的三个新菜单：{menuKey, name, nameEn, path, component, icon, parentKey(空=顶级), sort, actions, systemCodeFrom}
     *
     * <p>图标全局唯一是硬规则（侧边栏两个菜单长一样等于没图标），下面三个均为本域未占用图标。
     * <p>行政纪要列表挂在「會議治理」下；模板与开关挂在顶级、紧邻「通知渠道配置」（sort 6/7）。
     * <p>system_code：纪要列表显式写 meeting；模板/开关跟随 notification-config 的系统归属
     * （留 NULL 会让门户导航剪枝把它们当成幽灵菜单）。
     */
    private static final String[][] MENUS_V2 = {
            {"meeting-minutes-list", "會議紀要", "Meeting Minutes", "/meeting-minutes-list",
                    "MeetingMinutesAdmin", "SolutionOutlined", "meeting-admin", "4",
                    "[\"view\",\"export\"]", "meeting"},
            {"notification-template", "通知模板", "Notification Templates", "/notification-template",
                    "NotificationTemplateConfig", "MessageOutlined", "", "6",
                    "[\"view\",\"edit\"]", "notification-config"},
            {"notification-switch", "推送開關", "Notification Switches", "/notification-switch",
                    "NotificationSwitchConfig", "ControlOutlined", "", "7",
                    "[\"view\",\"edit\"]", "notification-config"},
    };

    private static final String SCHEMA_SCRIPT = "267_meeting_minutes.sql";

    private static final List<String> TABLES = List.of(
            "biz_meeting_minutes", "biz_meeting_minutes_send", "biz_meeting_minutes_delivery");

    /**
     * 并发与幂等完全依赖的唯一键。
     * <p>缺任意一个的方向性后果都写在提示里：缺纪要主表键=同一场会能长出两条并列纪要；
     * 缺批次号键=重发会覆盖上一批（"发出去的是哪一版"就此失证）；缺明细键=同一批次能重复投同一个人。
     */
    private static final String[][] REQUIRED_UNIQUE_KEYS = {
            {"biz_meeting_minutes", "uk_meeting_minutes_booking"},
            {"biz_meeting_minutes", "uk_meeting_minutes_no"},
            {"biz_meeting_minutes", "uk_meeting_minutes_request"},
            {"biz_meeting_minutes_send", "uk_meeting_minutes_send_seq"},
            {"biz_meeting_minutes_send", "uk_meeting_minutes_send_request"},
            {"biz_meeting_minutes_delivery", "uk_meeting_minutes_delivery"},
    };

    /**
     * 实体依赖的列（每次启动都校验，不受版本门控）。
     *
     * <p>MyBatis-Plus 按实体字段拼 SELECT 列表：实体有字段而库里没列，表现是"能写不能读"
     * （写入时 null 被省略，读取时按列名拼 SELECT 直接报 bad SQL grammar）。
     */
    private static final String[][] REQUIRED_COLUMNS = {
            {"biz_meeting_minutes", "minutes_no"},
            {"biz_meeting_minutes", "booking_id"},
            {"biz_meeting_minutes", "recorder_user_id"},
            {"biz_meeting_minutes", "content_json"},
            {"biz_meeting_minutes", "digest"},
            {"biz_meeting_minutes", "status"},
            {"biz_meeting_minutes", "send_count"},
            {"biz_meeting_minutes", "token_version"},
            {"biz_meeting_minutes", "series_id"},
            {"biz_meeting_minutes", "meeting_time_text"},
            {"biz_meeting_minutes_send", "batch_seq"},
            {"biz_meeting_minutes_send", "content_snapshot"},
            {"biz_meeting_minutes_send", "markdown_snapshot"},
            {"biz_meeting_minutes_send", "group_channel_id"},
            {"biz_meeting_minutes_send", "token_version"},
            {"biz_meeting_minutes_send", "send_status"},
            {"biz_meeting_minutes_delivery", "send_id"},
            {"biz_meeting_minutes_delivery", "target_type"},
            {"biz_meeting_minutes_delivery", "receiver_user_id"},
            {"biz_meeting_minutes_delivery", "receiver_department"},
            {"biz_meeting_minutes_delivery", "send_status"},
            {"biz_meeting_minutes_delivery", "next_retry_at"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        // v1.1：事项/关联/模板/开关四表 + 三个菜单 + 历史事项回填。
        // 放在同一个执行器里而不是另开一个 @Order(29) 的类：本版本的表有外键指向 v1 的纪要表，
        // 两个同序号的 Bean 执行顺序不确定，全新库上可能先建子表而 1215 失败。
        versionTracker.applyOnce(VERSION_SCHEMA_V2, this::doSchemaMigrateV2, this::verifySchemaV2);
        // v1.2：卡片文案重排。必须在 v1.1 之后（模板表与种子先就绪）
        versionTracker.applyOnce(VERSION_TEMPLATE_COPY_V12,
                this::refreshMeetingCardCopyV12, this::verifyMeetingCardCopyV12);
        // 每次启动都跑的三步：不受 applyOnce 门控，改动才能落到已经跑过 v1.0 的环境
        syncSeqRule();
        ensureNotifyScenario();
        // 新菜单的授权范围每次启动都跟锚点菜单对齐：只授给 admin 是不够的，
        // 线上管理员往往不是内置超管角色（本次实测即是 role=guest + 功能角色），
        // 只授 admin 会让新菜单入库了却没人看得见。
        syncMenuGrantsV2();
        verifyColumns();
    }

    /* ==================== 迁移任务 ==================== */

    private void doSchemaMigrate() {
        List<String> statements = MeetingMinutesSchema.statements();
        for (String statement : statements) {
            jdbcTemplate.execute(statement);
        }
        log.info("會議紀要建表腳本已執行: {} 條語句（{}）", statements.size(), SCHEMA_SCRIPT);
    }

    /* ==================== v1.1 迁移 ==================== */

    private void doSchemaMigrateV2() {
        int executed = 0;
        for (String statement : MeetingMinutesSchema.statements(SCHEMA_SCRIPT_V2)) {
            jdbcTemplate.execute(statement);
            executed++;
        }
        log.info("會議紀要 v1.1 建表/種子腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT_V2);
        ensureMenusV2();
        int backfilled = backfillItemsV2();
        log.info("會議紀要 v1.1 歷史事項回填: {} 條（行動項/跟進事項）", backfilled);
    }

    private void verifySchemaV2() {
        for (String table : TABLES_V2) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，會議紀要 v1.1 無法寫入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS_V2) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下會長出重複事項/重複關聯/重複模板");
            }
        }
        for (String[] menu : MENUS_V2) {
            if (!menuExists(menu[0])) {
                throw new IllegalStateException("菜單未就緒: " + menu[0]);
            }
        }
    }

    /* ==================== v1.2 卡片文案重排 ==================== */

    /**
     * 只改仍保持出厂文案（updated_by='meeting-v2'）的三条模板：
     * 管理员改过的行不动，否则每次发版都会把他的措辞打回去。
     */
    private void refreshMeetingCardCopyV12() {
        int invite = refreshMeetingTemplate(MeetingConstants.SCENARIO_INVITE, "會議邀約",
                "${titlePrefix}${meetingTitle}", CARD_COPY_INVITE,
                "${meetingTitle},${titlePrefix},${meetingNo},${startTime},${endTime},${roomName},"
                        + "${roomLocation},${organizer},${delegateLine},${agendaLine},${onlineLine},"
                        + "${extraLine},${viewUrl}");
        int remind = refreshMeetingTemplate(MeetingConstants.SCENARIO_REMIND, "會議開始前提醒",
                "【會議提醒】${meetingTitle}", CARD_COPY_REMIND,
                "${meetingTitle},${startTime},${roomName},${organizer},${onlineLine},${viewUrl}");
        int ops = refreshMeetingTemplate(MeetingConstants.SCENARIO_OPS, "會議室釋放告知",
                "【會議室釋放】${meetingTitle}", CARD_COPY_OPS,
                "${meetingTitle},${startTime},${roomName},${reason},${extraLine},${viewUrl}");
        log.info("會議通知卡片文案已重排: invite={}, remind={}, ops={} 行", invite, remind, ops);
    }

    private int refreshMeetingTemplate(String sceneKey, String sceneName, String titleTpl,
                                       String bodyTpl, String variables) {
        return jdbcTemplate.update("UPDATE sys_notification_template SET scene_name = ?, title_tpl = ?, "
                        + "body_tpl = ?, variables = ?, updated_by = 'meeting-v1.2' "
                        + "WHERE scene_key = ? AND updated_by = 'meeting-v2'",
                sceneName, titleTpl, bodyTpl, variables, sceneKey);
    }

    /** 出厂文案必须都已重排：残留旧种子说明 UPDATE 没命中（例如 updated_by 被意外改写） */
    private void verifyMeetingCardCopyV12() {
        Integer stale = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_notification_template WHERE scene_key IN (?, ?, ?) "
                        + "AND updated_by = 'meeting-v2'", Integer.class,
                MeetingConstants.SCENARIO_INVITE, MeetingConstants.SCENARIO_REMIND, MeetingConstants.SCENARIO_OPS);
        if (stale != null && stale > 0) {
            throw new IllegalStateException("會議通知模板仍有 " + stale + " 條舊版文案未重排");
        }
    }

    /** 建菜单 + 授内置 admin；已存在则不动（管理员在菜单配置里改过的名称/排序不能被启动重置） */
    private void ensureMenusV2() {
        for (String[] menu : MENUS_V2) {
            if (menuExists(menu[0])) {
                continue;
            }
            Long parentId = menu[6].isEmpty() ? null
                    : jdbcTemplate.queryForList("SELECT id FROM sys_menu WHERE menu_key = ? LIMIT 1", Long.class, menu[6])
                            .stream().findFirst().orElse(null);
            if (!menu[6].isEmpty() && parentId == null) {
                throw new IllegalStateException("父菜單不存在: " + menu[6]);
            }
            String systemCode = "meeting".equals(menu[9]) ? "meeting"
                    : jdbcTemplate.queryForList("SELECT system_code FROM sys_menu WHERE menu_key = ? LIMIT 1",
                            String.class, menu[9]).stream().findFirst().orElse(null);
            jdbcTemplate.update("INSERT INTO sys_menu (menu_key, name, name_en, parent_id, type, path, component, icon, "
                            + "actions, sort_order, system_code, status) VALUES (?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, 1)",
                    menu[0], menu[1], menu[2], parentId, menu[3], menu[4], menu[5], menu[8],
                    Integer.parseInt(menu[7]), systemCode);
            jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT r.id, m.id, m.actions FROM sys_role r, sys_menu m "
                            + "WHERE r.code = 'admin' AND m.menu_key = ? AND r.deleted = 0", menu[0]);
            log.info("會議紀要 v1.1 新增菜單: {}（{}）", menu[1], menu[0]);
        }
    }

    /**
     * 把 content_json 里旧的 actions / openIssues 回填成事项行。
     * <p>只处理“该纪要还没有任何事项行”的：已经用过新版编辑页的纪要再回填会把用户删掉的事项加回来。
     * <p>状态统一 pending：旧数据没有处理进度，凭空臆造“已完成”比空着更危险。
     */
    private int backfillItemsV2() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, booking_id, content_json FROM biz_meeting_minutes WHERE deleted = 0");
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            long minutesId = ((Number) row.get("id")).longValue();
            long bookingId = ((Number) row.get("booking_id")).longValue();
            Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM biz_meeting_minutes_item WHERE minutes_id = ?", Integer.class, minutesId);
            if (existing != null && existing > 0) {
                continue;
            }
            MeetingMinutesContent content = JsonUtils.parse(Objects.toString(row.get("content_json"), ""),
                    MeetingMinutesContent.class);
            if (content == null) {
                continue;
            }
            int actionSeq = 0;
            if (content.getActions() != null) {
                for (MeetingMinutesContent.Action action : content.getActions()) {
                    if (action == null || !StringUtils.hasText(action.getContent())) {
                        continue;
                    }
                    actionSeq++;
                    jdbcTemplate.update("INSERT IGNORE INTO biz_meeting_minutes_item "
                                    + "(minutes_id, booking_id, kind, seq, content, owner_user_id, owner_name, "
                                    + " owner_emp_no, due_date, status, deleted) "
                                    + "VALUES (?, ?, 'ACTION', ?, ?, ?, ?, ?, ?, 'pending', 0)",
                            minutesId, bookingId, actionSeq, truncate(action.getContent(), 500),
                            action.getOwnerUserId(), Objects.toString(action.getOwnerName(), ""),
                            Objects.toString(action.getOwnerEmpNo(), ""), parseDate(action.getDueDate()));
                    inserted++;
                }
            }
            int followSeq = 0;
            if (content.getOpenIssues() != null) {
                for (MeetingMinutesContent.OpenIssue issue : content.getOpenIssues()) {
                    if (issue == null || !StringUtils.hasText(issue.getContent())) {
                        continue;
                    }
                    followSeq++;
                    jdbcTemplate.update("INSERT IGNORE INTO biz_meeting_minutes_item "
                                    + "(minutes_id, booking_id, kind, seq, content, status, deleted) "
                                    + "VALUES (?, ?, 'FOLLOW', ?, ?, 'pending', 0)",
                            minutesId, bookingId, followSeq, truncate(issue.getContent(), 500));
                    inserted++;
                }
            }
        }
        return inserted;
    }

    /**
     * 把 v1.1 三个新菜单的可见范围继承自锚点菜单：
     * <ul>
     *   <li>會議紀要 ← 預約記錄（同属「會議治理」，能看全部预约的人就能看全部纪要）</li>
     *   <li>通知模板 / 推送開關 ← 通知渠道配置（能改通知配置的人才能改文案与静音）</li>
     * </ul>
     *
     * <p>动作按锚点收窄：锚点只有 view 时新菜单也只授 view，绝不因为"新菜单声明了 edit"就顺带提权。
     * <p>每次启动执行且幂等：管理员在授权中心手工改过的行不会被覆盖（INSERT IGNORE 只补缺）。
     */
    private void syncMenuGrantsV2() {
        String[][] inherit = {
                {"meeting-minutes-list", "meeting-record"},
                {"notification-template", "notification-config"},
                {"notification-switch", "notification-config"},
        };
        for (String[] pair : inherit) {
            Long targetId = jdbcTemplate.queryForList(
                    "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, pair[0])
                    .stream().findFirst().orElse(null);
            if (targetId == null) {
                continue;
            }
            String targetActions = jdbcTemplate.queryForList(
                    "SELECT actions FROM sys_menu WHERE id = ?", String.class, targetId).stream()
                    .findFirst().orElse("[\"view\"]");
            List<Map<String, Object>> roleGrants = jdbcTemplate.queryForList(
                    "SELECT rm.role_id, rm.actions FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                            + "WHERE m.menu_key = ?", pair[1]);
            for (Map<String, Object> grant : roleGrants) {
                jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                        grant.get("role_id"), targetId, narrowActions(Objects.toString(grant.get("actions"), ""), targetActions));
            }
            List<Map<String, Object>> deptGrants = jdbcTemplate.queryForList(
                    "SELECT dm.dept_id, dm.actions FROM sys_department_menu dm JOIN sys_menu m ON m.id = dm.menu_id "
                            + "WHERE m.menu_key = ?", pair[1]);
            for (Map<String, Object> grant : deptGrants) {
                jdbcTemplate.update("INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)",
                        grant.get("dept_id"), targetId, narrowActions(Objects.toString(grant.get("actions"), ""), targetActions));
            }
            // 内置超管兜底：即使锚点菜单没授给它，admin 也要能看见（否则新菜单对超管隐身）
            jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                    + "SELECT r.id, ?, ? FROM sys_role r WHERE r.code = 'admin' AND r.deleted = 0",
                    targetId, targetActions);
        }
    }

    /** 锚点只有 view 时只授 view；锚点有 edit 才按新菜单声明的完整动作集授 */
    private static String narrowActions(String anchorActions, String targetActions) {
        String anchor = Objects.toString(anchorActions, "");
        if (!anchor.contains("\"edit\"") && !anchor.contains("\"create\"") && !anchor.contains("\"export\"")) {
            return "[\"view\"]";
        }
        return StringUtils.hasText(targetActions) ? targetActions : "[\"view\"]";
    }

    private boolean menuExists(String menuKey) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, menuKey);
        return count != null && count > 0;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static java.time.LocalDate parseDate(String value) {
        try {
            return StringUtils.hasText(value) ? java.time.LocalDate.parse(value.trim()) : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，會議紀要無法寫入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，並發下會長出重複紀要/覆蓋上一批次/同一人重複投遞");
            }
        }
    }

    /** 实体列必验：每次启动都跑，新加字段在任何已跑过 v1.0 的环境上都要立刻暴露缺列 */
    private void verifyColumns() {
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1]
                        + " 列缺失，實體按字段拼 SELECT 會在首次查詢時報 bad SQL grammar");
            }
        }
    }

    /* ==================== 每次启动同步的种子 ==================== */

    /** 纪要单号规则：只刷展示元数据，绝不动当前序号值（否则编号会倒回去重号） */
    private void syncSeqRule() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ?", Integer.class,
                MeetingConstants.SEQ_MINUTES);
        if (exists == null || exists == 0) {
            jdbcTemplate.update("INSERT INTO sys_biz_seq_rule "
                    + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                    + "VALUES (?, '會議紀要單號', '會議管理', 'MJ', 'YYYYMMDD', 4, 1, 1, ?)",
                    MeetingConstants.SEQ_MINUTES, "{prefix} + YYYYMMDD + {n}位自增序號");
            log.info("會議紀要單號規則已建立: {}", MeetingConstants.SEQ_MINUTES);
            return;
        }
        jdbcTemplate.update("UPDATE sys_biz_seq_rule SET rule_name = '會議紀要單號', biz_menu = '會議管理', "
                + "prefix = 'MJ', date_format = 'YYYYMMDD', seq_length = 4, remark = ? WHERE rule_key = ?",
                "{prefix} + YYYYMMDD + {n}位自增序號", MeetingConstants.SEQ_MINUTES);
    }

    /** 通知场景行：只补行不动 enabled/app_id，避免每次启动把管理员关掉的开关又打开 */
    private void ensureNotifyScenario() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_notification_scenario WHERE scenario_key = ?", Integer.class,
                MeetingConstants.SCENARIO_MINUTES);
        if (exists == null || exists == 0) {
            jdbcTemplate.update("INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by) "
                    + "VALUES (?, NULL, 0, 'meeting-minutes')", MeetingConstants.SCENARIO_MINUTES);
            log.info("會議紀要通知場景已登記（默認停用，需行政綁定企業應用後啟用）: {}",
                    MeetingConstants.SCENARIO_MINUTES);
        }
    }

    /* ==================== 通用工具 ==================== */

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean indexExists(String table, String index) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, index);
        return count != null && count > 0;
    }
}
