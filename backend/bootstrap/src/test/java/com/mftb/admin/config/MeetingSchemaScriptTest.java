package com.mftb.admin.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 会议域建表脚本结构锁。
 *
 * <p>为什么用文本断言而不是连 H2 跑一遍：脚本里的 STORED 生成列、{@code DATE_FORMAT}
 * 与 InnoDB 外键都是 MySQL 方言，H2 即使开 MySQL 模式也不能等价执行——真跑一遍只会得到
 * "看起来测过了"的假绿。这里锁的是**幂等与唯一键集合**这些真正决定数据正确性的事实，
 * 方言执行由启动期的 {@code verifySchema}（查 information_schema）在真实库上把关。
 */
class MeetingSchemaScriptTest {

    private static final String SCRIPT = "230_meeting_core_tables.sql";

    private static final List<String> TABLES = List.of(
            "biz_meeting_room", "biz_meeting_booking", "biz_meeting_attendee",
            "biz_meeting_event", "biz_meeting_notify_log");

    /** 建在软删感知生成列上的唯一键：删掉记录后同名/同窗口可以重建，同时并发重复被挡死 */
    private static final List<String> GENERATED_UNIQUE_KEYS = List.of(
            "uk_meeting_room_no", "uk_meeting_booking_no", "uk_meeting_booking_slot", "uk_meeting_attendee");

    /** 普通唯一键：幂等与通知去重的底线 */
    private static final List<String> PLAIN_UNIQUE_KEYS = List.of(
            "uk_meeting_booking_request", "uk_meeting_event_request", "uk_meeting_notify_dedup");

