package com.mftb.admin.config.migration;

import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * 契约只读校验工具：不执行任何 DDL，仅返回缺失项列表。
 * 供 {@link SchemaContractValidator} 的只读模式与 schema-check CLI 复用，保证口径一致。
 */
final class SchemaContractChecker {

    private SchemaContractChecker() {
    }

    static List<String> validateOnly(JdbcTemplate jdbcTemplate, List<ContractSpec> contracts) {
        List<String> drift = new ArrayList<>();
        for (ContractSpec spec : contracts) {
            if (!tableExists(jdbcTemplate, spec.table())) {
                drift.add("表不存在: " + spec.table());
                continue;
            }
            for (ContractSpec.ColumnSpec col : spec.requiredColumns()) {
                if (!columnExists(jdbcTemplate, spec.table(), col.column())) {
                    drift.add("列不存在: " + spec.table() + "." + col.column());
                }
            }
        }
        return drift;
    }

    static boolean tableExists(JdbcTemplate jdbcTemplate, String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    static boolean columnExists(JdbcTemplate jdbcTemplate, String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
