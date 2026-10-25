package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO;
import com.mftb.admin.dto.DocNativeDTO.Head;
import com.mftb.admin.dto.DocNativeDTO.Member;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 收窄授权回显：编辑者/空间管理员可读，集成身份与非管理编辑者被拒。 */
class DocNativeSpaceServiceTest {
    private JdbcTemplate jdbc;
    private DocNativeStore store;
    private DocNativeAccess access;
    private DocNativeSpaceService service;
    private Head head;

    @BeforeEach void setup() {
        jdbc = mock(JdbcTemplate.class);
        store = spy(new DocNativeStore(jdbc));
        access = mock(DocNativeAccess.class);
        service = new DocNativeSpaceService(store, access, mock(DocContentValidation.class), mock(SysUserMapper.class));
        head = new Head(); head.setNodeId(41L); head.setSpaceId(3L); head.setVersion(1);
        doReturn(head).when(store).head(eq(41L), anyBoolean());
        when(access.actor()).thenReturn(7L);
    }

    @Test void editorReadsRestrictedMembersWithoutNeedingManage() {
        head.setRestricted(true);
        when(access.canEdit(head, 7L)).thenReturn(true);
        when(jdbc.query(contains("FROM doc_document_acl"), any(RowMapper.class), eq(41L)))
                .thenReturn(List.of(new Member(8L, "成员甲", "MF00008", 3)));
        DocNativeDTO.AclView view = service.acl(41L);
        assertTrue(view.restricted());
        assertEquals(1, view.members().size());
        assertEquals(3, view.members().get(0).permissions());
        verify(access, never()).space(3L, DocNativeAccess.MANAGE);
    }

    @Test void spaceManagerCanMaintainEvenWithoutEditBit() {
        when(access.canEdit(head, 7L)).thenReturn(false);
        when(jdbc.query(contains("FROM doc_document_acl"), any(RowMapper.class), eq(41L))).thenReturn(List.of());
        DocNativeDTO.AclView view = service.acl(41L);
        assertFalse(view.restricted());
        assertTrue(view.members().isEmpty());
        verify(access).space(3L, DocNativeAccess.MANAGE);
    }

    @Test void plainReaderWithoutManageIsDenied() {
        when(access.canEdit(head, 7L)).thenReturn(false);
        doThrow(new BusinessException(403, "文檔不存在或不可存取")).when(access).space(3L, DocNativeAccess.MANAGE);
        assertEquals(403, assertThrows(BusinessException.class, () -> service.acl(41L)).getCode());
        verify(jdbc, never()).query(contains("FROM doc_document_acl"), any(RowMapper.class), any(Object[].class));
    }

    @Test void integrationIdentityCannotEnumerateAcl() {
        doThrow(new BusinessException(403, "集成身分只能讀取授權內容或寫入草稿")).when(access).human();
        assertEquals(403, assertThrows(BusinessException.class, () -> service.acl(41L)).getCode());
        verifyNoInteractions(jdbc);
    }
}
