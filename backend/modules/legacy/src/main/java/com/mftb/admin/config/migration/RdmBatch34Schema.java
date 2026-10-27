package com.mftb.admin.config.migration;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 第三、四批结构唯一来源是已打包SQL。仅解析本类白名单脚本中的简单DDL，不能处理用户SQL。
 * 每条ADD先读information_schema，MySQL DDL中断后可重入；任何失败均向初始化器传播。
 * 旧脚本仅提取CREATE作为契约，不执行旧种子，更不读取sql目录中的破坏性参考脚本。
 */
@Component
@RequiredArgsConstructor
public class RdmBatch34Schema {
    public static final String VERSION_3 = "rdm:schema:v3.2";
    public static final String VERSION_4 = "rdm:schema:v3.3";
    public static final String SCRIPT_3 = "237_rdm_batch3_test_release.sql";
    public static final String SCRIPT_4 = "238_rdm_batch4_migration.sql";
    private static final List<String> BASE_SCRIPTS = List.of(
            "219_rdm_batch1_project_delivery.sql", "220_rdm_batch2_foundation.sql");
    private static final Pattern CREATE = Pattern.compile("CREATE TABLE IF NOT EXISTS (rdm_[a-z0-9_]+) \\((.*)\\) ENGINE=.*", Pattern.DOTALL);
    private static final Pattern ALTER = Pattern.compile("ALTER TABLE (rdm_[a-z0-9_]+) ADD (.+)", Pattern.DOTALL);
    private static final Pattern COLUMN = Pattern.compile("([a-z][a-z0-9_]*) (BIGINT|INT|TINYINT|VARCHAR|CHAR|JSON|TEXT|DATETIME|DATE)(.*)", Pattern.DOTALL);
    private static final Pattern INDEX = Pattern.compile("(UNIQUE )?KEY ([a-z0-9_]+) \\(([^)]+)\\)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z0-9_]+) (.+)", Pattern.DOTALL);
    private final JdbcTemplate jdbc;

    public record Column(String table, String name, String definition) {
        public String ddl() { return "ALTER TABLE " + table + " ADD COLUMN " + definition; }
        public boolean required() { return definition.contains("NOT NULL") || definition.contains("PRIMARY KEY"); }
        public boolean healable() {
            return !definition.contains("GENERATED") && !definition.contains("PRIMARY KEY")
                    && (!required() || definition.contains("DEFAULT "));
        }
    }
    public record Index(String table, String name, List<String> columns, boolean unique, String ddl) { }
    public record Constraint(String table, String name, String definition, String ddl) { }
    public record Definition(Map<String, String> creates, List<Column> columns,
                             List<Index> indexes, List<Constraint> constraints, List<String> seeds) { }

    public static Definition definition(String script) {
        if (!BASE_SCRIPTS.contains(script) && !SCRIPT_3.equals(script) && !SCRIPT_4.equals(script)) {
            throw new IllegalArgumentException("未登记的RDM结构资源");
        }
        Map<String, String> creates = new LinkedHashMap<>();
        List<Column> columns = new ArrayList<>();
        List<Index> indexes = new ArrayList<>();
        List<Constraint> constraints = new ArrayList<>();
        List<String> seeds = new ArrayList<>();
        for (String sql : statements(script)) {
            Matcher create = CREATE.matcher(sql);
            Matcher alter = ALTER.matcher(sql);
            if (create.matches()) {
                String table = create.group(1);
                creates.put(table, sql);
                for (String line : create.group(2).split("\\R")) {
                    String item = line.trim().replaceFirst(",$", "");
                    if (!item.isEmpty()) parseItem(table, item, columns, indexes, constraints);
                }
            } else if (alter.matches() && !BASE_SCRIPTS.contains(script)) {
                parseItem(alter.group(1), alter.group(2).replaceFirst("^COLUMN ", ""), columns, indexes, constraints);
            } else if (SCRIPT_4.equals(script) && sql.startsWith("INSERT INTO rdm_flow_config (scope_key,")) {
                seeds.add(sql);
            } else if (!BASE_SCRIPTS.contains(script)) {
                throw new IllegalStateException("RDM结构脚本含未允许语句: " + script);
            }
        }
        return new Definition(creates, columns, indexes, constraints, seeds);
    }

    private static void parseItem(String table, String item, List<Column> columns,
                                  List<Index> indexes, List<Constraint> constraints) {
        Matcher column = COLUMN.matcher(item);
        Matcher index = INDEX.matcher(item);
        Matcher constraint = CONSTRAINT.matcher(item);
        if (column.matches()) {
            columns.add(new Column(table, column.group(1), item));
            if (item.contains("PRIMARY KEY")) {
                indexes.add(new Index(table, "PRIMARY", List.of(column.group(1)), true, null));
            }
        } else if (index.matches()) {
            indexes.add(new Index(table, index.group(2),
                    List.of(index.group(3).replace(" ", "").split(",")), index.group(1) != null,
                    "ALTER TABLE " + table + " ADD " + item));
        } else if (constraint.matches()) {
            constraints.add(new Constraint(table, constraint.group(1), constraint.group(2),
                    "ALTER TABLE " + table + " ADD " + item));
        } else {
            throw new IllegalStateException("RDM结构定义无法解析: " + table + "." + item);
        }
    }

    private static List<String> statements(String script) {
        try (var in = new ClassPathResource(script).getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return java.util.Arrays.stream(text.replaceAll("(?m)^\\s*--.*$", "").split(";"))
                    .map(String::trim).filter(s -> !s.isEmpty()).toList();
        } catch (IOException ex) {
            throw new IllegalStateException("RDM结构资源未打包: " + script, ex);
        }
    }

