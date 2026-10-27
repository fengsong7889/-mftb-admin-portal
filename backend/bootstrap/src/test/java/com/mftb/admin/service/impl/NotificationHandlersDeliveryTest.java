package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.DingTalkService.SendOutcome;
import com.mftb.admin.service.McpExternalHandler.ToolCallContext;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §八 V0-6：通知 handler 无论成功/失败都回写 ai_delivery_log */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NotificationHandlersDeliveryTest {

    @Mock private DingTalkService dingTalkService;
    @Mock private JavaMailSender mailSender;
    @Mock private AiDeliveryLogService deliveryLogService;

    @Test
    void dingTalkHandlerWritesSentWhenChannelAccepts() {
        when(dingTalkService.isEnabled()).thenReturn(true);
        when(dingTalkService.sendMarkdownSync(any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(SendOutcome.accepted("测试群"));
        DingTalkExternalHandler handler = new DingTalkExternalHandler(dingTalkService, deliveryLogService);

        Map<String, Object> args = new HashMap<>();
        args.put("content", "hello world");
        handler.execute(args, new ToolCallContext("alice", 42L, "DH-1"));

        ArgumentCaptor<AiDeliveryLog> cap = ArgumentCaptor.forClass(AiDeliveryLog.class);
        verify(deliveryLogService).record(cap.capture());
        AiDeliveryLog row = cap.getValue();
        assertEquals("SENT", row.getStatus());
        assertEquals("dingtalk_sender", row.getToolKey());
        assertEquals("alice", row.getCaller());
        assertEquals(42L, row.getConversationPk());
        assertEquals("测试群", row.getRecipientSummary());
    }

    @Test
    void dingTalkHandlerWritesFailedAndThrowsWhenChannelRejects() {
        when(dingTalkService.isEnabled()).thenReturn(true);
        when(dingTalkService.sendMarkdownSync(any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(SendOutcome.rejected("310000", "keyword not in content", "群A"));
        DingTalkExternalHandler handler = new DingTalkExternalHandler(dingTalkService, deliveryLogService);

        Map<String, Object> args = new HashMap<>();
        args.put("content", "hi");
        assertThrows(IllegalStateException.class,
                () -> handler.execute(args, new ToolCallContext("bob", null, null)));

        ArgumentCaptor<AiDeliveryLog> cap = ArgumentCaptor.forClass(AiDeliveryLog.class);
        verify(deliveryLogService).record(cap.capture());
        assertEquals("FAILED", cap.getValue().getStatus());
        assertEquals("310000", cap.getValue().getExternalErrcode());
    }

    @Test
    void emailHandlerWritesSentOnSmtpAccept() {
        EmailExternalHandler handler = new EmailExternalHandler(mailSender, deliveryLogService);
        ReflectionTestUtils.setField(handler, "host", "smtp.example.com");
        ReflectionTestUtils.setField(handler, "from", "bot@example.com");
        MimeMessage msg = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(msg);

        Map<String, Object> args = new HashMap<>();
        args.put("to", "alice@corp.com");
        args.put("subject", "Release");
        args.put("content", "hello");
        handler.execute(args, new ToolCallContext("admin", 7L, "DH-9"));

        ArgumentCaptor<AiDeliveryLog> cap = ArgumentCaptor.forClass(AiDeliveryLog.class);
        verify(deliveryLogService).record(cap.capture());
        assertEquals("SENT", cap.getValue().getStatus());
        assertEquals("a***e@corp.com", cap.getValue().getRecipientSummary());
    }

    @Test
    void emailHandlerWritesFailedOnSmtpException() {
        EmailExternalHandler handler = new EmailExternalHandler(mailSender, deliveryLogService);
        ReflectionTestUtils.setField(handler, "host", "smtp.example.com");
        ReflectionTestUtils.setField(handler, "from", "bot@example.com");
        MimeMessage msg = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(msg);
        doThrow(new RuntimeException("SMTP 550")).when(mailSender).send(any(MimeMessage.class));

        Map<String, Object> args = new HashMap<>();
        args.put("to", "alice@corp.com");
        args.put("subject", "hi");
        args.put("content", "x");
        assertThrows(IllegalStateException.class,
                () -> handler.execute(args, new ToolCallContext("carol", null, null)));

        ArgumentCaptor<AiDeliveryLog> cap = ArgumentCaptor.forClass(AiDeliveryLog.class);
        verify(deliveryLogService).record(cap.capture());
        assertEquals("FAILED", cap.getValue().getStatus());
        assertEquals("SMTP_EXCEPTION", cap.getValue().getExternalErrcode());
    }
}
