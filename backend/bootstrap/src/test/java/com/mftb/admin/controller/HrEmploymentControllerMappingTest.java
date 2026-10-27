package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.constant.HrProfileDiff;
import com.mftb.admin.dto.ProfileDiffReportVO;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrProfileDiffService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 雇佣期间接口的映射与权限注解边界。
 * <p>用 standalone MockMvc 打真实路径：JWT 过滤器在 Spring MVC 之前统一返回 401，
 * 「路径不存在」和「存在但未登录」在浏览器端看起来一样（考勤域实测踩过）。
 * 403 判定由 {@code @RequirePermission} 拦截器负责，本用例钉住的是
 * 「注解有没有挂、挂的是哪个动作」—— 漏挂等于端点向所有登录用户开放。
 */
class HrEmploymentControllerMappingTest {

    private final HrProfileDiffService profileDiffService = mock(HrProfileDiffService.class);
    private final HrEmploymentPeriodService employmentPeriodService = mock(HrEmploymentPeriodService.class);
    private final OrgScopeService orgScopeService = mock(OrgScopeService.class);
    private final OperatorResolver operatorResolver = mock(OperatorResolver.class);
    private final com.mftb.admin.service.HrAuditService hrAuditService =
            mock(com.mftb.admin.service.HrAuditService.class);

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new HrEmploymentController(
                profileDiffService, employmentPeriodService, orgScopeService, operatorResolver,
                hrAuditService)).build();
    }

    @Test
    @DisplayName("GET /api/hr/employment/diff-report 已映射，并把差异计数原样带出")
    void diffReportIsMapped() throws Exception {
        ProfileDiffReportVO report = new ProfileDiffReportVO();
        report.setAsOf(LocalDate.of(2026, 10, 18));
        report.setScannedUsers(12);
        report.setDiffUsers(3);
        report.setRegisterableUsers(2);
        report.getCountsByCategory().put(HrProfileDiff.PERIOD_NOT_REGISTERED, 2L);
        when(profileDiffService.report(any())).thenReturn(report);

        mockMvc().perform(get("/api/hr/employment/diff-report"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scannedUsers").value(12))
                .andExpect(jsonPath("$.data.diffUsers").value(3))
                .andExpect(jsonPath("$.data.registerableUsers").value(2))
                .andExpect(jsonPath("$.data.countsByCategory.PERIOD_NOT_REGISTERED").value(2));
    }

    @Test
    @DisplayName("POST /periods/sync 逐人校验归属后才登记（不信任前端传的 id 列表）")
    void syncChecksEveryRequestedUser() throws Exception {
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
        when(employmentPeriodService.syncFromRecords(anyLong(), anyString())).thenReturn(1);

        mockMvc().perform(post("/api/hr/employment/periods/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[11,12]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updatedUsers").value(2))
                .andExpect(jsonPath("$.data.periods").value(2));

        verify(orgScopeService).requireVisibleUser(11L);
        verify(orgScopeService).requireVisibleUser(12L);
        verify(employmentPeriodService, times(2)).syncFromRecords(anyLong(), anyString());
        // 登记雇佣期间会直接成为「本次雇佣起点」，所以每人必须落一条 PERIOD_REGISTER 审计
        verify(hrAuditService, times(2)).record(org.mockito.ArgumentMatchers.argThat(
                entry -> com.mftb.admin.constant.HrAuditAction.PERIOD_REGISTER.equals(entry.getAction())));
    }

    @Test
    @DisplayName("范围外的人被拦下后，整批都不登记")
    void outOfScopeUserBlocksWholeBatch() {
        doThrow(new BusinessException("無權操作該員工的資料"))
                .when(orgScopeService).requireVisibleUser(12L);

        assertBatchAborts(11L, 12L);

        // 11 在范围内也不先写：归属先验完整批再落库，不留下「登记了一半」的中间态
        verify(employmentPeriodService, never()).syncFromRecords(anyLong(), anyString());
        verify(hrAuditService, never()).record(any());
    }

    @Test
    @DisplayName("读端点只要 view，写端点必须 edit；两者都挂在 employee-management 上")
    void handlersCarryExpectedPermissions() {
        Method[] handlers = Arrays.stream(HrEmploymentController.class.getDeclaredMethods())
                .filter(m -> !m.isSynthetic() && !m.getName().startsWith("$"))
                .filter(m -> m.isAnnotationPresent(GetMapping.class) || m.isAnnotationPresent(PostMapping.class))
                .toArray(Method[]::new);
        assertEquals(2, handlers.length, "差异报告与登记两个端点都应存在");

        for (Method method : handlers) {
            RequirePermission permission = method.getAnnotation(RequirePermission.class);
            assertNotNull(permission, "端点漏挂 @RequirePermission: " + method.getName());
            assertEquals(EmployeeConstants.MENU_EMPLOYEE, permission.menu(),
                    "雇佣数据必须挂在集团人事菜单下: " + method.getName());
            boolean writable = method.isAnnotationPresent(PostMapping.class)
                    || method.isAnnotationPresent(PutMapping.class);
            assertEquals(writable ? EmployeeConstants.ACTION_EDIT : EmployeeConstants.ACTION_VIEW,
                    permission.action(), "权限动作与读写性质不匹配: " + method.getName());
            // 差异报告是只读的：它一旦被写成 POST，HR 就没法在核对清单上反复看
            assertTrue(!(method.isAnnotationPresent(PostMapping.class) && "diffReport".equals(method.getName())),
                    "差异报告端点不允许是写操作");
        }
    }

    /** 断言批处理接口按预期抛业务异常（standalone 无全局异常处理器，异常会直接冒出来） */
    private void assertBatchAborts(Long... userIds) {
        StringBuilder json = new StringBuilder("{\"userIds\":[");
        for (int i = 0; i < userIds.length; i++) {
            json.append(i == 0 ? "" : ",").append(userIds[i]);
        }
        json.append("]}");
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () ->
                mockMvc().perform(post("/api/hr/employment/periods/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.toString())));
    }

    @Test
    @DisplayName("注释与常量核对：类别码不能和后端常量脱节")
    void categoryCodesAreEnumerated() {
        assertTrue(HrProfileDiff.ALL_CODES.contains(HrProfileDiff.PERIOD_NOT_REGISTERED));
        assertEquals(HrProfileDiff.SEVERITY_ERROR,
                HrProfileDiff.SEVERITIES.get(HrProfileDiff.RESIGNED_ACCOUNT_ACTIVE),
                "「已离职但账号启用」是唯一 ERROR 级：越权保留必须排在报告最前面");
        assertEquals(3, HrProfileDiff.severityRank(HrProfileDiff.SEVERITY_ERROR));
    }
}
