package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 快照 SQL 一致性测试（阶段 6）。
 * <p>锁死一个真实发生过的缺陷：归属条件把 dimId 直接拼进 SQL，参数却按「带占位符」传，
 * 于是 DEPT / PM 两个维度的快照每天都整体失败，对外只表现为「部门看板没数据」。
 * 现在每个调用点都过 {@code requireArgCount}，这里把三个维度各跑一遍。
 */
class RdmMetricSnapshotSqlTest {

    private JdbcTemplate jdbcTemplate;
    private RdmMetricSnapshotInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        initializer = new RdmMetricSnapshotInitializer(jdbcTemplate);
        // 部门与 PM 维度各一个归属对象：让带归属条件的 SQL 真正被执行到
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(Map.of("id", 7L, "name", "研發部")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(null);
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class))).thenReturn(null);
    }

    @Test
    @DisplayName("三个维度的快照 SQL 占位符与参数个数全部一致")
    void allDimensionsHaveMatchingArgs() {
        assertDoesNotThrow(() -> initializer.snapshotDay(LocalDate.of(2026, 10, 5)));
    }

    @Test
    @DisplayName("占位符与参数不一致时立刻抛出，不带病写快照")
    void mismatchIsRejected() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> RdmMetricSnapshotInitializer.requireArgCount("SELECT ? AND ?", new Object[]{1}));
        assertTrue(ex.getMessage().contains("個參數"), ex.getMessage());

        assertDoesNotThrow(() -> RdmMetricSnapshotInitializer.requireArgCount("SELECT ? AND ?", new Object[]{1, 2}));
        assertDoesNotThrow(() -> RdmMetricSnapshotInitializer.requireArgCount("SELECT 1", new Object[]{}));
    }

    @Test
    @DisplayName("重算入口拒绝倒挂区间与超长区间")
    void recomputeBounds() {
        assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> initializer.recompute(LocalDate.of(2026, 10, 6), LocalDate.of(2026, 10, 5)));
        assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> initializer.recompute(LocalDate.of(2025, 1, 1), LocalDate.of(2026, 12, 31)));
        assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> initializer.recompute(null, LocalDate.now()));
    }
}
