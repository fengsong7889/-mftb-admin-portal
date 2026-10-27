package com.mftb.admin.service.doc;

import com.mftb.admin.dto.DocKnowledgeDTO.AckStatus;
import com.mftb.admin.dto.DocNativeDTO.Head;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 签收：范围命中、未签收状态、签收幂等插入与审计。 */
class DocAckServiceTest {
    private DocNativeStore store;
    private JdbcTemplate jdbc;
    private DocNativeAccess access;
    private DocAclResolver aclResolver;
    private DocAckService service;
    private Head head;

    @BeforeEach void setup() {
        store = mock(DocNativeStore.class);
        jdbc = mock(JdbcTemplate.class);
        when(store.jdbc()).thenReturn(jdbc);
        access = mock(DocNativeAccess.class);
        when(access.actor()).thenReturn(7L);
        aclResolver = mock(DocAclResolver.class);
        service = new DocAckService(store, access, aclResolver,
                mock(DocKnowledgeService.class), mock(DocContentValidation.class));
        head = new Head();
        head.setNodeId(41L);
        head.setDocumentNo("DOC-41");
        head.setSpaceId(3L);
        head.setEffectiveRevisionId(83L);
        head.setConfidentiality(DocAclResolver.INTERNAL);
        when(store.head(41L, false)).thenReturn(head);
    }

    @Test void departmentTargetIsRecognizedForCurrentUser() {
        stubTargets();
        AckStatus status = service.status(41L);
        assertTrue(status.targeted());
        assertFalse(status.acknowledged());
        assertEquals(1, status.targetCount());
        assertEquals(0, status.receiptCount());
    }

    @Test void exportReceiptsEscapesFormulaAndAudits() {
        when(access.canManageAclCompat(head, 7L)).thenReturn(true);
        when(jdbc.queryForList(contains("u.name"), eq(41L), eq(83L))).thenReturn(List.of(Map.of(
                "name", "=cmd", "emp_id", "MF1",
                "acknowledged_at", Timestamp.valueOf("2026-10-24 10:00:00"),
                "source_ip", "127.0.0.1", "user_agent", "JUnit")));
        var export = service.exportReceipts(41L);
        String csv = new String(export.content(), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(csv.contains("\"'=cmd\""));
        assertEquals("DOC-41-ack-receipts.csv", export.filename());
        verify(store).audit(eq(41L), eq(3L), eq(7L), eq("ACK_EXPORT"), eq(83L), contains("rows=1"), isNull());
    }

    @Test void ackInsertsReceiptAndAuditOnlyOnce() {
        stubTargets();
        service.ack(41L, "127.0.0.1", "JUnit");

        verify(jdbc).update(contains("INSERT IGNORE INTO doc_ack_receipt"),
                eq(41L), eq(83L), eq(7L), eq("127.0.0.1"), eq("JUnit"));
        verify(store).audit(eq(41L), eq(3L), eq(7L), eq("ACK"), eq(83L), contains("ip=127.0.0.1"), isNull());
    }

    private void stubTargets() {
        when(store.count(contains("doc_ack_target"), eq(41L), eq(83L))).thenReturn(1L);
        when(store.count(contains("doc_ack_receipt"), eq(41L), eq(83L))).thenReturn(0L);
        when(jdbc.queryForList(contains("acknowledged_at"), eq(Timestamp.class), eq(41L), eq(83L), eq(7L)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("MIN(due_at)"), eq(java.sql.Date.class), eq(41L), eq(83L)))
                .thenReturn(null);
        when(jdbc.queryForList(contains("SELECT subject_type,subject_id"), eq(41L), eq(83L)))
                .thenReturn(List.of(Map.of("subject_type", "DEPT", "subject_id", "5")));
        when(aclResolver.subjects(7L)).thenReturn(new DocAclResolver.AclSubjects(7L, 5L, List.of()));
    }
}
