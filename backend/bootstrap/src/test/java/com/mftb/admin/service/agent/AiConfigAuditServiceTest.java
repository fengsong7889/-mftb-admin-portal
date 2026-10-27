package com.mftb.admin.service.agent;

import com.mftb.admin.entity.AiConfigChangeLog;
import com.mftb.admin.mapper.AiConfigChangeLogMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 配置审计：写入截断、操作人快照、失败不阻断业务。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiConfigAuditServiceTest {

    @Mock private AiConfigChangeLogMapper changeLogMapper;
    @Mock private OperatorResolver operatorResolver;

    private AiConfigAuditService service;

    @BeforeEach
    void setUp() {
        service = new AiConfigAuditService(changeLogMapper, operatorResolver, new ObjectMapper());
        when(operatorResolver.currentOperatorName()).thenReturn("管理員");
    }

    @Test
    @DisplayName("写入时保存操作人、动作与 before/after")
    void recordsAuditRow() {
        service.record("knowledge", "doc:1", "update",
                Map.of("title", "舊標題"), Map.of("title", "新標題"));

        ArgumentCaptor<AiConfigChangeLog> cap = ArgumentCaptor.forClass(AiConfigChangeLog.class);
        verify(changeLogMapper).insert(cap.capture());
        AiConfigChangeLog row = cap.getValue();
        assertEquals("knowledge", row.getConfigType());
        assertEquals("doc:1", row.getConfigKey());
        assertEquals("update", row.getAction());
        assertEquals("管理員", row.getOperator());
        assertTrue(row.getBeforeJson().contains("舊標題"));
        assertTrue(row.getAfterJson().contains("新標題"));
    }

    @Test
    @DisplayName("超长 before/after 只保留 4000 字，避免撑爆 TEXT")
    void truncatesLongJson() {
        service.record("knowledge", "doc:1", "update", Map.of("content", "字".repeat(9000)), null);

        ArgumentCaptor<AiConfigChangeLog> cap = ArgumentCaptor.forClass(AiConfigChangeLog.class);
        verify(changeLogMapper).insert(cap.capture());
        String before = cap.getValue().getBeforeJson();
        assertEquals(4001, before.length());
        assertTrue(before.endsWith("…"));
    }

    @Test
    @DisplayName("审计写入失败只记日志，不把业务保存打挂")
    void auditFailureDoesNotThrow() {
        doThrow(new RuntimeException("db down")).when(changeLogMapper).insert(any(AiConfigChangeLog.class));

        service.record("guardrail", "rule:1", "delete", null, null);
    }
}
