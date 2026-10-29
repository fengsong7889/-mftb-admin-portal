package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 会议纪要 DDL 的单一入口：脚本读取、语句切片、结构契约都由这一份 classpath 脚本派生。
 *
 * <p><b>为什么契约不在 Java 里再抄一份 CREATE 语句</b>：迁移框架要求关键写入路径表登记
 * {@link ContractSpec}（含可自愈的 DDL）。如果 Java 里再写一遍，就有了两份真值——
 * 改了脚本没改 Java 时，启动自愈会拿旧 DDL 建表，比缺表更难排查。这里直接从脚本切片，
 * 保证"执行的那份"和"能自愈的那份"是同一份文字。
 *
 * <p>顺序固定为 minutes → send → delivery：后两张表有外键指向前一张，
 * 契约自愈按登记顺序执行，颠倒顺序会让建表直接失败。
 */
public final class MeetingMinutesSchema {

    /** classpath 建表脚本（真值），backend/sql/ 下同名文件为参考副本 */
    static final String SCRIPT = "267_meeting_minutes.sql";

    /** v1.1：事项 / 关联 / 模板 / 开关（同样是唯一真值，参考副本在 backend/sql/） */
    static final String SCRIPT_V2 = "268_meeting_minutes_v2.sql";
    static final String SCRIPT_PUBLICATION = "308_meeting_minutes_publication.sql";
    static final String REVISION_TABLE = "biz_meeting_minutes_revision";
    /** 补充说明附件元数据表（二进制入对象存储，本表只存元数据） */
    static final String SCRIPT_ATTACHMENTS = "309_meeting_minutes_attachments.sql";
    static final String ATTACHMENT_TABLE = "biz_meeting_minutes_attachment";
    private static final Pattern ADDITION = Pattern.compile(
            "^ALTER TABLE (biz_meeting_minutes(?:_send|_item)?) ADD (COLUMN|CONSTRAINT) ([a-z0-9_]+) .+$",
            Pattern.DOTALL);

    /** 仅解析本模块受控资源的新增列与约束，不接收动态 SQL 或外部表名。 */
    record Addition(String table, String name, boolean column, String ddl) {
    }

    /** 契约登记顺序：被外键引用的表必须在前 */
    private static final List<String> TABLE_ORDER = List.of(
            "biz_meeting_minutes", "biz_meeting_minutes_send", "biz_meeting_minutes_delivery");

    /** v1.1 契约顺序：事项与关联的外键指向 v1 的纪要表 */
    private static final List<String> TABLE_ORDER_V2 = List.of(
            "biz_meeting_minutes_item", "biz_meeting_minutes_link",
            "sys_notification_template", "sys_notification_switch");

    /**
     * 脚本原文缓存：契约与建表都读它，启动期会调多次。
     * <p>不担心"改了脚本不重启拿旧值"——脚本在 jar 里，改它必然伴随重新构建与重启。
     */
    private static volatile String cachedRaw;

    private MeetingMinutesSchema() {
    }

    /** 脚本原文（含注释），结构锁用例与建表都读它 */
    static String raw() {
        String cached = cachedRaw;
        if (cached != null) {
            return cached;
        }
        ClassPathResource resource = new ClassPathResource(SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表腳本 " + SCRIPT + "，會議紀要表無法創建");
        }
        String read;
        try (InputStream in = resource.getInputStream()) {
            read = StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取建表腳本失敗 " + SCRIPT + ": " + e.getMessage(), e);
        }
        cachedRaw = read;
        return read;
    }

    /** 剥掉行注释后按分号切片（默认 v1 脚本） */
    static List<String> statements() {
        return statements(SCRIPT);
    }

    /** 按指定脚本切片：v1.1 的 268 脚本也走同一套解析，避免两份切分逻辑 */
    static List<String> statements(String script) {
        String stripped = raw(script).replaceAll("(?m)^\\s*--.*$", "");
        List<String> out = new ArrayList<>();
        for (String part : stripped.split(";")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return out;
    }

    /** 读取指定 classpath 脚本原文（带缓存） */
    static String raw(String script) {
        if (!SCRIPT.equals(script)) {
            return read(script);
        }
        return raw();
    }

    private static String read(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到腳本 " + script);
        }
        try (InputStream in = resource.getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取腳本失敗 " + script + ": " + e.getMessage(), e);
        }
    }

