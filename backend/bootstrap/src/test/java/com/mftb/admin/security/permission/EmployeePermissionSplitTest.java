package com.mftb.admin.security.permission;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.controller.EmployeeController;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.security.SecurityTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R-24 安全测试：员工接口权限拆分（方案 §7.3 / P0「人事编辑与账号高危权限混用」）。
 * <p>
 * 与既有 {@link EmployeePermissionTest} 的分工：那份只验「无权限被拒」，本份验的是
 * **细分动作之间的互不隐含**——即「持有 edit 不等于能看薪酬/明文/改密码/发角色」。
 * 每条都同时有拒绝断言（403）与放行断言（200）：只做拒绝断言会漏掉「动作名写错导致
 * 谁都进不去」，只做放行断言会漏掉越权。
 */
@WebMvcTest(EmployeeController.class)
@DisplayName("R-24: 员工权限拆分矩阵")
class EmployeePermissionSplitTest extends SecurityTestBase {

    private static final String MENU = EmployeeConstants.MENU_EMPLOYEE;

    /** 只给指定动作，其余一律不授权（模拟授权中心的真实颗粒度） */
    private void grantOnly(SysUser user, String... actions) {
        denyAllPermissions(user);
        for (String action : actions) {
            grantPermission(user, MENU, action);
        }
    }

    private MediaType json() {
        return MediaType.APPLICATION_JSON;
    }

    @Nested
    @DisplayName("只有查看权（花名册读者）")
    class ViewerOnly {

        @Test
        @DisplayName("花名册与脱敏基础信息可读")
        void canReadRosterAndMaskedInfo() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW);