    private String classpathScript() {
        try (var in = new ClassPathResource(SCRIPT).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Test
    @DisplayName("5 张表与 7 个唯一键全部就位，其中 4 个必须走生成列")
    void declaresEveryTableAndIdempotencyKey() {
        String sql = classpathScript();
        for (String table : TABLES) {
            assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS " + table + " ("), "缺少建表语句: " + table);
        }
        for (String key : GENERATED_UNIQUE_KEYS) {
            assertTrue(sql.contains("UNIQUE KEY " + key), "缺少生成列唯一键: " + key);
        }
        for (String key : PLAIN_UNIQUE_KEYS) {
            assertTrue(sql.contains("UNIQUE KEY " + key), "缺少唯一键: " + key);
        }
        // 每个生成列唯一键都必须真的建在生成列上，否则逻辑删除后无法重建同名记录
        assertEquals(GENERATED_UNIQUE_KEYS.size(), countOccurrences(sql, "GENERATED ALWAYS AS"),
                "生成列数量必须等于软删感知唯一键数量：少一个就会出现删后无法重建或重复占用");
    }

    @Test
    @DisplayName("占用窗口唯一键只折进 booked/checked_in，取消或释放后同窗口可被重订")
    void activeSlotCoversOnlyOccupyingStatuses() {
        String sql = classpathScript().replaceAll("\\s+", " ");
        assertTrue(sql.contains("CASE WHEN deleted = 0 AND status IN ('booked','checked_in')"),
                "active_slot 必须只折占用态，否则取消过的会议会永久占住那段时间");
        // 服务层的重叠判定走 (room_id, start_time, status) 复合索引：
        // 缺了它，每次预约与忙闲查询都是全表扫描，抢位窗口被拉到秒级
        assertTrue(sql.contains("KEY idx_meeting_booking_room (room_id, start_time, status)"),
                "缺少 room_id+start_time+status 索引，锁内重叠判定无法走索引区间");
    }

    @Test
    @DisplayName("脚本只有幂等写入，不含破坏性语句；时长与人数禁止浮点")
    void keepsOnlyIdempotentDdlAndIntegerMeasures() {
        // 回滚段是注释，必须先剥掉行注释再判断，否则会把注释里的 DROP 误判成可执行语句
        String executable = classpathScript().replaceAll("(?m)^\\s*--.*$", "");
        for (String banned : List.of("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM")) {
            assertFalse(executable.toUpperCase().contains(banned), "可执行语句里出现了破坏性操作: " + banned);
        }
        for (String floatType : List.of("FLOAT", "DOUBLE")) {
            assertFalse(executable.toUpperCase().contains(floatType + " "), "时长/人数禁止使用浮点类型: " + floatType);
        }
    }

    @Test
    @DisplayName("半开区间、爽约与取消分列、释放必填原因都由 CHECK 与生成列钉住")
    void pinsWindowAndTerminalSemantics() {
        String sql = classpathScript().replaceAll("\\s+", " ");
        assertTrue(sql.contains("CONSTRAINT ck_meeting_booking_window CHECK (end_time > start_time)"));
        assertTrue(sql.contains("CONSTRAINT ck_meeting_booking_release CHECK"));
        assertTrue(sql.contains("status <> 'released' OR (release_at IS NOT NULL AND no_show_flag = 1)"),
                "释放必须同时留下释放时间与爽约标记，否则行政分不清爽约与正常结束");
        assertTrue(sql.contains("CONSTRAINT ck_meeting_booking_cancel CHECK"));
        assertTrue(sql.contains("status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)"),
                "取消不留原因等于让纠纷回溯失去凭据");
        assertTrue(sql.contains("CONSTRAINT ck_meeting_booking_attendee CHECK (attendee_count > 0)"));
    }

    @Test
    @DisplayName("编号规则、通知场景、全局规则与示例房间随脚本登记，且全部幂等")
    void seedsRulesScenariosConfigAndSampleRoomsIdempotently() {
        String sql = classpathScript();
        assertTrue(sql.contains("INSERT IGNORE INTO sys_biz_seq_rule"), "编号规则应为幂等插入");
        assertTrue(sql.contains("'meeting_booking'"), "缺少會議單號规则");
        for (String scenario : List.of("meeting_invite", "meeting_remind", "meeting_ops")) {
            assertTrue(sql.contains("'" + scenario + "'"), "缺少通知场景: " + scenario);
        }
        for (String key : List.of("meeting_advance_days", "meeting_max_duration_minutes",
                "meeting_time_granularity", "meeting_remind_minutes", "meeting_release_after_minutes")) {
            assertTrue(sql.contains("'" + key + "'"), "缺少全局规则键: " + key);
        }
        assertTrue(sql.contains("INSERT IGNORE INTO sys_config"), "sys_config 默认值不得覆盖管理员改动");
        // 示例房间只在表完全为空时写入：已有真实档案的环境绝不能被注入假数据
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM biz_meeting_room)"),
                "示例会议室缺少空表守卫");
    }

    @Test
    @DisplayName("参会人表的外键不得用 ON DELETE CASCADE：与生成列引用同一列互斥")
    void attendeeForeignKeyMustNotCascade() {
        /*
         * 开发库（MySQL 8.4）实测：`active_attendee` 生成列引用了 booking_id，
         * 再给 booking_id 加带 CASCADE 的外键会直接报 1215 "Cannot add foreign key constraint"，
         * 启动期建表失败。本域只做逻辑删除，硬删预约单的路径不存在，CASCADE 本来也永不触发；
         * 保留默认 NO ACTION 更安全：真出现孤儿引用时建表/写入直接失败，而不是静默级联 wipe 名单。
         */
        String sql = classpathScript();
        int start = sql.indexOf("CREATE TABLE IF NOT EXISTS biz_meeting_attendee");
        int end = sql.indexOf("邀约对象/响应/投递", start);
        assertTrue(start >= 0 && end > start, "未能定位 biz_meeting_attendee 建表段");
        String ddl = sql.substring(start, end).replaceAll("\\s+", " ");
        assertTrue(ddl.contains("CONSTRAINT fk_meeting_attendee_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id)"),
                "参会人必须继续受外键保护，不能为了绕过 1215 而直接删掉外键");
        assertFalse(ddl.contains("fk_meeting_attendee_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id) ON DELETE"),
                "参会人外键不得带 CASCADE：生成列引用 booking_id 时 MySQL 会直接拒建");
    }

    @Test
    @DisplayName("backend/sql 参考副本与 classpath 真值逐字一致")
    void referenceCopyMatchesClasspathSource() throws IOException {
        // 双份漂移是这类"一份执行、一份给人看"的布局最容易出的问题：改了副本没改真值，
        // 或反过来，DBA 照着副本手工执行却和启动期不一致。
        String copy = Files.readString(Path.of("sql", SCRIPT));
        assertEquals(classpathScript(), copy, SCRIPT + " 的参考副本与 classpath 真值不一致");
    }

    private int countOccurrences(String text, String needle) {
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(needle, index)) >= 0) {
            count++;
            index += needle.length();
        }
        return count;
    }
}
