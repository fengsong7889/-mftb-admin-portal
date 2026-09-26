package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PermissionAuditVO;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 授权变更审计服务单测：参数校验、目标名回查、快照序列化与分页查询条件拼装。
 */
class PermissionAuditServiceImplTest {

    private JdbcTemplate jdbc;
    private OperatorResolver operatorResolver;
    private PermissionAuditServiceImpl service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("admin");
        service = new PermissionAuditServiceImpl(jdbc, operatorResolver);
    }

    @Test
    @DisplayName("record：目标名缺省时回查角色名并写入 INSERT")
    void recordResolvesTargetNameAndInserts() {
        when(jdbc.queryForList(contains("FROM sys_role WHERE id = ?"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of("财务专员"));

        service.record(PermissionAuditService.TARGET_ROLE, 7L, null, "iam",
                PermissionAuditService.CHANGE_UPDATE, List.of(), List.of("a"));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO sys_permission_audit_log"), args.capture());
        List<Object> values = List.of(args.getValue());
        assertEquals(PermissionAuditService.TARGET_ROLE, values.get(0));
        assertEquals(7L, values.get(1));
        assertEquals("财务专员", values.get(2));
        assertEquals("iam", values.get(3));
        assertEquals(PermissionAuditService.CHANGE_UPDATE, values.get(4));
        assertEquals("[]", values.get(5));
        assertEquals("[\"a\"]", values.get(6));
        assertEquals("admin", values.get(7));
    }

    @Test
    @DisplayName("record：缺少必要字段直接抛错（不允许静默漏审计）")
    void recordRejectsMissingFields() {
        assertThrows(BusinessException.class,
                () -> service.record(null, 1L, "x", null, PermissionAuditService.CHANGE_UPDATE, null, null));
        assertThrows(BusinessException.class,
                () -> service.record(PermissionAuditService.TARGET_ROLE, null, "x", null,
                        PermissionAuditService.CHANGE_UPDATE, null, null));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("query：条件拼装进 WHERE 并携带分页参数")
    void queryBuildsFiltersAndPaging() {
        when(jdbc.queryForObject(contains("SELECT COUNT(*)"), eq(Long.class), any(Object[].class)))
                .thenReturn(3L);
        when(jdbc.query(contains("FROM sys_permission_audit_log"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(new PermissionAuditVO()));

        PageResult<PermissionAuditVO> page = service.query(
                PermissionAuditService.TARGET_DEPARTMENT, 5L, PermissionAuditService.CHANGE_GRANT,
                "tom", null, null, 2, 10);

        assertEquals(3L, page.getTotal());
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(contains("LIMIT ? OFFSET ?"), any(RowMapper.class), args.capture());
        List<Object> values = List.of(args.getValue());
        assertTrue(values.contains(PermissionAuditService.TARGET_DEPARTMENT));
        assertTrue(values.contains(5L));
        assertTrue(values.contains(PermissionAuditService.CHANGE_GRANT));
        assertTrue(values.contains("%tom%"));
        // 第 2 页 × 10 条 → offset 10
        assertEquals(10L, values.get(values.size() - 1));
    }
}