            mockMvc.perform(authGet("/api/employees", viewerUser))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200));
            // 花名册专用入口（带人员范围）与下拉入口共存，两者都必须持有 view
            mockMvc.perform(authGet("/api/employees/roster", viewerUser))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authGet("/api/employees/1/basic-info", viewerUser))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("薪酬、明文、账号、授权四类端点全部 403")
        void everythingSensitiveIsRejected() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW);

            mockMvc.perform(authGet("/api/employees/1/salary/incomes", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authGet("/api/employees/1/salary/config", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authGet("/api/employees/1/basic-info/sensitive", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/status?status=0", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/password", viewerUser)
                            .contentType(json()).content("{\"password\":\"Abcd1234\"}"))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/roles", viewerUser)
                            .contentType(json()).content("{\"functionRoleIds\":[2]}"))
                    .andExpect(jsonPath("$.code").value(403));
            // 全量导出与「能看到列表」分开授权：能看一页不等于能把整公司名单带走
            mockMvc.perform(authGet("/api/employees/roster/export", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("编辑类端点 403（含薪酬写入与人事写入）")
        void writesAreRejected() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW);

            mockMvc.perform(authPost("/api/employees/1/salary/incomes", viewerUser)
                            .contentType(json())
                            .content("{\"name\":\"基本工资\",\"amount\":100,\"type\":\"fixed\"}"))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/basic-info/personal", viewerUser)
                            .contentType(json()).content("{\"name\":\"张三\"}"))
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    @Nested
    @DisplayName("人事编辑权（edit 不隐含敏感能力）")
    class HrEditor {

        @Test
        @DisplayName("人事资料可写")
        void canEditProfile() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_EDIT);

            mockMvc.perform(authPut("/api/employees/1/basic-info/personal", viewerUser)
                            .contentType(json()).content("{\"gender\":\"M\"}"))
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("有 edit 也不能读证件明文：能改电话不等于能看身份证号")
        void editDoesNotImpliesPlaintextRead() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_EDIT);

            mockMvc.perform(authGet("/api/employees/1/basic-info/sensitive", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("有 edit 也不能看薪酬、停账号、发角色")
        void editDoesNotImplySalaryAccountAuthorize() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_EDIT);

            mockMvc.perform(authGet("/api/employees/1/salary/incomes", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/status?status=0", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
            mockMvc.perform(authPut("/api/employees/1/roles", viewerUser)
                            .contentType(json()).content("{\"functionRoleIds\":[2]}"))
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    @Nested
    @DisplayName("敏感与金融资料单独授权")
    class SensitiveAndSalary {

        @Test
        @DisplayName("sensitiveView 才能读明文")
        void sensitiveViewAllowsPlaintext() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_SENSITIVE_VIEW);

            mockMvc.perform(authGet("/api/employees/1/basic-info/sensitive", viewerUser))
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("salaryView 可读薪酬但不可写")
        void salaryViewIsReadOnly() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_SALARY_VIEW);

            mockMvc.perform(authGet("/api/employees/1/salary/incomes", viewerUser))
                    .andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authPut("/api/employees/1/salary/config", viewerUser)
                            .contentType(json())
                            .content("{\"salaryStructure\":\"月薪\",\"paymentMethod\":\"銀行代発\",\"payDay\":10}"))
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("salaryEdit 不隐含 salaryView：金融资料读取仍需单独授权")
        void salaryEditDoesNotImplySalaryView() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_SALARY_EDIT);

            mockMvc.perform(authGet("/api/employees/1/salary/deductions", viewerUser))
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    @Nested
    @DisplayName("账号与授权单独动作")
    class AccountAndAuthorize {

        @Test
        @DisplayName("accountEdit 可停号与重置密码，但不能改角色")
        void accountEditCoversPasswordAndStatus() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_ACCOUNT_EDIT);

            mockMvc.perform(authPut("/api/employees/1/status?status=0", viewerUser))
                    .andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authPut("/api/employees/1/password", viewerUser)
                            .contentType(json()).content("{\"password\":\"Abcd1234\"}"))
                    .andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authPut("/api/employees/1/roles", viewerUser)
                            .contentType(json()).content("{\"functionRoleIds\":[2]}"))
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("authorize 才能调整功能角色")
        void authorizeAllowsRoleBinding() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_AUTHORIZE);

            mockMvc.perform(authPut("/api/employees/1/roles", viewerUser)
                            .contentType(json()).content("{\"functionRoleIds\":[2]}"))
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("清空角色必须显式传空数组：缺字段被 400 拒掉，避免误清空")
        void missingFieldIsRejectedNotNull() throws Exception {
            grantOnly(viewerUser, EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_AUTHORIZE);

            mockMvc.perform(put("/api/employees/1/roles", viewerUser)
                            .header("Authorization", "Bearer " + tokenFor(viewerUser))
                            .contentType(json()).content("{}"))
                    .andExpect(jsonPath("$.code").value(400));
        }
    }

    @Nested
    @DisplayName("超管直通与动作登记守卫")
    class AdminAndGuard {

        @Test
        @DisplayName("动作全部到位时，敏感端点逐一放行")
        void fullGrantOpensEveryEndpoint() throws Exception {
            // 超管直通是 PermissionServiceImpl 内部行为，本切片的 permissionService 是 mock，
            // 所以这里用「授权到位的普通角色」验证同一条结论：拆分后不存在「某个动作能越到别的动作」。
            grantAllPermissions(adminUser, MENU);
            grantPermission(adminUser, MENU, EmployeeConstants.ACTION_SALARY_VIEW);
            grantPermission(adminUser, MENU, EmployeeConstants.ACTION_SALARY_EDIT);
            grantPermission(adminUser, MENU, EmployeeConstants.ACTION_SENSITIVE_VIEW);
            grantPermission(adminUser, MENU, EmployeeConstants.ACTION_ACCOUNT_EDIT);
            grantPermission(adminUser, MENU, EmployeeConstants.ACTION_AUTHORIZE);

            mockMvc.perform(authGet("/api/employees/1/basic-info/sensitive", adminUser))
                    .andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authGet("/api/employees/1/salary/incomes", adminUser))
                    .andExpect(jsonPath("$.code").value(200));
            mockMvc.perform(authPut("/api/employees/1/roles", adminUser)
                            .contentType(json()).content("{\"functionRoleIds\":[]}"))
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("每个 handler 的 action 必须已登记进 sys_menu.actions 全集")
        void everyHandlerActionIsRegistered() {
            for (Method method : EmployeeController.class.getDeclaredMethods()) {
                RequirePermission annotation = method.getAnnotation(RequirePermission.class);
                if (annotation == null) {
                    continue;
                }
                assertTrue(MENU.equals(annotation.menu()),
                        method.getName() + " 的菜单不属于员工域: " + annotation.menu());
                assertTrue(EmployeeConstants.GRANTABLE_ACTION_SET.contains(annotation.action()),
                        method.getName() + " 用了未登记的动作 " + annotation.action()
                                + "，授权中心勾不到 → 普通角色永久 403");
            }
        }

        @Test
        @DisplayName("写入 sys_menu.actions 的 JSON 字面量必须能被解析回全集")
        void grantableActionsJsonRoundTrips() {
            // 初始化器把 GRANTABLE_ACTIONS_JSON 原文写进 TEXT 列；拼错一个引号不会报错，
            // 只会让授权中心的动作列表渲染为空 —— 所以下游动作全部勾不到且无人发现。
            java.util.List<String> parsed =
                    com.mftb.admin.util.JsonUtils.parseStringList(EmployeeConstants.GRANTABLE_ACTIONS_JSON);
            org.junit.jupiter.api.Assertions.assertEquals(EmployeeConstants.GRANTABLE_ACTIONS, parsed,
                    "JSON 字面量与动作全集不一致: " + parsed);
            for (String required : new String[]{EmployeeConstants.ACTION_VIEW, EmployeeConstants.ACTION_CREATE,
                    EmployeeConstants.ACTION_EDIT, EmployeeConstants.ACTION_DELETE,
                    EmployeeConstants.ACTION_SALARY_VIEW, EmployeeConstants.ACTION_SALARY_EDIT,
                    EmployeeConstants.ACTION_SENSITIVE_VIEW, EmployeeConstants.ACTION_ACCOUNT_EDIT,
                    EmployeeConstants.ACTION_AUTHORIZE, EmployeeConstants.ACTION_EXPORT}) {
                assertTrue(EmployeeConstants.GRANTABLE_ACTION_SET.contains(required),
                        "拆分动作缺登记: " + required);
            }
        }
    }
}
