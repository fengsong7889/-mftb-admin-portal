package com.mftb.admin.config.migration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SchemaContractValidator 行为验证：每次启动自愈关键结构、置就绪位，
 * 不可自愈漂移在严格模式下中止启动、非严格模式置 not-ready 但不抛。
 */
class SchemaContractValidatorTest {

    private JdbcTemplate jdbc;
    private ContractRegistry registry;
    private MigrationLock lock;
    private DatabaseReadinessState readiness;
    private SchemaContractValidator validator;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        registry = mock(ContractRegistry.class);
        lock = mock(MigrationLock.class);
        readiness = new DatabaseReadinessState();
        validator = new SchemaContractValidator(jdbc, registry, lock, readiness);
        ReflectionTestUtils.setField(validator, "strict", false);
        ReflectionTestUtils.setField(validator, "checkOnly", false);
        // 锁：直接执行临界区任务（第 3 个参数）
        org.mockito.Mockito.doAnswer(inv -> {
            ((Runnable) inv.getArgument(2)).run();
            return null;
        }).when(lock).runExclusive(anyString(), anyInt(), any());
    }

    private ContractSpec healableContract() {
        return new ContractSpec(
                "c-test", "t_test",
                null,
                List.of(new ContractSpec.ColumnSpec("c_test",
                        "ALTER TABLE t_test ADD COLUMN c_test INT")));
    }

    private ContractSpec unhealableContract() {
        return new ContractSpec("c-test", "t_test", null,
                List.of(new ContractSpec.ColumnSpec("c_test", null)));
    }

    @Test
    void selfHealsMissingColumnThenMarksReady() {
        when(registry.allContracts()).thenReturn(List.of(healableContract()));
        // 表存在
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"))).thenReturn(1);
        // 列：自愈前缺失(0)，自愈后存在(1)
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"), eq("c_test")))
                .thenReturn(0, 1);

        validator.run();

        verify(jdbc, times(1)).execute(contains("ADD COLUMN c_test"));
        assertTrue(readiness.isReady(), "自愈成功后应置就绪");
    }

    @Test
    void unhealableDriftInStrictModeAbortsStartup() {
        when(registry.allContracts()).thenReturn(List.of(unhealableContract()));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"))).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"), eq("c_test"))).thenReturn(0);
        ReflectionTestUtils.setField(validator, "strict", true);

        assertThrows(IllegalStateException.class, () -> validator.run());
        assertFalse(readiness.isReady());
        verify(jdbc, never()).execute(contains("ADD COLUMN c_test"));
    }

    @Test
    void unhealableDriftNonStrictMarksNotReadyWithoutThrow() {
        when(registry.allContracts()).thenReturn(List.of(unhealableContract()));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"))).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"), eq("c_test"))).thenReturn(0);

        validator.run(); // 不抛

        assertFalse(readiness.isReady());
        assertFalse(readiness.getReasons().isEmpty());
    }

    @Test
    void missingTableWithHealDdlIsCreated() {
        ContractSpec withCreate = new ContractSpec("c-test", "t_test",
                "CREATE TABLE IF NOT EXISTS t_test (id INT)",
                List.of());
        when(registry.allContracts()).thenReturn(List.of(withCreate));
        // 表：第一次不存在(0)，自愈建表后存在(1)
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("t_test"))).thenReturn(0, 1);

        validator.run();

        verify(jdbc, times(1)).execute(contains("CREATE TABLE IF NOT EXISTS t_test"));
        assertTrue(readiness.isReady());
    }
}
