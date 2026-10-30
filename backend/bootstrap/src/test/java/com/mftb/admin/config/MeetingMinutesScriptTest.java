package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import com.mftb.admin.config.migration.MigrationCatalog;
import com.mftb.admin.config.migration.MigrationEntry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.Order;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.dao.DataAccessResourceFailureException;

/**
 * 会议纪要 DDL 与迁移登记的结构锁。
 *
 * <p>与 {@code MeetingSchemaScriptTest}、{@code NotificationSchemaOrderingTest} 同一理由：
 * 这些脚本用 MySQL 方言（STORED 生成列、CHECK、外键），H2 不能等价执行，真跑一遍只会得到
 * "看起来测过了"的假绿。这里锁的是决定数据正确性的文字事实：
 * 唯一键集合、群行的 receiver_user_id 不能是 NULL、外键不得带 CASCADE、
 * 脚本只含幂等写入、参考副本与 classpath 真值逐字一致、契约与 catalog 登记齐备、启动顺序正确。
 */
class MeetingMinutesScriptTest {

    private static final List<String> TABLES = List.of(
            "biz_meeting_minutes", "biz_meeting_minutes_send", "biz_meeting_minutes_delivery");

    /** v1.1 的四张表：事项/关联/模板/开关（契约顺序必须与 TABLE_ORDER_V2 一致） */
    private static final List<String> TABLES_V2 = List.of(
            "biz_meeting_minutes_item", "biz_meeting_minutes_link",
            "sys_notification_template", "sys_notification_switch");

    @Test
    @DisplayName("三张表与六个唯一键全部就位")
    void declaresEveryTableAndKey() {
        String sql = MeetingMinutesSchema.raw();
        for (String table : TABLES) {
            assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS " + table + " ("), "缺少建表语句: " + table);
        }
        for (String key : List.of("uk_meeting_minutes_booking", "uk_meeting_minutes_no", "uk_meeting_minutes_request",
                "uk_meeting_minutes_send_seq", "uk_meeting_minutes_send_request", "uk_meeting_minutes_delivery")) {
            assertTrue(sql.contains("UNIQUE KEY " + key), "缺少唯一键: " + key);
        }
        // 一场会一条纪要必须建在软删感知生成列上，否则逻辑删除后这场会永远补不回纪要
        assertTrue(sql.contains("active_booking     BIGINT GENERATED ALWAYS AS"),
                "uk_meeting_minutes_booking 必须建在生成列上");
    }

    @Test
    @DisplayName("群投递行的 receiver_user_id 必须是 NOT NULL DEFAULT 0，不能拿 NULL 占位")
    void groupReceiverIsNotNull() {
        String sql = MeetingMinutesSchema.raw().replaceAll("\\s+", " ");
        assertTrue(sql.contains("receiver_user_id BIGINT NOT NULL DEFAULT 0"),
                "MySQL 唯一键不约束 NULL：群行用 NULL 占位等于同一批次能重复插多条群投递");
    }

    @Test
    @DisplayName("纪要外键不得带 CASCADE：生成列引用同一列时 MySQL 直接拒建")
    void foreignKeysMustNotCascade() {
        // 先剥掉行注释：文件头的设计说明里正当提到 CASCADE（解释为什么不用它），
        // 不剥就会把注释里的字样当成可执行语句，测试报一个不存在的 bug
        String sql = MeetingMinutesSchema.raw().replaceAll("(?m)^\\s*--.*$", "").replaceAll("\\s+", " ");
        assertTrue(sql.contains("CONSTRAINT fk_meeting_minutes_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id),"),
                "纪要必须继续受外键保护，不能为了绕开 1215 而删掉外键");
        assertFalse(sql.contains("fk_meeting_minutes_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id) ON DELETE"),
                "active_booking 生成列引用 booking_id，外键带 CASCADE 会被 MySQL 拒建");
        assertFalse(sql.contains("ON DELETE CASCADE"), "纪要三张新表之间的外键一律用默认 NO ACTION");
    }

    @Test
    @DisplayName("发送批次留存内容快照与 markdown 快照：改纪要不得追溯已发出的那一版")
    void batchKeepsItsOwnSnapshot() {
        String sql = MeetingMinutesSchema.raw();
        assertTrue(sql.contains("content_snapshot"), "缺少批次内容快照列");
        assertTrue(sql.contains("markdown_snapshot"), "缺少实际投出的卡片正文快照列");
        assertTrue(sql.contains("batch_seq"), "缺少批次号列");
        assertTrue(sql.contains("token_version"), "缺少令牌版本列（作廢歷史鏈接靠它）");
    }

    @Test
    @DisplayName("脚本只有幂等写入，不含破坏性语句；时长与人数禁止浮点")
    void keepsOnlyIdempotentDdl() {
        String executable = MeetingMinutesSchema.raw().replaceAll("(?m)^\\s*--.*$", "");
        for (String banned : List.of("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM")) {
            assertFalse(executable.toUpperCase().contains(banned), "可執行語句裡出現了破壞性操作: " + banned);
        }
        for (String floatType : List.of("FLOAT ", "DOUBLE ")) {
            assertFalse(executable.toUpperCase().contains(floatType), "計數欄位禁止浮點類型: " + floatType);
        }
    }

    @Test
    @DisplayName("编号规则与通知场景随脚本登记，且都不覆盖管理员改过的开关")
    void seedsRuleAndScenarioWithoutTurningAdminSettingsBack() {
        String sql = MeetingMinutesSchema.raw();
        assertTrue(sql.contains("'meeting_minutes'"), "缺少紀要單號規則或通知場景");
        assertTrue(sql.contains("ON DUPLICATE KEY UPDATE"), "編號規則重放時只刷展示元數據");
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario"),
                "通知場景必須只補行：ON DUPLICATE 改到 enabled/app_id 就會把管理員關掉的開關翻回來");
        assertFalse(sql.toUpperCase().contains("UPDATE sys_notification_scenario"),
                "腳本不得回寫通知場景的開關狀態");
    }

