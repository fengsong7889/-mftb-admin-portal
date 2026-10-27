package com.mftb.admin.security.permission;

import com.mftb.admin.controller.EmployeeController;
import com.mftb.admin.security.SecurityTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R-24 安全测试: 员工管理接口权限矩阵
 * <p>
 * 验证 EmployeeController 的 @RequirePermission 注解是否正确拦截无权限用户
 */
@WebMvcTest(EmployeeController.class)
@DisplayName("R-24: 员工管理权限矩阵")
class EmployeePermissionTest extends SecurityTestBase {

    private static final String MENU = "employee-management";

    @Nested
    @DisplayName("管理员（拥有所有权限）")
    class AdminTests {

        @Test
        @DisplayName("管理员 GET /api/employees → 200")
        void adminList() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/employees", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }
    }

    @Nested
    @DisplayName("访客（无任何权限）")
    class GuestTests {

        @Test
        @DisplayName("访客 GET /api/employees → code=403 权限拒绝")
        void guestList() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/employees", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 POST /api/employees → code=403 权限拒绝")
        void guestCreate() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPost("/api/employees", guestUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"newuser\",\"name\":\"新用户\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 PUT /api/employees/1/status → code=403 权限拒绝")
        void guestUpdateStatus() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPut("/api/employees/1/status?status=0", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 DELETE /api/employees/1 → code=403 权限拒绝")
        void guestDelete() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authDelete("/api/employees/1", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 PUT /api/employees/1/password → code=403 权限拒绝")
        void guestResetPassword() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPut("/api/employees/1/password", guestUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"password\":\"newpass123\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    @Nested
    @DisplayName("仅有查看权限的用户")
    class ViewerTests {

        @Test
        @DisplayName("查看者 GET /api/employees → 200（有 view 权限）")
        void viewerList() throws Exception {
            grantPermission(viewerUser, MENU, "view");
            mockMvc.perform(authGet("/api/employees", viewerUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("查看者 POST /api/employees → code=403 或 400（无 create 权限或校验失败）")
        void viewerCreate() throws Exception {
            denyAllPermissions(viewerUser);
            mockMvc.perform(authPost("/api/employees", viewerUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"newuser\",\"name\":\"测试用户\",\"departmentId\":1,\"positionId\":1}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("查看者 DELETE /api/employees/1 → code=403（无 delete 权限）")
        void viewerDelete() throws Exception {
            denyAllPermissions(viewerUser);
            mockMvc.perform(authDelete("/api/employees/1", viewerUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    @Nested
    @DisplayName("未认证访问")
    class UnauthenticatedTests {

        @Test
        @DisplayName("无 Token GET /api/employees → code=401")
        void noTokenList() throws Exception {
            mockMvc.perform(get("/api/employees"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }
    }
}
