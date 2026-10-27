package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SchemaVersionTracker 加固行为验证（兼容式治理核心）：
 * 只有“任务成功且后置校验通过”才记录成功版本；失败绝不记录且可在下次启动重试；
 * 记录表初始化 DDL 失败时不置就绪标志（修复原 AtomicBoolean 提前置 true 的缺陷）。
 */
class SchemaVersionTrackerTest {

    private JdbcTemplate jdbc;
    private SchemaVersionTracker tracker;
    /** 模拟 sys_schema_version 是否已有该版本行 */
    private final AtomicBoolean applied = new AtomicBoolean(false);

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "test-build");
        // isApplied：反映 applied 状态（单 vararg 调用）
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any()))
                .thenAnswer(inv -> applied.get() ? 1 : 0);
        // 仅版本写入(INSERT INTO sys_schema_version, 单 vararg)成功时把 applied 置真；
        // 审计写入(sys_schema_migration_log, 多 vararg)不匹配此 stub，避免失败路径误置 applied
        when(jdbc.update(contains("sys_schema_version"), (Object) any())).thenAnswer(inv -> {
            applied.set(true);
            return 1;
        });
    }

    @Test
    void recordsSuccessOnlyWhenTaskAndVerifyPass() {
        AtomicBoolean taskRan = new AtomicBoolean(false);
        AtomicBoolean verifyRan = new AtomicBoolean(false);

        boolean executed = tracker.applyOnce("mod:step-v1",
                () -> taskRan.set(true), () -> verifyRan.set(true));

        assertTrue(executed);
        assertTrue(taskRan.get());
        assertTrue(verifyRan.get());
        assertTrue(applied.get(), "任务+校验成功应记录版本");
    }

    @Test
    void verifyFailureDoesNotRecordAndPropagates() {
        RuntimeException ex = assertThrows(RuntimeException.class, () ->
                tracker.applyOnce("mod:step-v2", () -> { /* task ok */ }, () -> {
                    throw new IllegalStateException("结构未就绪");
                }));

        assertTrue(ex.getMessage().contains("结构未就绪"));
        assertFalse(applied.get(), "校验失败不得记录成功版本");
    }

    @Test
    void taskFailureDoesNotRecord() {
        assertThrows(RuntimeException.class, () ->
                tracker.applyOnce("mod:step-v3", () -> {
                    throw new IllegalStateException("DDL 失败");
                }, null));

        assertFalse(applied.get());
    }

    @Test
    void alreadyAppliedSkipsTask() {
        applied.set(true);
        AtomicBoolean taskRan = new AtomicBoolean(false);

        boolean executed = tracker.applyOnce("mod:step-v4", () -> taskRan.set(true), () -> taskRan.set(false));

        assertFalse(executed, "已应用版本应跳过");
        assertFalse(taskRan.get(), "跳过时不得执行任务");
    }

    @Test
    void tableInitFailureIsRetryableOnNextCall() {
        // 首次建记录表 DDL 抛异常；后续调用应成功（就绪标志未被错误置真）
        doThrow(new RuntimeException("db down")).doNothing()
                .when(jdbc).execute(contains("sys_schema_version"));

        assertThrows(RuntimeException.class, () -> tracker.isApplied("k"));
        // 第二次调用建表应成功并返回 false（未应用）
        assertFalse(tracker.isApplied("k"));
        verify(jdbc, times(2)).execute(contains("sys_schema_version"));
    }

    @Test
    void applyOnceLegacyTwoArgStillRecordsOnSuccess() {
        assertFalse(applied.get());
        boolean executed = tracker.applyOnce("mod:legacy-v1", () -> { /* no-op */ });
        assertTrue(executed);
        assertTrue(applied.get());
        verify(jdbc, never()).queryForObject(eq("nope"), eq(Integer.class));
    }
}
