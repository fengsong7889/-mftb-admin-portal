package com.mftb.admin.security.permission;

import com.mftb.admin.controller.MenuController;
import com.mftb.admin.controller.RoleController;
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
 * R-24 安全测试: 角色管理 + 菜单管理权限矩阵
 * <p>
 * 验证 RoleController 和 MenuController 的 @RequirePermission 是否正确拦截
 */
@WebMvcTest({RoleController.class, MenuController.class})
@DisplayName("R-24: 角色与菜单权限矩阵")
class RoleMenuPermissionTest extends SecurityTestBase {

    // ── 角色管理 ──

    @Nested
    @DisplayName("角色管理 /api/roles")
    class RoleTests {

        @Test
        @DisplayName("管理员 GET /api/roles → 200")
        void adminListRoles() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/roles", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("访客 POST /api/roles → code=403（无 role-management:create）")
        void guestCreateRole() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPost("/api/roles", guestUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"新角色\",\"code\":\"new-role\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 DELETE /api/roles/1 → code=403（无 role-management:delete）")
        void guestDeleteRole() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authDelete("/api/roles/1", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 PUT /api/roles/1/permissions → code=403（无 function-permission:edit）")
        void guestUpdatePermissions() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPut("/api/roles/1/permissions", guestUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("[]"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("无 Token GET /api/roles → code=401")
        void noTokenListRoles() throws Exception {
            mockMvc.perform(get("/api/roles"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }
    }

    // ── 菜单管理 ──

    @Nested
    @DisplayName("菜单管理 /api/menus")
    class MenuTests {

        @Test
        @DisplayName("管理员 GET /api/menus → 200")
        void adminListMenus() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/menus", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("所有登录用户 GET /api/menus/tree → 200（无 @RequirePermission，仅认证）")
        void anyUserMenuTree() throws Exception {
            // /tree 端点无 @RequirePermission 注解，仅需通过 JWT 认证
            mockMvc.perform(authGet("/api/menus/tree", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("访客 POST /api/menus → code=403（无 menu-config:create）")
        void guestCreateMenu() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authPost("/api/menus", guestUser)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"测试菜单\",\"path\":\"/test\",\"type\":1,\"parentId\":0,\"sort\":0,\"menuKey\":\"test\",\"component\":\"/test\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("访客 DELETE /api/menus/1 → code=403（无 menu-config:delete）")
        void guestDeleteMenu() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authDelete("/api/menus/1", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }
}
