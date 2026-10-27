package com.mftb.admin.service.agent.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 空白作用域（个人工作台/门户）必须归一到 common 再查分级。
 *
 * <p>背景：此前 {@code dataClassOf(null)} 直接返回 null，导致「无业务系统」场景即便登记了
 * common 也永久被拒，且没有任何配置能放行；归一化后仍是 fail-closed —— common 未登记照旧拒绝。
 */
class AiDataPolicyScopeTest {

    private JdbcTemplate jdbc;
    private AiDataPolicyService service;

    @BeforeEach
    void setup() {
        jdbc = mock(JdbcTemplate.class);
        service = new AiDataPolicyService(jdbc);
    }

    @Test
    void blankScopeFallsBackToCommonPolicy() {
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object[].class)))
                .thenReturn(List.of("INTERNAL"));

        assertEquals("INTERNAL", service.dataClassOf(null));
        assertEquals("INTERNAL", service.dataClassOf("  "));

        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).queryForList(anyString(), eq(String.class), captor.capture());
        assertTrue(captor.getAllValues().stream()
                        .allMatch(args -> args.length == 1 && "common".equals(args[0])),
                "空作用域必须按 common 查询");
    }

    @Test
    void explicitScopeStillQueriesItsOwnPolicy() {
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object[].class)))
                .thenReturn(List.of("SENSITIVE"));

        assertEquals("SENSITIVE", service.dataClassOf("rdm"));

        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForList(anyString(), eq(String.class), captor.capture());
        assertArrayEquals(new Object[]{"rdm"}, captor.getValue(),
                "显式系统不得回落 common，否则本系统等级会被覆盖");
    }

    @Test
    void unregisteredCommonIsStillDenied() {
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());

        assertNull(service.dataClassOf(null));

        AiDataPolicyService.Decision decision = service.evaluate(null, "deepseek-chat");
        assertFalse(decision.allowed(), "未登记 common 必须继续拒绝，不能默认放行");
        assertEquals("data_class_unclassified", decision.errorKind());
        // 两次查询都停在分级表（dataClassOf + evaluate 各一次）：未登记时不得继续读取端点批准
        verify(jdbc, times(2)).queryForList(anyString(), eq(String.class), any(Object[].class));
    }

    @Test
    void listSystemOptionsPrependsSharedScope() {
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of("code", "rdm", "name", "產研交付系統")));

        List<Map<String, Object>> rows = service.listSystemOptions();

        assertEquals(2, rows.size());
        // common 不在 sys_system，却必须能登记：否则个人工作台/门户场景永远无配置入口
        assertEquals(AiDataPolicyService.COMMON_SCOPE, rows.get(0).get("code"));
        assertEquals("rdm", rows.get(1).get("code"));
    }

    @Test
    void listSystemOptionsOrdersByExistingColumn() {
        when(jdbc.queryForList(anyString())).thenReturn(List.of());

        service.listSystemOptions();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture());
        String statement = sql.getValue().toLowerCase();
        assertTrue(statement.contains("from sys_system"), statement);
        // sys_system 的排序列是 sort_order；写成 sort 会直接 SQL 报 Unknown column（2026-10 开发环境 500）
        assertTrue(statement.contains("order by sort_order"), statement);
    }

    @Test
    void listModelOptionsReadsAiModelTable() {
        when(jdbc.queryForList(anyString())).thenReturn(List.of());

        service.listModelOptions();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture());
        String statement = sql.getValue().toLowerCase();
        assertTrue(statement.contains("from ai_model"), statement);
        assertTrue(statement.contains("deleted = 0"), statement);
        assertTrue(statement.contains("order by status desc"), statement);
    }
}
