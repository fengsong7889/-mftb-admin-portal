package com.mftb.admin.controller;

import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MenuVO;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.service.MenuService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * PortalController 单元测试（阶段 B · 系统准入）。
 * <p>
 * 与 SecurityTestBase 解耦：本类通过纯 Mockito 构造 Controller 依赖，
 * 避免额外 @MockBean 触发 Spring test context 缓存切换、连带污染
 * {@code BudgetReservationServiceTest} 等对 MyBatis-Plus TableInfo 全局状态敏感的测试。
 * <p>
 * 覆盖：
 * <ul>
 *   <li>普通用户返回其可进入系统列表（按 codes 顺序）；</li>
 *   <li>未知 code（例如系统被停用）静默跳过；</li>
 *   <li>无任何系统时返回空数组；</li>
 *   <li>{@code superAdmin} 标志正确反映 sys_user.role。</li>
 * </ul>
 */
class PortalControllerTest {

    private PermissionService permissionService;
    private SysSystemMapper sysSystemMapper;
    private OperatorResolver operatorResolver;
    private MenuService menuService;
    private PortalController controller;

    @BeforeEach
    void setUp() {
        permissionService = mock(PermissionService.class);
        sysSystemMapper = mock(SysSystemMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        menuService = mock(MenuService.class);
        controller = new PortalController(permissionService, sysSystemMapper, operatorResolver, menuService);
    }

    @Test
    @DisplayName("普通用户按 codes 顺序返回可访问系统")
    void userGetsAccessibleSystems() {
        SysUser user = buildUser("emp001", "guest");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(sysSystemMapper.selectList(ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<SysSystem>>any()))
                .thenReturn(List.of(buildSystem("ads", "廣告與推廣系統", 10), buildSystem("hr", "HR 系統", 60)));
        when(permissionService.listAccessibleSystems(user)).thenReturn(List.of("hr", "ads"));

        Result<Map<String, Object>> result = controller.context();

        assertEquals(200, result.getCode());
        @SuppressWarnings("unchecked")
        List<PortalSystemVO> systems = (List<PortalSystemVO>) result.getData().get("systems");
        assertEquals(2, systems.size());
        // 顺序由 listAccessibleSystems 决定：hr 在前
        assertEquals("hr", systems.get(0).getCode());
        assertEquals("ads", systems.get(1).getCode());
        assertFalse((Boolean) result.getData().get("superAdmin"));
    }

    @Test
    @DisplayName("未知 code 被安全忽略（例如系统已停用但残留准入）")
    void unknownCodeIgnored() {
        SysUser user = buildUser("emp002", "guest");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(sysSystemMapper.selectList(ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<SysSystem>>any()))
                .thenReturn(List.of(buildSystem("ads", "廣告與推廣系統", 10)));
        when(permissionService.listAccessibleSystems(user)).thenReturn(List.of("ads", "finance"));

        Result<Map<String, Object>> result = controller.context();
        @SuppressWarnings("unchecked")
        List<PortalSystemVO> systems = (List<PortalSystemVO>) result.getData().get("systems");
        assertEquals(1, systems.size());
        assertEquals("ads", systems.get(0).getCode());
    }

    @Test
    @DisplayName("未分配系统 → 返回空数组而非报错")
    void emptyAccessibleSystemsReturnsEmptyList() {
        SysUser user = buildUser("emp003", "guest");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(sysSystemMapper.selectList(ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<SysSystem>>any()))
                .thenReturn(List.of());
        when(permissionService.listAccessibleSystems(user)).thenReturn(List.of());

        Result<Map<String, Object>> result = controller.context();
        @SuppressWarnings("unchecked")
        List<PortalSystemVO> systems = (List<PortalSystemVO>) result.getData().get("systems");
        assertNotNull(systems);
        assertTrue(systems.isEmpty());
    }

    @Test
    @DisplayName("超管角色标志 superAdmin=true；未登录用户不抛异常返回空")
    void superAdminFlagAndNullUser() {
        // 超管：listAccessibleSystems 由 service 层返回全部启用系统，Controller 只透传
        SysUser admin = buildUser("admin", "admin");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(sysSystemMapper.selectList(ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<SysSystem>>any()))
                .thenReturn(List.of(buildSystem("ads", "廣告與推廣系統", 10)));
        when(permissionService.listAccessibleSystems(admin)).thenReturn(List.of("ads"));
        Result<Map<String, Object>> result = controller.context();
        assertEquals(Boolean.TRUE, result.getData().get("superAdmin"));

        // 未登录：不抛异常，返回空 systems + superAdmin=false
        when(operatorResolver.currentUser()).thenReturn(null);
        when(permissionService.listAccessibleSystems(null)).thenReturn(List.of());
        Result<Map<String, Object>> anonResult = controller.context();
        assertEquals(Boolean.FALSE, anonResult.getData().get("superAdmin"));
    }

    private SysUser buildUser(String username, String role) {
        SysUser u = new SysUser();
        u.setId(1L);
        u.setUsername(username);
        u.setRole(role);
        u.setStatus(1);
        return u;
    }

    private SysSystem buildSystem(String code, String name, int sort) {
        SysSystem s = new SysSystem();
        s.setCode(code);
        s.setName(name);
        s.setSort(sort);
        s.setStatus(1);
        s.setDeleted(0);
        return s;
    }

    @Test
    @DisplayName("无系统准入访问 navigation → 抛 PermissionDeniedException")
    void navigationDeniedWithoutSystemAccess() {
        SysUser user = buildUser("emp-x", "guest");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(permissionService.hasSystemAccess(user, "hr")).thenReturn(false);

        assertThrows(PermissionDeniedException.class, () -> controller.navigation("hr"));
    }

    @Test
    @DisplayName("navigation 仅返回当前系统且当前用户有 view 权限的叶子菜单")
    void navigationFiltersBySystemAndPermission() {
        SysUser user = buildUser("emp-y", "guest");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(permissionService.hasSystemAccess(user, "hr")).thenReturn(true);

        MenuVO hrRoot = buildMenu(1L, null, "hr", "HR", 1, "hr");
        MenuVO allowed = buildMenu(11L, 1L, "employee-management", "員工管理", 2, "hr");
        allowed.setPath("/employee-management");
        MenuVO denied = buildMenu(12L, 1L, "organization-management", "組織管理", 2, "hr");
        denied.setPath("/organization-management");
        hrRoot.setChildren(List.of(allowed, denied));

        MenuVO adsRoot = buildMenu(2L, null, "merchant_promotion", "商家推廣", 1, "ads");
        MenuVO adsLeaf = buildMenu(21L, 2L, "ad-sales", "廣告銷售", 2, "ads");
        adsLeaf.setPath("/ad-sales");
        adsRoot.setChildren(List.of(adsLeaf));

        when(menuService.tree()).thenReturn(List.of(hrRoot, adsRoot));
        when(permissionService.hasPermission(user, "employee-management", "view")).thenReturn(true);
        when(permissionService.hasPermission(user, "organization-management", "view")).thenReturn(false);

        Result<List<MenuVO>> result = controller.navigation("hr");
        assertEquals(200, result.getCode());
        List<MenuVO> scoped = result.getData();
        assertEquals(1, scoped.size(), "仅返回 hr 系统根");
        assertEquals("hr", scoped.get(0).getMenuKey());
        List<MenuVO> children = scoped.get(0).getChildren();
        assertEquals(1, children.size(), "仅保留有 view 权限的叶子");
        assertEquals("employee-management", children.get(0).getMenuKey());
    }

    private MenuVO buildMenu(Long id, Long parentId, String menuKey, String name, int type, String systemCode) {
        MenuVO m = new MenuVO();
        m.setId(id);
        m.setParentId(parentId);
        m.setMenuKey(menuKey);
        m.setName(name);
        m.setType(type);
        m.setStatus(1);
        m.setSystemCode(systemCode);
        m.setChildren(new java.util.ArrayList<>());
        return m;
    }
}
