package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.Grant;
import com.mftb.admin.dto.DocNativeDTO.GrantSave;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 校验鉴权分支与固定 SQL 契约；真实数据库时钟和并发限速须单独集成验证。 */
class DocIntegrationGrantServiceTest {
    private static final String ACTIVE_GRANT_SQL = "SELECT * FROM doc_integration_grant WHERE token_hash=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP";
    private final String token = "docint_" + "x".repeat(43);
    private JdbcTemplate jdbc;
    private DocNativeStore store;
    private DocNativeAccess access;
    private DocIntegrationGrantService service;
    private Grant grant;
    private SysUser user;

    @BeforeEach void setup() {
        jdbc = mock(JdbcTemplate.class); store = spy(new DocNativeStore(jdbc));
        access = mock(DocNativeAccess.class);
        var users = mock(SysUserMapper.class);
        var permissions = mock(PermissionService.class);
        grant = new Grant(); grant.setId(9L); grant.setSpaceId(3L); grant.setOwnerUserId(7L); grant.setCanWrite(true);
        user = new SysUser(); user.setId(7L); user.setStatus(1);
        doReturn(grant).when(store).one(ACTIVE_GRANT_SQL, Grant.class, DocContentValidation.hash(token));
        when(users.selectById(7L)).thenReturn(user);
        when(permissions.hasSystemAccess(user, "doc")).thenReturn(true);
        when(permissions.hasPermission(eq(user), eq("doc-plans"), anyString())).thenReturn(true);
        when(access.member(3L, 7L)).thenReturn(DocNativeAccess.READ | DocNativeAccess.EDIT);
        when(access.actor()).thenReturn(7L);
        when(jdbc.update(contains("request_count<120"), eq(9L))).thenReturn(1);
        var clearances = mock(DocAclResolver.class);
        when(clearances.clearance(7L)).thenReturn(2);
        service = new DocIntegrationGrantService(store, access, mock(DocContentValidation.class), users, permissions, clearances);
    }
    @Test void validGrantUsesDigestAndActivePredicate() {
        assertSame(grant, service.authenticate(token, true).grant());
        verify(store).one(ACTIVE_GRANT_SQL, Grant.class, DocContentValidation.hash(token));
        verify(jdbc).update(contains("request_count<120"), eq(9L));
    }
    @Test void noActiveGrantRejectsExpiredOrRevokedLookup() {
        doReturn(null).when(store).one(ACTIVE_GRANT_SQL, Grant.class, DocContentValidation.hash(token));
        assertEquals(401, assertThrows(BusinessException.class, () -> service.authenticate(token, false)).getCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void malformedTokenNeverQueriesStore() {
        assertEquals(401, assertThrows(BusinessException.class, () -> service.authenticate("bad", false)).getCode());
        verify(store, never()).one(anyString(), any(), any(Object[].class));
    }
    @Test void revokedMembershipIsRecheckedForEveryRequest() {
        when(access.member(3L, 7L)).thenReturn(0);
        assertEquals(403, assertThrows(BusinessException.class, () -> service.authenticate(token, false)).getCode());
    }
    @Test void readOnlyTokenCannotWriteEvenIfOwnerCanEdit() {
        grant.setCanWrite(false);
        assertEquals(403, assertThrows(BusinessException.class, () -> service.authenticate(token, true)).getCode());
    }
    @Test void userLosingEditCannotWriteWithOldWriteToken() {
        when(access.member(3L, 7L)).thenReturn(DocNativeAccess.READ);
        assertEquals(403, assertThrows(BusinessException.class, () -> service.authenticate(token, true)).getCode());
    }
    @Test void disabledOwnerCannotAuthenticate() {
        user.setStatus(0);
        assertEquals(401, assertThrows(BusinessException.class, () -> service.authenticate(token, false)).getCode());
    }
    @Test void failedAtomicRateUpdateDoesNotEstablishIdentity() {
        when(jdbc.update(contains("request_count<120"), eq(9L))).thenReturn(0);
        assertEquals(429, assertThrows(BusinessException.class, () -> service.authenticate(token, false)).getCode());
    }
    @Test void issueStoresOnlyDigestAndReturnsRawTokenOnce() {
        doReturn(10L).when(store).insert(anyString(), any(Object[].class));
        var issued = service.issue(new GrantSave(3L, "测试接入", true, 7));
        assertTrue(issued.token().matches("docint_[A-Za-z0-9_-]{43}"));
        verify(store).insert(contains("token_hash"), eq(7L), eq(3L), eq("测试接入"),
                eq(DocContentValidation.hash(issued.token())), eq(true), eq(issued.expiresAt()), eq(2));
        verify(access).human(); verify(access).space(3L, DocNativeAccess.EDIT);
    }
}
