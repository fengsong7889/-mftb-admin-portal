package com.mftb.admin.service.agent.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.mapper.AiDeliveryLogMapper;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §八 V0-6：ai_delivery_log 写入 + 查询；写入异常不阻断主链路 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiDeliveryLogServiceTest {

    @Mock private AiDeliveryLogMapper mapper;

    @InjectMocks private AiDeliveryLogServiceImpl service;

    @Test
    void recordInsertsWithDefaultAttemptsOne() {
        AiDeliveryLog entry = new AiDeliveryLog();
        entry.setToolKey("email_sender");
        entry.setChannel("email");
        entry.setStatus("SENT");
        service.record(entry);
        ArgumentCaptor<AiDeliveryLog> cap = ArgumentCaptor.forClass(AiDeliveryLog.class);
        verify(mapper).insert(cap.capture());
        assertEquals(1, cap.getValue().getAttempts());
    }

    @Test
    void recordSwallowsDbFailureButReturnsEntry() {
        doThrow(new RuntimeException("DB down")).when(mapper).insert(any(AiDeliveryLog.class));
        AiDeliveryLog entry = new AiDeliveryLog();
        entry.setToolKey("dingtalk_sender");
        entry.setStatus("FAILED");
        AiDeliveryLog out = service.record(entry);
        assertSame(entry, out);
    }

    @Test
    void queryWrapsMapperPage() {
        Page<AiDeliveryLog> page = new Page<>(1, 20);
        page.setRecords(List.of());
        page.setTotal(0L);
        when(mapper.selectPage(any(), any())).thenReturn(page);
        Map<String, Object> result = service.query(1, 20, "email_sender", "SENT", "alice");
        assertInstanceOf(List.class, result.get("records"));
        assertEquals(0L, ((Number) result.get("total")).longValue());
        verify(mapper, times(1)).selectPage(any(), any());
    }

    @Test
    void maskEmailKeepsOnlyHeadAndTailOfLocalPart() {
        assertEquals("a***e@example.com", AiDeliveryLogService.maskEmail("alice@example.com"));
        assertEquals("a***@example.com", AiDeliveryLogService.maskEmail("al@example.com"));
        assertEquals("a***@example.com", AiDeliveryLogService.maskEmail("a@example.com"));
    }

    @Test
    void previewCollapsesWhitespaceAndTruncates() {
        assertEquals("hi 你好", AiDeliveryLogService.preview("hi\n 你好", 10));
        String long_ = "x".repeat(120);
        String out = AiDeliveryLogService.preview(long_, 100);
        assertEquals(101, out.length());
        assertEquals('…', out.charAt(100));
    }
}
