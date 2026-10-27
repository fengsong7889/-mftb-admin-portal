package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** P1d 档案两表：档案元数据与销毁申请。 */
public final class DocArchiveSchema {
    public static final String SCRIPT = "297_doc_archive.sql";
    private static final Pattern TABLE = Pattern.compile("CREATE TABLE IF NOT EXISTS ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile(
            "(?m)^    ([a-z_]+)\\s+(?:BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|DECIMAL)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z_]+)");

    private DocArchiveSchema() {}

    public static List<ContractSpec> contracts() {
        List<ContractSpec> result = new ArrayList<>();
        for (String sql : MeetingMinutesSchema.statements(SCRIPT)) {
            var table = TABLE.matcher(sql);
            if (!table.find()) throw new IllegalStateException("档案 DDL 只能声明预期建表语句");
            List<ContractSpec.ColumnSpec> columns = new ArrayList<>();
            var column = COLUMN.matcher(sql);
            while (column.find()) columns.add(new ContractSpec.ColumnSpec(column.group(1), null));
            result.add(new ContractSpec("doc-archive:" + table.group(1), table.group(1), sql, columns));
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
            if (count == null || count == 0) throw new IllegalStateException("档案表未就绪: " + contract.table());
            var columns = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    String.class, contract.table());
            for (var column : contract.requiredColumns()) {
                if (!columns.contains(column.column())) {
                    throw new IllegalStateException("档案结构缺列: " + contract.table() + "." + column.column());
                }
            }
            var constraints = jdbc.queryForList(
                    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ENFORCED='YES'",
                    String.class, contract.table());
            var expected = CONSTRAINT.matcher(contract.createTableIfMissing());
            while (expected.find()) {
                if (!constraints.contains(expected.group(1))) {
                    throw new IllegalStateException("档案约束未就绪: " + expected.group(1));
                }
            }
        }
    }
}
