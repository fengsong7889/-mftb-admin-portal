package com.mftb.admin.security;

import com.mftb.admin.controller.AuthController;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.entity.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R-24 安全测试: 认证层
 * <p>
 * 验证 JWT 认证机制的正确性: Token 签发/校验/过期/伪造/白名单路径/停用账号
 */
@WebMvcTest(AuthController.class)
@DisplayName("R-24: 认证安全测试")
class AuthenticationTest extends SecurityTestBase {

    @Nested
    @DisplayName("无 Token 访问受保护接口")
    class NoTokenTests {

        @Test
        @DisplayName("无 Token 访问 /api/auth/info → HTTP 401 未认证")
        void infoWithoutToken() throws Exception {
            mockMvc.perform(get("/api/auth/info"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }

        @Test
        @DisplayName("无 Token 访问 /api/auth/quick-favorites → HTTP 401 未认证")
        void favoritesWithoutToken() throws Exception {
            mockMvc.perform(get("/api/auth/quick-favorites"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }
    }

    @Nested
    @DisplayName("伪造/无效 Token")
    class InvalidTokenTests {

        @Test
        @DisplayName("伪造 Token → HTTP 401 未认证")
        void fakeToken() throws Exception {
            mockMvc.perform(get("/api/auth/info")
                            .header("Authorization", "Bearer not-a-real-jwt-token"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }

        @Test
        @DisplayName("篡改 Token 签名 → HTTP 401 未认证")
        void tamperedToken() throws Exception {
            String realToken = tokenFor(adminUser);
            String tampered = realToken.substring(0, realToken.length() - 5) + "XXXXX";

            mockMvc.perform(get("/api/auth/info")
                            .header("Authorization", "Bearer " + tampered))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }

        @Test
        @DisplayName("空 Bearer Token → HTTP 401 未认证")
        void emptyBearer() throws Exception {
            mockMvc.perform(get("/api/auth/info")
                            .header("Authorization", "Bearer "))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }
    }

    @Nested
    @DisplayName("白名单路径无需认证")
    class WhitelistTests {

        @Test
        @DisplayName("POST /api/auth/login 无需 Token（白名单）")
        void loginWithoutToken() throws Exception {
            when(authService.login(any(), any())).thenReturn(
                    new LoginResponse(tokenFor(adminUser), null));

            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"admin\",\"password\":\"password\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("POST /api/auth/logout 无需 Token（白名单）")
        void logoutWithoutToken() throws Exception {
            mockMvc.perform(post("/api/auth/logout"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }
    }

    @Nested
    @DisplayName("正常认证")
    class ValidAuthTests {

        @Test
        @DisplayName("有效 Token 访问 /api/auth/info → code=200 正常")
        void infoWithValidToken() throws Exception {
            // checkSession 在 baseSetUp 中已 mock 为通过
            mockMvc.perform(authGet("/api/auth/info", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }
    }

    @Nested
    @DisplayName("停用账号")
    class DisabledAccountTests {

        @Test
        @DisplayName("停用账号 Token 访问 /api/auth/check → code=1002 账号已停用")
        void disabledAccountCheck() throws Exception {
            SysUser disabledUser = new SysUser();
            disabledUser.setId(99L);
            disabledUser.setUsername("disabled_user");
            disabledUser.setRole("guest");
            disabledUser.setStatus(0);

            when(sysUserMapper.selectOne(any())).thenReturn(disabledUser);
            when(authService.checkSession(any(), eq("disabled_user"), any()))
                    .thenReturn(SessionCheckResult.fail(1002, "账号已被停用", null));

            mockMvc.perform(authGet("/api/auth/check", disabledUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(1002));
        }
    }
}