    @Test
    @DisplayName("backend/sql 参考副本与 classpath 真值逐字一致")
    void referenceCopyMatchesClasspathSource() throws IOException {
        String copy = Files.readString(Path.of("sql", MeetingMinutesSchema.SCRIPT));
        assertEquals(MeetingMinutesSchema.raw(), copy, "参考副本與 classpath 真值不一致");
    }

    @Test
    @DisplayName("三张表都登记了结构契约，DDL 取自同一份脚本而不是 Java 副本")
    void contractsAreRegisteredFromTheSameScript() {
        List<ContractSpec> contracts = MeetingMinutesSchema.contracts();
        List<String> expected = new java.util.ArrayList<>(TABLES);
        expected.addAll(TABLES_V2);
        expected.add(MeetingMinutesSchema.REVISION_TABLE);
        expected.add(MeetingMinutesSchema.ATTACHMENT_TABLE);
        expected.addAll(MeetingMinutesSchema.AI_TABLES);
        assertEquals(expected.size(), contracts.size(), "契約數量必須與表數量一致（旧版七张 + 正式版本表 + 附件表 + AI 两表）");
        for (int index = 0; index < expected.size(); index++) {
            ContractSpec spec = contracts.get(index);
            assertEquals(expected.get(index), spec.table());
            assertNotNull(spec.createTableIfMissing(), spec.table() + " 必須帶可自愈的 CREATE");
            assertTrue(spec.createTableIfMissing().startsWith("CREATE TABLE IF NOT EXISTS " + spec.table()),
                    spec.table() + " 的契約 DDL 必須就是腳本裡那段");
        }
        // 顺序即依赖顺序：被外键引用的表必须在前，否则启动自愈建表会 1215 失败
        assertEquals(List.of("biz_meeting_minutes", "biz_meeting_minutes_send", "biz_meeting_minutes_delivery"),
                contracts.subList(0, 3).stream().map(ContractSpec::table).toList());
    }

