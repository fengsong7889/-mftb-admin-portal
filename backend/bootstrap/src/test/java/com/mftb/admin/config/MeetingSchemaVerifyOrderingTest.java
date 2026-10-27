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
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 会议域「后置校验时机」门禁——钉住 2026-10-14 生产第二次启动崩溃的不变量。
 *
 * <p>事故链（第一次修好通知底座后立即暴露）：{@code verifySchema()}（{@code meeting:schema:v1.0}
 * 的后置校验）里调了 {@code verifyColumns()}，而 {@code REQUIRED_COLUMNS} 的 38 列中有 7 列
 * 不属于 230：{@code biz_meeting_booking.cancel_scope} 要等 231 补列，
 * {@code biz_meeting_series} / {@code biz_meeting_blacklist} 的 6 列要等 231 建表。
 * 于是全新库上 v1.0 任务刚跑完就必然校验失败 → 不记版本 → 抛异常 → 下次启动重跑重败，
 * Pod 永远起不来。开发库因为 v1.0 早就记了版本、{@code applyOnce} 直接 return，这个顺序错误
 * 从头到尾没在开发环境露过一次面。
 *
 * <p>所以这里锁两件事：① 一次性迁移的后置校验不得引用后续迁移才产出的结构；
 * ② 全量列校验必须排在 {@code repairSchema()} 之后，且每一项必需列都能被某个会执行的脚本补出来。
 */
class MeetingSchemaVerifyOrderingTest {

    /**
     * 被测源码的路径。多模块化（方案 P3）后业务实现位于 modules/legacy，
     * 路径在原有基础上多两层；这不是放宽断言，仍然读同一份源码做顺序校验。
     */
    private static final Path SOURCE = Path.of(
            "modules", "legacy", "src", "main", "java", "com", "mftb", "admin", "config",
            "MeetingSchemaMigrationInitializer.java");

    private static String source() throws IOException {
        return Files.readString(SOURCE);
    }

    /**
     * 剥掉整行注释（// 与 Javadoc 行），只留可执行代码。
     * <p>必要性：修复时在 verifySchema() 里写的解释性注释本身就含 "verifyColumns(" 字样，
     * 不剥离会把「解释为什么不能调」误判成「调了」，用例假红。
     */
    private static String codeOnly(String src) {
        StringBuilder sb = new StringBuilder();
        for (String line : src.split("\n", -1)) {
            String t = line.trim();
            if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) {
                continue;
            }
            sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private static String script(String name) {
        try (var in = new ClassPathResource(name).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 取出某个无参私有方法的方法体（按花括号配对），用于断言"方法里调了什么"这种结构事实 */
    private static String methodBody(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue(start >= 0, "找不到方法 " + signature + "：改名后本用例必须同步更新，不能让它静默失效");
        int bodyStart = source.indexOf('{', start);
        int depth = 0;
        for (int i = bodyStart; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}' && --depth == 0) {
                return source.substring(bodyStart, i + 1);
            }
        }
        throw new IllegalStateException("方法体花括号不配对: " + signature);
    }

    private static List<String[]> readStringArrayField(String fieldName) throws Exception {
        var field = MeetingSchemaMigrationInitializer.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        String[][] raw = (String[][]) field.get(null);
        List<String[]> list = new ArrayList<>();
        for (String[] row : raw) {
            list.add(row.clone());
        }
        return list;
    }

    @Test
    @DisplayName("v1.0 的后置校验不得引用后续迁移才产出的结构")
    void v1SchemaVerifyMustNotCheckLaterColumns() throws Exception {
        String body = methodBody(codeOnly(source()), "private void verifySchema()");
        assertFalse(body.contains("verifyColumns("),
                "verifySchema() 不能调 verifyColumns()：REQUIRED_COLUMNS 含 231 才建的表与才补的列，"
                        + "在全新库上 v1.0 永远校验不过 → 版本记不上 → 启动崩溃循环。"
                        + "全量列校验请只放在 run() 末尾（repairSchema 之后）。");
    }

    @Test
    @DisplayName("全量列校验必须排在 repairSchema 补列之后")
    void fullColumnCheckRunsAfterSelfHealing() throws Exception {
        String body = methodBody(codeOnly(source()), "public void run(String... args)");
        int repair = body.indexOf("repairSchema()");
        int verify = body.indexOf("verifyColumns()");
        assertTrue(repair >= 0 && verify >= 0, "run() 必须同时有 repairSchema() 与 verifyColumns()");
        assertTrue(repair < verify,
                "verifyColumns() 必须排在 repairSchema() 之后，否则补列还没做就先判缺列");
    }

    @Test
    @DisplayName("每一项必需列都能由会执行的脚本产出，不存在永远补不出的列")
    void everyRequiredColumnIsProducible() throws Exception {
        String b230 = script("230_meeting_core_tables.sql");
        String b231 = script("231_meeting_series_blacklist.sql");
        List<String[]> added = readStringArrayField("REQUIRED_ADDED_COLUMNS");

        for (String[] col : readStringArrayField("REQUIRED_COLUMNS")) {
            String table = col[0];
            String column = col[1];
            boolean created = createsColumn(b230, table, column) || createsColumn(b231, table, column);
            boolean healable = added.stream().anyMatch(a -> a[0].equals(table) && a[1].equals(column));
            assertTrue(created || healable,
                    table + "." + column + " 既不由 230/231 创建、也不在 repairSchema 补列清单里："
                            + "run() 末尾的 verifyColumns() 会永远失败，任何全新库都起不来");
        }
    }

    @Test
    @DisplayName("repairSchema 的补列清单必须真的带 DDL，不能是空壳条目")
    void selfHealingEntriesCarryDdl() throws Exception {
        for (String[] col : readStringArrayField("REQUIRED_ADDED_COLUMNS")) {
            assertTrue(col.length >= 3 && col[2] != null && col[2].startsWith("ADD COLUMN"),
                    col[0] + "." + col[1] + " 的补列条目缺少可执行 DDL，repairSchema 会静默跳过");
        }
    }

    /** 判断脚本是否在指定表的 CREATE TABLE 段里声明了该列 */
    private static boolean createsColumn(String script, String table, String column) {
        int start = script.indexOf("CREATE TABLE IF NOT EXISTS " + table + " (");
        if (start < 0) {
            return false;
        }
        int end = script.indexOf(") ENGINE", start);
        if (end < 0) {
            end = script.length();
        }
        Matcher m = Pattern.compile("^\\s*" + Pattern.quote(column) + "\\s+\\w", Pattern.MULTILINE)
                .matcher(script.substring(start, end));
        return m.find();
    }

    @Test
    @DisplayName("列校验与补列清单不能同时为空壳（防止有人把不变量整段删掉）")
    void columnCheckStillExists() throws Exception {
        String src = source();
        assertTrue(src.contains("private void verifyColumns()"),
                "verifyColumns() 被删了：实体缺列将重新退化为「首次查询才报 bad SQL grammar」的线上故障");
        assertTrue(readStringArrayField("REQUIRED_COLUMNS").size() >= 30,
                "REQUIRED_COLUMNS 条目数骤减：请确认不是把实体新增字段漏登记");
    }
}
