package com.mftb.admin.security.permission;

import com.mftb.admin.controller.MenuController;
import com.mftb.admin.controller.RoleController;
import com.mftb.admin.security.SecurityTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;

import java.util.List;

import static org.mockito.Mockito.when;
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

        /**
         * 契约变更（2026-10-23）：/api/menus/tree 是<b>管理端全量菜单树</b>，
         * 旧行为让任何登录用户都能拿到全站菜单名与路径（含未授权项），
         * 属于结构信息暴露；导航改由服务端裁剪的 /my-tree 提供。
         * 这里把旧断言按新契约反转，并同时钉住「导航树对所有登录用户可用」，
         * 避免收口管理接口时把普通用户的侧栏一起弄没。
         */
        @Test
        @DisplayName("访客 GET /api/menus/tree → code=403（全量树仅限菜单/授权管理）")
        void guestFullMenuTreeDenied() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/menus/tree", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("管理员 GET /api/menus/tree → 200（菜单配置需全量树）")
        void adminFullMenuTree() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/menus/tree", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("所有登录用户 GET /api/menus/my-tree → 200（服务端裁剪的导航树）")
        void anyUserMyMenuTree() throws Exception {
            denyAllPermissions(guestUser);
            when(menuService.myTree()).thenReturn(List.of());
            mockMvc.perform(authGet("/api/menus/my-tree", guestUser))
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