    @Test
    @DisplayName("迁移已登记进 catalog，并显式依赖会议底座与通知底座")
    void catalogDeclaresTheMigration() throws Exception {
        List<MigrationEntry> entries = MigrationCatalog.readAll();
        MigrationEntry minutes = entries.stream()
                .filter(entry -> "meeting:minutes:v1.0".equals(entry.getVersionKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("meeting:minutes:v1.0 未登記進 catalog.json，啟動不會自動執行"));
        assertTrue(minutes.getDependencies().contains("meeting:schema:v1.0"),
                "必須依賴會議底座：紀要表有外鍵指向 biz_meeting_booking");
        assertTrue(minutes.getDependencies().contains("notify:schema:v1.0"),
                "必須依賴通知底座：腳本要往 sys_notification_scenario 寫場景行");
        assertEquals("meetingMinutesSchemaMigrationInitializer", minutes.getExecutor(),
                "執行器 Bean 名写错时 catalog 校验不会提，但启动真的須靠它");
        // 脚本必须真在 classpath 里：CI 会校验已打进镜像，这里先钉住文件名与初始化器用的是同一个常量
        assertNotNull(getClass().getClassLoader().getResource(MeetingMinutesSchema.SCRIPT),
                "腳本未被打進 resources，迁移会在生产库上静默失败");
    }

    @Test
    void publicationSchemaAndReferenceAreIdenticalAndRegistered() throws Exception {
        String sql = MeetingMinutesSchema.raw(MeetingMinutesSchema.SCRIPT_PUBLICATION);
        assertEquals(sql, Files.readString(Path.of("sql", MeetingMinutesSchema.SCRIPT_PUBLICATION)));
        MigrationEntry entry = MigrationCatalog.readAll().stream()
                .filter(item -> MeetingMinutesSchemaMigrationInitializer.VERSION_PUBLICATION.equals(item.getVersionKey()))
                .findFirst().orElseThrow();
        assertTrue(entry.getDependencies().contains("meeting:minutes:v1.1"));
        assertEquals("meetingMinutesSchemaMigrationInitializer", entry.getExecutor());
        assertNotNull(getClass().getClassLoader().getResource(MeetingMinutesSchema.SCRIPT_PUBLICATION));
        String normalized = sql.replaceAll("\\s+", " ");
        for (String required : List.of("document_snapshot JSON", "UNIQUE KEY uk_meeting_minutes_revision_no",
                "UNIQUE KEY uk_meeting_minutes_revision_request", "FOREIGN KEY (minutes_id, revision_id)",
                "FOREIGN KEY (id, published_revision_id)", "display_order", "request_hash", "template_version")) {
            assertTrue(normalized.contains(required), required);
        }
        String executable = sql.replaceAll("(?m)^\\s*--.*$", "").toUpperCase();
        for (String forbidden : List.of("DROP ", "TRUNCATE ", "DELETE FROM", "UPDATE SYS_NOTIFICATION_TEMPLATE")) {
            assertFalse(executable.contains(forbidden), forbidden);
        }
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM sys_notification_template WHERE scene_key = 'meeting_minutes_published')"));
    }

    @Test
    void everyPublicationColumnHasTheSameHealingDdlInTheContract() {
        List<MeetingMinutesSchema.Addition> additions = MeetingMinutesSchema.publicationAdditions();
        assertEquals(13, additions.stream().filter(MeetingMinutesSchema.Addition::column).count());
        assertEquals(5, additions.stream().filter(addition -> !addition.column()).count());
        for (MeetingMinutesSchema.Addition addition : additions) {
            if (!addition.column()) continue;
            ContractSpec table = MeetingMinutesSchema.contracts().stream().filter(spec -> spec.table().equals(addition.table()))
                    .findFirst().orElseThrow();
            ContractSpec.ColumnSpec column = table.requiredColumns().stream().filter(spec -> spec.column().equals(addition.name()))
                    .findFirst().orElseThrow();
            assertEquals(addition.ddl(), column.addColumnDdl());
        }
        assertThrows(IllegalStateException.class, () -> MeetingMinutesSchema.addition("ALTER TABLE sys_user ADD COLUMN x INT"));
    }

