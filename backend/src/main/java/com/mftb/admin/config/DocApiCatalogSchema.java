package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import com.mftb.admin.constant.DocApiSystemMap;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** 全系统接口清单单表。 */
public final class DocApiCatalogSchema {
    public static final String SCRIPT = "299_doc_api_catalog.sql";
    public static final String SCRIPT_DOC = "300_doc_api_doc_fields.sql";
    private static final String[][] DOC_COLUMNS = {
            {"api_name", "VARCHAR(200) NULL COMMENT '对外接口名称'"},
            {"description", "VARCHAR(1000) NULL COMMENT '接口说明'"},
            {"scenario", "VARCHAR(2000) NULL COMMENT '使用场景/前置条件'"},
            {"auth_type", "VARCHAR(32) NOT NULL DEFAULT 'JWT' COMMENT '鉴权方式'"},
            {"auth_scope", "VARCHAR(500) NULL COMMENT '所需权限/scope'"},
            {"visibility", "TINYINT NOT NULL DEFAULT 1 COMMENT '1内部 2合作方 3公开'"},
            {"doc_status", "TINYINT NOT NULL DEFAULT 1 COMMENT '1草稿 2已发布 3已弃用'"},
            {"owner_user_id", "BIGINT NULL COMMENT '接口负责人'"},
            {"version", "VARCHAR(32) NOT NULL DEFAULT 'v1' COMMENT '接口版本'"},
            {"base_url", "VARCHAR(255) NULL COMMENT '调用基地址'"},
            {"request_example", "MEDIUMTEXT NULL COMMENT '请求示例'"},
            {"response_example", "MEDIUMTEXT NULL COMMENT '响应示例'"},
            {"error_codes", "MEDIUMTEXT NULL COMMENT '错误码说明'"},
            {"changelog", "MEDIUMTEXT NULL COMMENT '变更记录'"},
            {"active", "TINYINT NOT NULL DEFAULT 1 COMMENT '代码扫描是否仍存在'"}
    };
    private static final Pattern TABLE = Pattern.compile("CREATE TABLE IF NOT EXISTS ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile(
            "(?m)^    ([a-z_]+)\\s+(?:BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|DECIMAL)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z_]+)");

    private DocApiCatalogSchema() {}

    public static List<ContractSpec> contracts() {
        List<ContractSpec> result = new ArrayList<>();
        for (String sql : MeetingMinutesSchema.statements(SCRIPT)) {
            var table = TABLE.matcher(sql);
            if (!table.find()) throw new IllegalStateException("接口清单 DDL 只能声明预期建表语句");
            List<ContractSpec.ColumnSpec> columns = new ArrayList<>();
            var column = COLUMN.matcher(sql);
            while (column.find()) columns.add(new ContractSpec.ColumnSpec(column.group(1), null));
            result.add(new ContractSpec("doc-api-catalog:" + table.group(1), table.group(1), sql, columns));
        }
        return result;
    }

    public static void migrate(JdbcTemplate jdbc) {
        for (var contract : contracts()) jdbc.execute(contract.createTableIfMissing());
    }

    public static void addDocumentationColumns(JdbcTemplate jdbc) {
        for (String[] column : DOC_COLUMNS) {
            Long count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='doc_api_catalog' AND COLUMN_NAME=?",
                    Long.class, column[0]);
            if (count == null || count == 0) {
                jdbc.execute("ALTER TABLE doc_api_catalog ADD COLUMN " + column[0] + " " + column[1]);
            }
        }
    }

    public static void verifyDocumentationColumns(JdbcTemplate jdbc) {
        for (String[] column : DOC_COLUMNS) {
            Long count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='doc_api_catalog' AND COLUMN_NAME=?",
                    Long.class, column[0]);
            if (count == null || count == 0) throw new IllegalStateException("接口文档字段未就绪: " + column[0]);
        }
    }

    /**
     * 存量系统代码归并：早期扫描把路由前缀（agent/ad/menus…）直接当系统代码，左侧因此中英混排。
     * 按 path 重算正式系统并写回中文名；只动 {@code source='code'} 的机器行，不碰人工导入的 OpenAPI 行。
     * 幂等可重跑，返回实际更新行数。
     */
    public static int normalizeSystems(JdbcTemplate jdbc) {
        var rows = jdbc.queryForList(
                "SELECT id,path,system_code,system_name FROM doc_api_catalog WHERE source='code'");
        List<Object[]> updates = new ArrayList<>();
        for (var row : rows) {
            String code = DocApiSystemMap.code(String.valueOf(row.get("path")));
            String name = DocApiSystemMap.name(code);
            if (!code.equals(row.get("system_code")) || !name.equals(row.get("system_name"))) {
                updates.add(new Object[]{code, name, row.get("id")});
            }
        }
        if (!updates.isEmpty()) {
            jdbc.batchUpdate("UPDATE doc_api_catalog SET system_code=?,system_name=?,updated_at=NOW() WHERE id=?", updates);
        }
        return updates.size();
    }

    public static void verify(JdbcTemplate jdbc) {
        for (var contract : contracts()) {
            Long count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    Long.class, contract.table());
            if (count == null || count == 0) throw new IllegalStateException("接口清单表未就绪: " + contract.table());
            var columns = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    String.class, contract.table());
            for (var column : contract.requiredColumns()) {
                if (!columns.contains(column.column())) {
                    throw new IllegalStateException("接口清单结构缺列: " + contract.table() + "." + column.column());
                }
            }
            var constraints = jdbc.queryForList(
                    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ENFORCED='YES'",
                    String.class, contract.table());
            var expected = CONSTRAINT.matcher(contract.createTableIfMissing());
            while (expected.find()) {
                if (!constraints.contains(expected.group(1))) {
                    throw new IllegalStateException("接口清单约束未就绪: " + expected.group(1));
                }
            }
        }
    }
}
