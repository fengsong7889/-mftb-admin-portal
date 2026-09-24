package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.SystemAuthorizationRequest;
import com.mftb.admin.service.PermissionRevisionService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SystemAuthorizationService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockingDetails;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SystemAuthorizationServiceImpl 关键行为单测（Round 3）。
 * <p>覆盖：授予/撤销/跨系统拒绝/内置 admin 拒绝/版本冲突。
 * <p>JdbcTemplate 方法多为可变参数（{@code update(String, Object...)}），Mockito 对
 * 单个可变参位置匹配较脆弱；本测试通过 {@code verify + ArgumentCaptor<String>}
 * 抓 SQL 前缀 + 断言 {@code evictAll} 调用点，不逐参数比对。
 */
class SystemAuthorizationServiceTest {

    private JdbcTemplate jdbc;
    private PermissionService permissionService;
    private PermissionRevisionService revisionService;
    private OperatorResolver operatorResolver;
    private SystemAuthorizationServiceImpl service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        permissionService = mock(PermissionService.class);
        revisionService = mock(PermissionRevisionService.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new SystemAuthorizationServiceImpl(jdbc, permissionService, revisionService, operatorResolver);

        // 目标存在（role/department 均视为存在）
        when(jdbc.queryForObject(contains("FROM sys_role WHERE id = ?"), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("FROM sys_department WHERE id = ?"), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
        // 系统存在（任意 code 都视为存在）
        when(jdbc.queryForObject(contains("FROM sys_system WHERE code = ?"), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
    }

    @Test
    @DisplayName("save：授予系统准入 → 触发 sys_role_system INSERT、sys_role_menu DELETE + INSERT、evictAll")
    void saveGrantsAccessAndOverwritesScopedMenus() {
        stubNonSuperAdmin();
        stubSystemMenuIndex();
        stubResolveMenuId();
        when(revisionService.currentRevision()).thenReturn(0L);

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        req.setPermissions(List.of(
                permission("ad-sales", "view", "edit"),
                permission("promotion-dashboard", "view")
        ));

        service.save(SystemAuthorizationService.TARGET_ROLE, 42L, "ads", req);

        List<String> sqls = captureUpdateSqls();
        assertTrue(sqls.stream().anyMatch(s -> s.startsWith("INSERT IGNORE INTO sys_role_system")), sqls.toString());
        assertTrue(sqls.stream().anyMatch(s -> s.startsWith("DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN")), sqls.toString());
        long inserts = sqls.stream().filter(s -> s.startsWith("INSERT INTO sys_role_menu")).count();
        assertEquals(2, inserts, "两条菜单授权应各自 INSERT 一次: " + sqls);
        verify(permissionService, times(1)).evictAll();
    }

    @Test
    @DisplayName("save：撤销系统 → sys_role_system DELETE + sys_role_menu DELETE，且不再 INSERT")
    void saveRevokeClearsScopedMenus() {
        stubNonSuperAdmin();
        stubSystemMenuIndex();
        when(revisionService.currentRevision()).thenReturn(0L);

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(false);
        req.setPermissions(List.of(permission("ad-sales", "view")));

        service.save(SystemAuthorizationService.TARGET_ROLE, 42L, "ads", req);

        List<String> sqls = captureUpdateSqls();
        assertTrue(sqls.stream().anyMatch(s -> s.startsWith("DELETE FROM sys_role_system")), sqls.toString());
        assertTrue(sqls.stream().anyMatch(s -> s.startsWith("DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN")), sqls.toString());
        assertTrue(sqls.stream().noneMatch(s -> s.startsWith("INSERT INTO sys_role_menu")), sqls.toString());
        verify(permissionService, times(1)).evictAll();
    }

    @Test
    @DisplayName("save：跨系统 menuKey → BusinessException，不触发 evictAll")
    void saveRejectsCrossSystemMenu() {
        stubNonSuperAdmin();
        // 系统内只有 ad-sales；提交 employee-management 视为跨系统
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 11L, "menu_key", "ad-sales")
        ));
        when(revisionService.currentRevision()).thenReturn(0L);

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        req.setPermissions(List.of(permission("employee-management", "view")));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(SystemAuthorizationService.TARGET_ROLE, 42L, "ads", req));
        assertTrue(ex.getMessage().contains("employee-management"), "异常消息应包含越权菜单名: " + ex.getMessage());
        verify(permissionService, never()).evictAll();
    }

    @Test
    @DisplayName("save：内置 admin 角色禁止通过本接口改系统准入")
    void saveRejectsSuperAdminRole() {
        when(jdbc.queryForObject(contains("SELECT code FROM sys_role WHERE id = ?"), eq(String.class), any(Object[].class)))
                .thenReturn("admin");

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        req.setPermissions(List.of());

        assertThrows(BusinessException.class,
                () -> service.save(SystemAuthorizationService.TARGET_ROLE, 1L, "ads", req));
    }

    @Test
    @DisplayName("save：expectedRevision 与库内不一致 → 抛 CONFLICT")
    void saveDetectsRevisionConflict() {
        stubNonSuperAdmin();
        when(revisionService.currentRevision()).thenReturn(5L);

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        req.setExpectedRevision(3L);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(SystemAuthorizationService.TARGET_ROLE, 42L, "ads", req));
        assertEquals(ResultCode.CONFLICT.getCode(), ex.getCode());
    }

    @Test
    @DisplayName("save：portal 哨兵系统拒绝授权")
    void saveRejectsPortalSentinel() {
        stubNonSuperAdmin();

        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        assertThrows(BusinessException.class,
                () -> service.save(SystemAuthorizationService.TARGET_ROLE, 42L, "portal", req));
    }

    // ──────────────────────────────────────────────────────────────
    //  工具：常用 stub + 抓取 update 调用中的 SQL 字符串
    // ──────────────────────────────────────────────────────────────
    private void stubNonSuperAdmin() {
        when(jdbc.queryForObject(contains("SELECT code FROM sys_role WHERE id = ?"), eq(String.class), any(Object[].class)))
                .thenReturn("role_biz");
    }

    private void stubSystemMenuIndex() {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 11L, "menu_key", "ad-sales"),
                Map.of("id", 12L, "menu_key", "promotion-dashboard")
        ));
    }

    @SuppressWarnings("unchecked")
    private void stubResolveMenuId() {
        when(jdbc.queryForObject(contains("SELECT id FROM sys_menu WHERE menu_key = ?"),
                any(org.springframework.jdbc.core.RowMapper.class), eq("ad-sales"))).thenReturn(11L);
        when(jdbc.queryForObject(contains("SELECT id FROM sys_menu WHERE menu_key = ?"),
                any(org.springframework.jdbc.core.RowMapper.class), eq("promotion-dashboard"))).thenReturn(12L);
    }

    private List<String> captureUpdateSqls() {
        MockingDetails details = Mockito.mockingDetails(jdbc);
        return details.getInvocations().stream()
                .filter(inv -> "update".equals(inv.getMethod().getName()))
                .map(inv -> (String) inv.getArgument(0))
                .collect(Collectors.toList());
    }

    private MenuPermissionDTO permission(String key, String... actions) {
        MenuPermissionDTO dto = new MenuPermissionDTO();
        dto.setMenuKey(key);
        dto.setActions(List.of(actions));
        return dto;
    }
}