    /** 调用方必须持有MigrationLock；新表之间按SQL声明顺序建表。 */
    public void migrate(String script) {
        if (!SCRIPT_3.equals(script) && !SCRIPT_4.equals(script)) throw new IllegalArgumentException("只允许新增批次迁移");
        Definition def = definition(script);
        def.creates().values().forEach(jdbc::execute);
        for (Column col : def.columns()) {
            if (!columnExists(col.table(), col.name())) {
                // 新表被部分手工创建且缺少不可回填事实时拒绝臆造必填证据。
                if (def.creates().containsKey(col.table()) && !col.healable()) {
                    throw new IllegalStateException("RDM缺少不可自动回填的事实列: " + col.table() + "." + col.name());
                }
                jdbc.execute(col.ddl());
            }
        }
        for (Index index : def.indexes()) {
            if (indexRows(index).isEmpty()) {
                if (index.ddl() == null) throw new IllegalStateException("RDM主键缺失: " + index.table());
                jdbc.execute(index.ddl());
            }
        }
        for (Constraint constraint : def.constraints()) {
            if (!constraintExists(constraint)) jdbc.execute(constraint.ddl());
        }
        def.seeds().forEach(jdbc::execute);
    }

    /** 版本已记录也必须调用，索引不能仅凭名字存在就视为正确。 */
    public void verify(String script) {
        Definition def = definition(script);
        for (Column col : def.columns()) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT IS_NULLABLE, DATA_TYPE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", col.table(), col.name());
            if (rows.size() != 1) fail("缺表或缺列", col.table() + "." + col.name());
            Map<String, Object> row = rows.get(0);
            if (col.required() && !"NO".equals(row.get("IS_NULLABLE"))) fail("应为非空列", col.table() + "." + col.name());
            Matcher type = COLUMN.matcher(col.definition());
            if (!type.matches() || !type.group(2).equalsIgnoreCase(String.valueOf(row.get("DATA_TYPE")))) {
                fail("列类型不符", col.table() + "." + col.name());
            }
            if (col.definition().contains("GENERATED ALWAYS") && !String.valueOf(row.get("EXTRA")).contains("GENERATED")) {
                fail("唯一性生成列被替换为普通列", col.table() + "." + col.name());
            }
            Matcher defaultValue = Pattern.compile(" DEFAULT ('[^']*'|[0-9]+)(?: |$)").matcher(col.definition());
            if (defaultValue.find()) {
                String expected = defaultValue.group(1).replace("'", "");
                if (!expected.equals(String.valueOf(row.get("COLUMN_DEFAULT")))) fail("列默认值不符", col.table() + "." + col.name());
            }
        }
        for (Index index : def.indexes()) {
            List<Map<String, Object>> rows = indexRows(index);
            List<String> actual = rows.stream().map(r -> String.valueOf(r.get("COLUMN_NAME"))).toList();
            boolean unique = !rows.isEmpty() && rows.stream().allMatch(r -> ((Number) r.get("NON_UNIQUE")).intValue() == 0);
            if (!actual.equals(index.columns()) || unique != index.unique()) fail("索引列序或唯一性不符", index.table() + "." + index.name());
        }
        for (Constraint constraint : def.constraints()) {
            if (!constraintExists(constraint)) fail("约束缺失或未启用", constraint.table() + "." + constraint.name());
        }
        if (SCRIPT_4.equals(script)) {
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM rdm_flow_config WHERE scope_key = 'GLOBAL' AND project_id IS NULL", Integer.class);
            if (!Integer.valueOf(1).equals(count)) fail("GLOBAL配置必须恰为一条", "rdm_flow_config");
        }
    }

    private List<Map<String, Object>> indexRows(Index index) {
        return jdbc.queryForList("SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX",
                index.table(), index.name());
    }
    private boolean constraintExists(Constraint c) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? "
                        + "AND CONSTRAINT_TYPE = ? AND ENFORCED = 'YES'", Integer.class,
                c.table(), c.name(), c.definition().startsWith("CHECK") ? "CHECK" : "FOREIGN KEY");
        return Integer.valueOf(1).equals(count);
    }
    private boolean columnExists(String table, String column) {
        return SchemaContractChecker.columnExists(jdbc, table, column);
    }
    private static void fail(String reason, String target) {
        throw new IllegalStateException("RDM结构未就绪: " + reason + " " + target);
    }

    /** 增量加入全局契约，不替换任何其他模块；未知历史必填事实缺失时只诊断不伪造。 */
    public static List<ContractSpec> contracts() {
        Map<String, String> creates = new LinkedHashMap<>();
        Map<String, List<ContractSpec.ColumnSpec>> columns = new LinkedHashMap<>();
        for (String script : List.of(BASE_SCRIPTS.get(0), BASE_SCRIPTS.get(1), SCRIPT_3, SCRIPT_4)) {
            Definition def = definition(script);
            creates.putAll(def.creates());
            for (Column col : def.columns()) {
                columns.computeIfAbsent(col.table(), ignored -> new ArrayList<>())
                        .add(new ContractSpec.ColumnSpec(col.name(), col.healable() ? col.ddl() : null));
            }
        }
        return columns.entrySet().stream().map(entry -> new ContractSpec(
                entry.getKey().replace('_', '-'), entry.getKey(), creates.get(entry.getKey()), List.copyOf(entry.getValue()))).toList();
    }
}
