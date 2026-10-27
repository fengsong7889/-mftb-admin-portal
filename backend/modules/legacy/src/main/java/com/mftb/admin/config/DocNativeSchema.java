package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.ArrayList;
import java.util.regex.Pattern;

/** DDL 与结构契约共用 classpath 真值，缺列/约束时拒绝就绪，不猜测回填历史。 */
public final class DocNativeSchema {
    public static final String SCRIPT = "290_doc_native_content.sql";
    private static final Pattern TABLE = Pattern.compile("CREATE TABLE IF NOT EXISTS ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile("(?m)^    ([a-z_]+) (?:BIGINT|INT|TINYINT|VARCHAR|CHAR|LONGTEXT|JSON|DATE)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z_]+)");
    private DocNativeSchema() {}

    public static List<ContractSpec> contracts() {
        List<ContractSpec> result = new ArrayList<>();
        for (String sql : MeetingMinutesSchema.statements(SCRIPT)) {
            var table = TABLE.matcher(sql);
            if (!table.find()) throw new IllegalStateException("原生文档 DDL 只能声明预期建表语句");
            List<ContractSpec.ColumnSpec> columns = new ArrayList<>();
            var column = COLUMN.matcher(sql);
            while (column.find()) columns.add(new ContractSpec.ColumnSpec(column.group(1), null));
            result.add(new ContractSpec("doc-native:" + table.group(1), table.group(1), sql, columns));
        }
        return result;
    }

    public static void migrate(JdbcTemplate jdbc) {
        for (var contract : contracts()) jdbc.execute(contract.createTableIfMissing());
    }

    public static void verify(JdbcTemplate jdbc) {
        for (var contract : contracts()) {
            var columns = jdbc.queryForList("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", String.class, contract.table());
            for (var column : contract.requiredColumns()) {
                if (!columns.contains(column.column())) throw new IllegalStateException("原生文档结构缺列: " + contract.table() + "." + column.column());
            }
            var constraints = jdbc.queryForList("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ENFORCED='YES'", String.class, contract.table());
            var expected = CONSTRAINT.matcher(contract.createTableIfMissing());
            while (expected.find()) if (!constraints.contains(expected.group(1))) throw new IllegalStateException("原生文档约束未就绪: " + expected.group(1));
        }
        Long fulltext = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='doc_revision' AND INDEX_NAME='ft_doc_revision_content' AND INDEX_TYPE='FULLTEXT'", Long.class);
        if (fulltext == null || fulltext == 0) throw new IllegalStateException("原生文档全文索引未就绪");
    }
}
