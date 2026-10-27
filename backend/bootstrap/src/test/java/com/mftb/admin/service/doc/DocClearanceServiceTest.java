package com.mftb.admin.service.doc;

import com.mftb.admin.dto.DocKnowledgeDTO.Clearance;
import com.mftb.admin.dto.DocKnowledgeDTO.ClearanceSave;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 密级授权：授予/撤销都必须写追加审计，撤销回落到 INTERNAL。 */
class DocClearanceServiceTest {
    private DocNativeStore store;
    private DocNativeAccess access;
    private DocClearanceService service;

    @BeforeEach void setup() {
        store = mock(DocNativeStore.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(store.jdbc()).thenReturn(jdbc);
        access = mock(DocNativeAccess.class);
        when(access.actor()).thenReturn(7L);
        service = new DocClearanceService(store, access, mock(DocContentValidation.class));
    }

    @Test void grantWritesCurrentValueAndAppendAudit() {
        JdbcTemplate jdbc = store.jdbc();
        when(store.count(contains("sys_user"), eq(9L))).thenReturn(1L);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(9L))).thenReturn(List.of());
        when(jdbc.query(contains("FROM doc_user_clearance c"), any(RowMapper.class), eq(9L)))
                .thenReturn(List.of(new Clearance(9L, "张三", "MF00009", 3, "管理员", null, null)));

        Clearance result = service.save(9L, new ClearanceSave(3, 30));

        assertEquals(3, result.maxLevel());
        verify(jdbc).update(contains("INSERT INTO doc_user_clearance"), eq(9L), eq(3), eq(7L), any(LocalDateTime.class));
        verify(jdbc).update(contains("INSERT INTO doc_clearance_audit"), eq(9L), eq(2), eq(3), eq(7L), any(LocalDateTime.class));
        verify(access).human();
        verify(access).menu("doc-space", "edit");
    }

    @Test void revokeDeletesCurrentValueAndAuditsFallbackToInternal() {
        JdbcTemplate jdbc = store.jdbc();
        when(store.count(contains("sys_user"), eq(9L))).thenReturn(1L);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(9L))).thenReturn(List.of(4));

        service.revoke(9L);

        verify(jdbc).update("DELETE FROM doc_user_clearance WHERE user_id=?", 9L);
        verify(jdbc).update(contains("INSERT INTO doc_clearance_audit"), eq(9L), eq(4), eq(2), eq(7L), isNull());
    }

    @Test void currentLevelDefaultsToInternalWhenMissing() {
        JdbcTemplate jdbc = store.jdbc();
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(9L))).thenReturn(List.of());
        assertEquals(DocAclResolver.INTERNAL, service.currentLevel(9L));
    }
}
