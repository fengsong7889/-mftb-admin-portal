package com.mftb.admin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 周报口径一致性测试。
 *
 * <p>锁死一个真实发生过的问题：顶部「已上線」按 actual_release_date 统计本期，
 * 部门「已交付」却按当前状态快照（released/verified/closed）统计存量，
 * 于是同一屏出现「已上線 1 / 部门合计 4」，汇报时无法自圆其说。
 *
 * <p>这里不连库：捕获发给 JdbcTemplate 的 SQL 与参数，确认部门行的 delivered
 * 与顶部 summary 使用同一对日期占位符，且参数个数与占位符一致。
 */
class RdmWeeklyReportConsistencyTest {

    private JdbcTemplate jdbcTemplate;
    private RdmAnalyticsService service;
    private final List<String> sqls = new ArrayList<>();
    private final List<Object[]> args = new ArrayList<>();

    @BeforeEach
    void setUp() {
        sqls.clear();
        args.clear();
        /*
         * 用默认 Answer 记录所有 JDBC 调用，而不是逐个 stub 可变参数重载：
         * queryForList(String, Object...) 在 Mockito 里既可能收到一个 Object[]，
         * 也可能收到多个展开参数，按签名 stub 会漏匹配并抛 ClassCast。
         */
        jdbcTemplate = mock(JdbcTemplate.class, invocation -> {
            String method = invocation.getMethod().getName();
            Object[] all = invocation.getArguments();
            if ("queryForList".equals(method) && all.length >= 1) {
                sqls.add((String) all[0]);
                if (all.length == 2 && all[1] instanceof Object[] arr) {
                    args.add(arr);
                } else {
                    args.add(java.util.Arrays.copyOfRange(all, 1, all.length));
                }
                return List.<Map<String, Object>>of();
            }
            if ("queryForObject".equals(method)) {
                return 0;
            }
            return null;
        });
        service = new RdmAnalyticsService(jdbcTemplate, mock(RdmConfigService.class));
    }

    @Test
    @DisplayName("部门产出按本期上线统计，且与顶部同期使用同一对日期参数")
    void deptDeliveredUsesSamePeriodAsSummary() {
        service.weeklyReport("2026-10-19", "2026-10-25", null);

        int deptIdx = -1;
        for (int i = 0; i < sqls.size(); i++) {
            if (sqls.get(i).contains("GROUP BY dept_name")) {
                deptIdx = i;
                break;
            }
        }
        assertTrue(deptIdx >= 0, "未捕获到部门产出查询");

        String deptSql = sqls.get(deptIdx);
        // 必须按上线日期区间统计，而不是 status IN (...) 的当前快照
        assertTrue(deptSql.contains("SUM(CASE WHEN actual_release_date >= ? AND actual_release_date < ? THEN 1 ELSE 0 END) AS delivered"),
                deptSql);
        assertTrue(!deptSql.contains("SUM(CASE WHEN status IN ('released','verified','closed') THEN 1 ELSE 0 END) AS delivered"),
                "部门已交付不得回退为状态快照口径: " + deptSql);

        Object[] deptArgs = args.get(deptIdx);
        assertEquals(4, deptArgs.length, "提交与上线各一对日期参数，共 4 个");
        assertEquals(LocalDate.of(2026, 10, 19), deptArgs[0]);
        assertEquals(LocalDate.of(2026, 10, 26), deptArgs[1]);
        assertEquals(LocalDate.of(2026, 10, 19), deptArgs[2]);
        assertEquals(LocalDate.of(2026, 10, 26), deptArgs[3]);
    }

    @Test
    @DisplayName("带迭代筛选时参数顺序保持：提交区间、上线区间、迭代编码")
    void deptArgsKeepIterationLast() {
        service.weeklyReport("2026-10-19", "2026-10-25", "SP26.10");

        int deptIdx = -1;
        for (int i = 0; i < sqls.size(); i++) {
            if (sqls.get(i).contains("GROUP BY dept_name")) {
                deptIdx = i;
                break;
            }
        }
        assertTrue(deptIdx >= 0);
        Object[] deptArgs = args.get(deptIdx);
        assertEquals(5, deptArgs.length);
        assertEquals("SP26.10", deptArgs[4]);
    }

    @Test
    @DisplayName("倒挂区间直接拒绝，不生成半套统计")
    void reversedRangeRejected() {
        org.junit.jupiter.api.Assertions.assertThrows(
                com.mftb.admin.common.BusinessException.class,
                () -> service.weeklyReport("2026-10-25", "2026-10-19", null));
    }
}