    /**
     * 三张表的结构契约。
     *
     * <p>requiredColumns 留空：本域是新表，列级漂移不可能发生（发生就意味着有人手工改库），
     * 那种情况交给 {@code MeetingMinutesSchemaMigrationInitializer#verifyColumns()} 每次启动卡住，
     * 不给契约一份"能自愈"的 ADD COLUMN——把列手工加回来从来不是安全动作。
     */
    public static List<ContractSpec> contracts() {
        List<ContractSpec> specs = new ArrayList<>();
        for (String table : TABLE_ORDER) {
            String ddl = sliceCreate(SCRIPT, table);
            if (ddl == null) {
                throw new IllegalStateException("腳本 " + SCRIPT + " 找不到 " + table + " 的建表語句，契約無法登記");
            }
            specs.add(new ContractSpec("meeting-minutes:" + table, table, ddl, publicationColumns(table)));
        }
        // v1.1 的四张表（事项/关联/模板/开关）：同样从 268 脚本切片，不另写 DDL
        for (String table : TABLE_ORDER_V2) {
            String ddl = sliceCreate(SCRIPT_V2, table);
            if (ddl == null) {
                throw new IllegalStateException("腳本 " + SCRIPT_V2 + " 找不到 " + table + " 的建表語句");
            }
            specs.add(new ContractSpec("meeting-minutes-v2:" + table, table, ddl, publicationColumns(table)));
        }
        specs.add(new ContractSpec("meeting-minutes-publication:" + REVISION_TABLE, REVISION_TABLE,
                sliceCreate(SCRIPT_PUBLICATION, REVISION_TABLE),
                List.of("id", "minutes_id", "revision_no", "schema_version", "document_snapshot", "digest",
                        "change_note", "publisher_user_id", "publisher_name", "publisher_emp_no", "published_at",
                        "draft_version", "draft_hash", "request_key", "request_hash", "created_by", "created_at",
                        "updated_by", "updated_at").stream().map(name -> new ContractSpec.ColumnSpec(name, null)).toList()));
        // 附件元数据表：外键指向会议单与纪要，自愈顺序排在它们之后；同样不给 ADD COLUMN 自愈，列漂移交给启动校验卡住
        specs.add(new ContractSpec("meeting-minutes-attachments:" + ATTACHMENT_TABLE, ATTACHMENT_TABLE,
                sliceCreate(SCRIPT_ATTACHMENTS, ATTACHMENT_TABLE), List.of()));
        return specs;
    }

    static List<Addition> publicationAdditions() {
        return statements(SCRIPT_PUBLICATION).stream().filter(sql -> sql.startsWith("ALTER TABLE "))
                .map(MeetingMinutesSchema::addition).toList();
    }

    static Addition addition(String sql) {
        Matcher match = ADDITION.matcher(sql);
        if (!match.matches()) throw new IllegalStateException("纪要版本迁移只允许受控的 ADD COLUMN/CONSTRAINT 语句");
        return new Addition(match.group(1), match.group(3), "COLUMN".equals(match.group(2)), sql);
    }

    private static List<ContractSpec.ColumnSpec> publicationColumns(String table) {
        return publicationAdditions().stream().filter(add -> add.column() && add.table().equals(table))
                .map(add -> new ContractSpec.ColumnSpec(add.name(), add.ddl())).toList();
    }

    /** 从脚本里切出某张表的 CREATE TABLE 全文（到该表段落结束的 ENGINE 行为止） */
    private static String sliceCreate(String script, String table) {
        String sql = raw(script);
        int start = sql.indexOf("CREATE TABLE IF NOT EXISTS " + table + " (");
        if (start < 0) {
            return null;
        }
        int end = sql.indexOf(") ENGINE=InnoDB", start);
        if (end < 0) {
            throw new IllegalStateException(table + " 建表語句未以 ENGINE=InnoDB 收尾，切片失敗");
        }
        int tail = sql.indexOf(';', end);
        if (tail < 0) {
            tail = sql.length();
        }
        return sql.substring(start, tail).trim();
    }
}
