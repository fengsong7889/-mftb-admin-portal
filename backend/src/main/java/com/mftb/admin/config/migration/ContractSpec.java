package com.mftb.admin.config.migration;

import java.util.List;

/**
 * 结构契约：描述一张当前有效业务表“必须存在”的物理结构，并声明可证明安全的自愈 DDL。
 * <p>
 * 自愈策略（保守）：
 * <ul>
 *   <li>表不存在：若提供了 {@code createTableIfMissing} 则执行它，否则视为无法自愈的漂移。</li>
 *   <li>列不存在：若对应 {@link ColumnSpec#addColumnDdl()} 非空则执行补列，否则视为漂移。</li>
 * </ul>
 * 契约只声明“必需存在”的列，允许生产表存在额外历史列；不比对逐字类型，避免误 ALTER。
 */
public record ContractSpec(
        String name,
        String table,
        String createTableIfMissing,
        List<ColumnSpec> requiredColumns) {

    /** 必需列：列名 + 可安全执行的补列 DDL（为空表示该列缺失时不可自愈）。 */
    public record ColumnSpec(String column, String addColumnDdl) {
        public boolean healable() {
            return addColumnDdl != null && !addColumnDdl.isBlank();
        }
    }
}