    @Test
    void attachmentSchemaAndReferenceAreIdenticalAndRegistered() throws Exception {
        String sql = MeetingMinutesSchema.raw(MeetingMinutesSchema.SCRIPT_ATTACHMENTS);
        assertEquals(sql, Files.readString(Path.of("sql", MeetingMinutesSchema.SCRIPT_ATTACHMENTS)));
        MigrationEntry entry = MigrationCatalog.readAll().stream()
                .filter(item -> MeetingMinutesSchemaMigrationInitializer.VERSION_ATTACHMENTS.equals(item.getVersionKey()))
                .findFirst().orElseThrow();
        assertTrue(entry.getDependencies().contains("meeting:minutes-publication:v2.0"),
                "附件表外键指向纪要主表，必须晚于纪要底座执行");
        assertEquals("meetingMinutesSchemaMigrationInitializer", entry.getExecutor());
        assertNotNull(getClass().getClassLoader().getResource(MeetingMinutesSchema.SCRIPT_ATTACHMENTS));
        String normalized = sql.replaceAll("\\s+", " ");
        for (String required : List.of("CREATE TABLE IF NOT EXISTS biz_meeting_minutes_attachment",
                "UNIQUE KEY uk_meeting_minutes_attachment_no", "UNIQUE KEY uk_meeting_minutes_attachment_object",
                "UNIQUE KEY uk_meeting_minutes_attachment_request",
                "ck_meeting_minutes_attachment_size CHECK (size_bytes > 0 AND size_bytes <= 10485760)",
                "ck_meeting_minutes_attachment_status CHECK (status IN (1, 2, 3))")) {
            assertTrue(normalized.contains(required), required);
        }
        String executable = sql.replaceAll("(?m)^\\s*--.*$", "").toUpperCase();
        for (String forbidden : List.of("DROP ", "TRUNCATE ", "DELETE FROM")) {
            assertFalse(executable.contains(forbidden), forbidden);
        }
        // 二进制不得入库：附件表只允许元数据列，出现大字段类型就是写错了方向
        for (String banned : List.of("BLOB", "MEDIUMTEXT", "LONGTEXT")) {
            assertFalse(executable.contains(banned), "附件内容禁止入 MySQL，出现了大字段列: " + banned);
        }
    }

