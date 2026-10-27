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
 * 考勤建表脚本结构锁。
 * <p>
 * 为什么用文本断言而不是连 H2 跑一遍：脚本里的 STORED 生成列、{@code DATE_FORMAT}
 * 与 InnoDB 外键都是 MySQL 方言，H2 即使开 MySQL 模式也不能等价执行——真跑一遍会得到
 * "看起来测过了"的假绿。这里锁的是**幂等与唯一键集合**这些真正决定数据正确性的事实，
 * 方言执行由启动期的 {@code verifySchema}（查 information_schema）在真实库上把关。
 */
class AttendanceSchemaScriptTest {

    private static final String SCRIPT = "229_attendance_core_tables.sql";

    private static final List<String> TABLES = List.of(
            "att_shift", "att_holiday", "att_group", "att_group_member", "att_schedule",
            "att_punch_log", "att_exception", "att_day_summary", "att_monthly_summary");

    /** 幂等与防重复发薪的全部依据：一个都不能少 */
    private static final List<String> UNIQUE_KEYS = List.of(
            "uk_shift_active_code", "uk_holiday_active_date", "uk_group_active_no", "uk_group_active_name",
            "uk_member_active_scope", "uk_schedule_active_user_date", "uk_punch_active_idem",
            "uk_exception_active_user_date_type", "uk_day_active_date_group", "uk_monthly_active_month_user");

    private String classpathScript() {
        try (var in = new ClassPathResource(SCRIPT).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Test
    @DisplayName("9 张表与 10 个软删感知唯一键全部就位")
    void declaresEveryTableAndIdempotencyKey() {
        String sql = classpathScript();
        for (String table : TABLES) {
            assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS " + table + " ("), "缺少建表语句: " + table);
        }
        for (String key : UNIQUE_KEYS) {
            assertTrue(sql.contains("UNIQUE KEY " + key), "缺少唯一键: " + key);
        }
        // 每个唯一键都必须走生成列，否则逻辑删除后无法重建同名记录
        assertEquals(UNIQUE_KEYS.size(), countOccurrences(sql, "GENERATED ALWAYS AS"),
                "唯一键数量与生成列数量必须一致，缺一个就会出现删后无法重建或重复事实");
    }

    @Test
    @DisplayName("脚本只有幂等写入，不含破坏性语句；工时与天数禁止浮点")
    void keepsOnlyIdempotentDdlAndDecimalMeasures() {
        // 回滚段是注释，必须先剥掉行注释再判断，否则会把注释里的 DROP 误判为可执行语句
        String executable = classpathScript().replaceAll("(?m)^\\s*--.*$", "");
        for (String banned : List.of("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM")) {
            assertFalse(executable.toUpperCase().contains(banned), "可执行语句里出现了破坏性操作: " + banned);
        }
        for (String floatType : List.of("FLOAT", "DOUBLE")) {
            assertFalse(executable.toUpperCase().contains(floatType + " "), "工时/天数禁止使用浮点类型: " + floatType);
        }
    }

    @Test
    @DisplayName("两条编号规则随脚本登记，规则菜单里查得到依据")
    void seedsBothSequenceRules() {
        String sql = classpathScript();
        assertTrue(sql.contains("INSERT IGNORE INTO sys_biz_seq_rule"));
        assertTrue(sql.contains("'attendance_group'"));
        assertTrue(sql.contains("'attendance_monthly_batch'"));
    }

    @Test
    @DisplayName("异常表把判定明细与处理说明分成两列，避免重算覆盖与列宽挤占")
    void separatesJudgementDetailFromHandleRemark() {
        String sql = classpathScript();
        int start = sql.indexOf("CREATE TABLE IF NOT EXISTS att_exception");
        int end = sql.indexOf("COMMENT='考勤异常与处理状态'");
        assertTrue(start >= 0 && end > start, "未能定位 att_exception 建表段");
        // 归一空白后再断言，避免对齐空格数量变化让用例无意义地红
        String ddl = sql.substring(start, end).replaceAll("\\s+", " ");
        assertTrue(ddl.contains("detail VARCHAR(200) NOT NULL"), "判定明细由引擎写入，必须非空");
        assertTrue(ddl.contains("handle_remark VARCHAR(200) NULL"),
                "处理说明必须独立成列：追加进 detail 会与重算互相覆盖，长备注还会撑爆列宽");
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
