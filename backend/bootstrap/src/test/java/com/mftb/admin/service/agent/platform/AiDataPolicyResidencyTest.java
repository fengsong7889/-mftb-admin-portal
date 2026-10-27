package com.mftb.admin.service.agent.platform;

import com.mftb.admin.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 端点批准的 residency 校验：非法值必须拒绝，不得静默降级成 external。
 *
 * <p>背景：此前实现是 {@code "private".equals(r) ? "private" : "external"}，写错参数
 * 会被悄悄放宽成「可出域」，属 fail-open；本用例钉住修复后的 fail-closed 行为。
 */
class AiDataPolicyResidencyTest {

    private JdbcTemplate jdbc;
    private AiDataPolicyService service;

    @BeforeEach
    void setup() {
        jdbc = mock(JdbcTemplate.class);
        service = new AiDataPolicyService(jdbc);
    }

    @Test
    void rejectsUnknownResidencyInsteadOfCoercingToExternal() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.approveEndpoint("qwen3.7-flash", "INTERNAL", "cn", 30, null, "admin"));

        assertEquals(400, error.getCode());
        assertTrue(error.getMessage().contains("residency"), error.getMessage());
        // 拒绝必须发生在落库之前，否则仍会写入一条被放宽的批准
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void acceptsPrivateAndNormalisesCase() {
        service.approveEndpoint("qwen3.7-flash", "INTERNAL", "PRIVATE", 30, null, "admin");

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO ai_endpoint_approval"), args.capture());
        assertTrue(java.util.Arrays.asList(args.getValue()).contains("private"),
                "大寫輸入應正規化為 private");
    }

    @Test
    void blankResidencyDefaultsToExternal() {
        service.approveEndpoint("qwen3.7-flash", "INTERNAL", "  ", 30, null, "admin");

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO ai_endpoint_approval"), args.capture());
        assertTrue(java.util.Arrays.asList(args.getValue()).contains("external"),
                "留空時按既有語義默認 external");
    }

    @Test
    void outOfRangeDaysFallsBackToNinety() {
        service.approveEndpoint("qwen3.7-flash", "INTERNAL", "external", 9999, null, "admin");

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO ai_endpoint_approval"), args.capture());
        // 參數順序：modelKey, maxDataClass, residency, operator, expiresAt, note
        assertTrue(args.getValue()[0].equals("qwen3.7-flash"));
        assertTrue(args.getValue()[2].equals("external"));
    }
}