    @Test
    void existingPublicationColumnsAndConstraintsAreNotAddedTwice() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("information_schema.COLUMNS"), eq(Integer.class), anyString(), anyString())).thenReturn(1);
        when(jdbc.queryForObject(contains("information_schema.TABLE_CONSTRAINTS"), eq(Integer.class), anyString(), anyString())).thenReturn(1);
        MeetingMinutesSchemaMigrationInitializer initializer = new MeetingMinutesSchemaMigrationInitializer(jdbc, mock(SchemaVersionTracker.class));
        ReflectionTestUtils.invokeMethod(initializer, "migratePublication");
        verify(jdbc, never()).execute(contains("ALTER TABLE"));
        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS biz_meeting_minutes_revision"));
    }

    @Test
    void failedPublicationDdlIsNotSilentlyAccepted() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("information_schema.COLUMNS"), eq(Integer.class), anyString(), anyString())).thenReturn(0);
        doThrow(new DataAccessResourceFailureException("test failure")).when(jdbc)
                .execute(contains("ALTER TABLE biz_meeting_minutes ADD COLUMN published_revision_id"));
        MeetingMinutesSchemaMigrationInitializer initializer = new MeetingMinutesSchemaMigrationInitializer(jdbc, mock(SchemaVersionTracker.class));
        assertThrows(DataAccessResourceFailureException.class, () -> ReflectionTestUtils.invokeMethod(initializer, "migratePublication"));
    }

    @Test
    void publicationPostCheckRejectsMissingSnapshotColumn() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("information_schema.TABLES"), eq(Integer.class), anyString())).thenReturn(1);
        when(jdbc.queryForObject(contains("information_schema.COLUMNS"), eq(Integer.class), anyString(), anyString())).thenReturn(1);
        when(jdbc.queryForObject(contains("information_schema.COLUMNS"), eq(Integer.class),
                eq(MeetingMinutesSchema.REVISION_TABLE), eq("document_snapshot"))).thenReturn(0);
        MeetingMinutesSchemaMigrationInitializer initializer = new MeetingMinutesSchemaMigrationInitializer(jdbc, mock(SchemaVersionTracker.class));
        IllegalStateException failure = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verifyPublication"));
        assertTrue(failure.getMessage().contains("document_snapshot"));
    }

    @Test
    void revisionMapperDoesNotExposeUpdateOrDeleteOperations() {
        Class<?> mapper = com.mftb.admin.mapper.MeetingMinutesRevisionMapper.class;
        assertEquals(0, mapper.getInterfaces().length, "不可继承包含更新/删除的 BaseMapper");
        for (java.lang.reflect.Method method : mapper.getDeclaredMethods()) {
            assertFalse(method.isAnnotationPresent(org.apache.ibatis.annotations.Update.class));
            assertFalse(method.isAnnotationPresent(org.apache.ibatis.annotations.Delete.class));
        }
    }

    @Test
    @DisplayName("启动顺序：晚于会议底座、早于权限注解校验器")
    void orderingIsCorrect() {
        Order minutes = MeetingMinutesSchemaMigrationInitializer.class.getAnnotation(Order.class);
        Order meeting = MeetingSchemaMigrationInitializer.class.getAnnotation(Order.class);
        Order validator = PermissionAnnotationValidator.class.getAnnotation(Order.class);
        assertNotNull(minutes, "纪要迁移必须显式标 @Order，启动顺序不能靠 Bean 字典序");
        assertTrue(minutes.value() > meeting.value(),
                "紀要表外鍵指向 biz_meeting_booking，早於會議底座建表會直接 1215");
        assertTrue(minutes.value() < validator.value(),
                "晚於校驗器會讓紀要接口上的菜單注解被判定為不存在，非超管永久 403");
    }

    @Test
    @DisplayName("AI 笔记/提取表：classpath 真值与参考副本逐字一致、catalog 已登记、关键约束齐备")
    void aiSchemaAndReferenceAreIdenticalAndRegistered() throws Exception {
        String sql = MeetingMinutesSchema.raw(MeetingMinutesSchema.SCRIPT_AI);
        assertEquals(sql, Files.readString(Path.of("sql", MeetingMinutesSchema.SCRIPT_AI)));
        MigrationEntry entry = MigrationCatalog.readAll().stream()
                .filter(item -> MeetingMinutesSchemaMigrationInitializer.VERSION_AI.equals(item.getVersionKey()))
                .findFirst().orElseThrow(() -> new AssertionError("meeting:minutes-ai-v1.0 未登记进 catalog"));
        assertTrue(entry.getDependencies().contains("meeting:minutes-publication:v2.0"), "AI 表外键指向纪要主表，必须晚于纪要底座");
        assertEquals("meetingMinutesSchemaMigrationInitializer", entry.getExecutor());
        assertNotNull(getClass().getClassLoader().getResource(MeetingMinutesSchema.SCRIPT_AI));
        String normalized = sql.replaceAll("\\s+", " ");
        for (String required : List.of(
                "CREATE TABLE IF NOT EXISTS biz_meeting_minutes_note",
                "CREATE TABLE IF NOT EXISTS biz_meeting_minutes_ai_extraction",
                "UNIQUE KEY uk_minutes_note_owner (booking_id, owner_user_id)",
                "UNIQUE KEY uk_minutes_ai_request (operator_user_id, request_key)",
                "UNIQUE KEY uk_minutes_ai_running (active_operator_id)",
                "active_operator_id BIGINT GENERATED ALWAYS AS",
                "ck_minutes_note_length CHECK (CHAR_LENGTH(raw_text) <= 20000)",
                "ck_minutes_ai_status CHECK (status IN (0,1,2,3,4))")) {
            assertTrue(normalized.contains(required), "缺少结构事实: " + required);
        }
        // 契约必须登记两张 AI 表（可自愈），且列清单非空
        for (String table : MeetingMinutesSchema.AI_TABLES) {
            ContractSpec spec = MeetingMinutesSchema.contracts().stream()
                    .filter(item -> item.table().equals(table)).findFirst().orElseThrow();
            assertFalse(spec.requiredColumns().isEmpty(), table + " 契约应登记实体依赖列");
        }
        String executable = sql.replaceAll("(?m)^\\s*--.*$", "").toUpperCase();
        for (String forbidden : List.of("DROP ", "TRUNCATE ", "DELETE FROM")) {
            assertFalse(executable.contains(forbidden), forbidden);
        }
    }
}
