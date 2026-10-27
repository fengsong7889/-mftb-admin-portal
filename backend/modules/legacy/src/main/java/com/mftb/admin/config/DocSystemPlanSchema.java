package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** 系统方案库单表：MD 正文独立归档 + 来源路径/系统/生成时间/哈希。 */
public final class DocSystemPlanSchema {
    public static final String SCRIPT = "298_doc_system_plan.sql";
    private static final Pattern TABLE = Pattern.compile("CREATE TABLE IF NOT EXISTS ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile(
            "(?m)^    ([a-z_]+)\\s+(?:BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|DECIMAL)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z_]+)");

    private DocSystemPlanSchema() {}

    public static List<ContractSpec> contracts() {
        List<ContractSpec> result = new ArrayList<>();
        for (String sql : MeetingMinutesSchema.statements(SCRIPT)) {
            var table = TABLE.matcher(sql);
            if (!table.find()) throw new IllegalStateException("系统方案 DDL 只能声明预期建表语句");
            List<ContractSpec.ColumnSpec> columns = new ArrayList<>();
            var column = COLUMN.matcher(sql);
            while (column.find()) columns.add(new ContractSpec.ColumnSpec(column.group(1), null));
            result.add(new ContractSpec("doc-system-plan:" + table.group(1), table.group(1), sql, columns));
        }
        return result;
    }

    public static void migrate(JdbcTemplate jdbc) {
        for (var contract : contracts()) jdbc.execute(contract.createTableIfMissing());
    }

    public static void verify(JdbcTemplate jdbc) {
        for (var contract : contracts()) {
            Long count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    Long.class, contract.table());
            if (count == null || count == 0) throw new IllegalStateException("系统方案表未就绪: " + contract.table());
            var columns = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    String.class, contract.table());
            for (var column : contract.requiredColumns()) {
                if (!columns.contains(column.column())) {
                    throw new IllegalStateException("系统方案结构缺列: " + contract.table() + "." + column.column());
                }
            }
            var constraints = jdbc.queryForList(
                    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ENFORCED='YES'",
                    String.class, contract.table());
            var expected = CONSTRAINT.matcher(contract.createTableIfMissing());
            while (expected.find()) {
                if (!constraints.contains(expected.group(1))) {
                    throw new IllegalStateException("系统方案约束未就绪: " + expected.group(1));
                }
            }
        }
    }
}
