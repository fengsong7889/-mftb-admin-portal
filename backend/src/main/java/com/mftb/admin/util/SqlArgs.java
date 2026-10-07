package com.mftb.admin.util;

/**
 * SQL 参数自检工具。
 * <p>手写长 INSERT 时，列数、占位符数、实参数三者极易错开一位；这类缺陷在没有
 * 真实数据的路径上不会被触发（例如「只有一个已交付需求时才走插入」），一旦触发就是
 * {@code No value specified for parameter N} 这种只能靠堆栈定位的运行期异常。
 * 因此在执行前直接断言，把问题留在开发期与日志里，而不是让用户看到「數據庫操作異常」。
 */
public final class SqlArgs {

    private SqlArgs() {
    }

    /**
     * 校验 SQL 的占位符数量与实参数量一致，并原样返回 SQL 便于内联使用。
     *
     * @throws IllegalStateException 数量不一致（附带 SQL 片段，便于定位）
     */
    public static String requireArgCount(String sql, Object[] args) {
        long marks = sql.chars().filter(c -> c == '?').count();
        int given = args == null ? 0 : args.length;
        if (marks != given) {
            throw new IllegalStateException("SQL 占位符 " + marks + " 個但傳了 " + given + " 個參數："
                    + sql.substring(0, Math.min(160, sql.length())));
        }
        return sql;
    }
}
