package com.mftb.admin.service.doc;

import com.mftb.admin.dto.DocNativeDTO.Head;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 文档 ACL 与密级矩阵：默认拒读、密级硬门槛、ALL 不适用于敏感文档。 */
class DocAclResolverTest {
    private JdbcTemplate jdbc;
    private DocNativeStore store;
    private DocAclResolver resolver;
    private Head head;

    @BeforeEach void setup() {
        jdbc = mock(JdbcTemplate.class);
        store = mock(DocNativeStore.class);
        when(store.jdbc()).thenReturn(jdbc);
        resolver = new DocAclResolver(store);
        head = new Head();
        head.setNodeId(41L);
        head.setSpaceId(3L);
        head.setOwnerUserId(99L);
        head.setCreatedByUserId(99L);
        head.setConfidentiality(DocAclResolver.INTERNAL);
        head.setDownloadPolicy(1);
        head.setRestricted(false);
    }

    @Test void unregisteredUserDefaultsToInternalClearance() {
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of());
        assertEquals(DocAclResolver.INTERNAL, resolver.clearance(7L));
    }

    @Test void internalUnrestrictedDocumentIsReadableWithSpaceRead() {
        assertTrue(resolver.canRead(head, 7L));
        verify(store, never()).count(contains("doc_acl_entry"), any(Object[].class));
    }

    @Test void internalRestrictedDocumentNeedsAclEntry() {
        head.setRestricted(true);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of(2));
        when(jdbc.queryForList(contains("SELECT department_id"), any(Object[].class))).thenReturn(List.of());
        doReturn(0L).when(store).count(contains("doc_document_acl"), any(Object[].class));
        doReturn(0L).when(store).count(contains("doc_acl_entry"), any(Object[].class));
        assertFalse(resolver.canRead(head, 7L));

        doReturn(1L).when(store).count(contains("doc_acl_entry"), any(Object[].class));
        assertTrue(resolver.canRead(head, 7L));
    }

    @Test void sensitiveDocumentRejectsInsufficientClearanceBeforeAcl() {
        head.setConfidentiality(DocAclResolver.SENSITIVE);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of(2));
        assertFalse(resolver.canRead(head, 7L));
        verify(store, never()).count(contains("doc_acl_entry"), any(Object[].class));
    }

    @Test void sensitiveDocumentAcceptsDepartmentAclWithClearance() {
        head.setConfidentiality(DocAclResolver.SENSITIVE);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of(3));
        when(jdbc.queryForList(contains("SELECT department_id"), any(Object[].class)))
                .thenReturn(List.of(Map.of("department_id", 5L, "function_roles", "[]", "role", "guest")));
        when(jdbc.queryForList(contains("FROM sys_role"), eq(Long.class), eq("guest"))).thenReturn(List.of());
        doReturn(0L).when(store).count(contains("doc_document_acl"), any(Object[].class));
        // USER miss, DEPT hit
        doReturn(0L, 1L).when(store).count(contains("doc_acl_entry"), any(Object[].class));
        assertTrue(resolver.canRead(head, 7L));
    }

    @Test void sensitiveDocumentDoesNotAcceptAllSubject() {
        head.setConfidentiality(DocAclResolver.SENSITIVE);
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of(4));
        when(jdbc.queryForList(contains("SELECT department_id"), any(Object[].class))).thenReturn(List.of());
        doReturn(0L).when(store).count(contains("doc_document_acl"), any(Object[].class));
        doReturn(0L).when(store).count(contains("doc_acl_entry"), any(Object[].class));
        assertFalse(resolver.canRead(head, 7L));
    }

    @Test void downloadPolicyApprovalAndRestrictedAreDenied() {
        when(jdbc.queryForList(contains("max_level"), eq(Integer.class), eq(7L))).thenReturn(List.of(4));
        assertTrue(resolver.canDownload(head, 7L));
        head.setDownloadPolicy(2);
        assertFalse(resolver.canDownload(head, 7L));
        head.setDownloadPolicy(3);
        assertFalse(resolver.canDownload(head, 7L));
        head.setDownloadPolicy(1);
        head.setConfidentiality(DocAclResolver.RESTRICTED);
        assertFalse(resolver.canDownload(head, 7L));
    }

    @Test void ownerCanEditOwnDocument() {
        head.setOwnerUserId(7L);
        assertTrue(resolver.canEdit(head, 7L));
    }

    @Test void ownerCanReadOwnSensitiveDocumentWithoutClearance() {
        head.setConfidentiality(DocAclResolver.SENSITIVE);
        head.setOwnerUserId(7L);
        assertTrue(resolver.canRead(head, 7L));
        verify(store, never()).count(contains("doc_acl_entry"), any(Object[].class));
    }
}
