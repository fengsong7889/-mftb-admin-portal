package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.service.HrAuditService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 人事审计查询接口的映射与权限边界。
 * <p>两个端点都必须挂 {@code auditView}：漏一个就是「任何登录用户都能翻别人的稽核史」，
 * 而审计内容含敏感字段的脱敏前后值与操作人 —— 这本身就是可被用来绘制权限关系图的数据。
 */
class HrAuditControllerMappingTest {

    private final HrAuditService hrAuditService = mock(HrAuditService.class);

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new HrAuditController(hrAuditService)).build();
    }

    @Test
    @DisplayName("GET /api/hr/audit 已映射并把筛选条件原样下推到服务层")
    void queryIsMappedAndPushesFilters() throws Exception {
        when(hrAuditService.query(any(), any(), any(), any(), any(), eq(1L), eq(20L)))
                .thenReturn(new com.mftb.admin.dto.PageResult<>(java.util.List.of(), 0L));

        mockMvc().perform(get("/api/hr/audit")
                        .param("userId", "7")
                        .param("action", "SENSITIVE_VIEW")
                        .param("from", "2026-10-01")
                        .param("to", "2026-10-18"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(0));

        verify(hrAuditService).query(eq(7L), eq("SENSITIVE_VIEW"), isNull(),
                eq(LocalDate.of(2026, 10, 1)), eq(LocalDate.of(2026, 10, 18)), eq(1L), eq(20L));
    }

    @Test
    @DisplayName("两个 handler 都挂在 employee-management:auditView 上且只读")
    void everyHandlerRequiresAuditView() {
        Method[] handlers = Arrays.stream(HrAuditController.class.getDeclaredMethods())
                .filter(m -> !m.isSynthetic() && !m.getName().startsWith("$"))
                .filter(m -> m.isAnnotationPresent(GetMapping.class))
                .toArray(Method[]::new);
        assertEquals(2, handlers.length, "查询与动作码清单两个端点都应存在");

        for (Method method : handlers) {
            RequirePermission permission = method.getAnnotation(RequirePermission.class);
            assertNotNull(permission, "端点漏挂 @RequirePermission: " + method.getName());
            assertEquals(EmployeeConstants.MENU_EMPLOYEE, permission.menu());
            assertEquals(EmployeeConstants.ACTION_AUDIT_VIEW, permission.action(),
                    "审计端点必须用独立的 auditView，不能退回 view: " + method.getName());
        }
    }

    @Test
    @DisplayName("auditView 已进可授权动作全集（否则授权中心勾不到，普通角色永久 403）")
    void auditViewIsGrantable() {
        assertNotNull(EmployeeConstants.ACTION_AUDIT_VIEW);
        org.junit.jupiter.api.Assertions.assertTrue(
                EmployeeConstants.GRANTABLE_ACTIONS.contains(EmployeeConstants.ACTION_AUDIT_VIEW),
                "EmployeeConstants.GRANTABLE_ACTIONS 缺 auditView");
        org.junit.jupiter.api.Assertions.assertTrue(
                EmployeeConstants.GRANTABLE_ACTIONS_JSON.contains("auditView"),
                "写入 sys_menu.actions 的 JSON 字面量与动作集不一致");
    }
}
