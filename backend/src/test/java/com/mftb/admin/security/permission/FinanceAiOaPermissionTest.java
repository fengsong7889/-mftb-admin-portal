package com.mftb.admin.security.permission;

import com.mftb.admin.controller.*;
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
 * R-24 安全测试: 财务 + AI + OA 模块权限矩阵
 * <p>
 * 验证高敏感业务模块的 @RequirePermission 是否正确拦截无权限用户
 */
@WebMvcTest({
        FinApprovalController.class,
        FinRiskController.class,
        OaRequestController.class,
        OaProcessController.class
})
@DisplayName("R-24: 财务/AI/OA 权限矩阵")
class FinanceAiOaPermissionTest extends SecurityTestBase {

    // ── 财务审批 ──

    @Nested
    @DisplayName("财务审批 /api/fin-approvals")
    class FinApprovalTests {

        @Test
        @DisplayName("管理员 GET /api/fin-approvals → 200")
        void adminList() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/fin/approvals", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("访客 GET /api/fin-approvals → code=403")
        void guestList() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/fin/approvals", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }

        @Test
        @DisplayName("无 Token GET /api/fin-approvals → code=401")
        void noTokenList() throws Exception {
            mockMvc.perform(get("/api/fin/approvals"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(401));
        }
    }

    // ── 财务风控 ──

    @Nested
    @DisplayName("财务风控 /api/fin-risks")
    class FinRiskTests {

        @Test
        @DisplayName("访客 GET /api/fin-risks → code=403")
        void guestListRisks() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/fin/risk", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    // ── OA 审批 ──

    @Nested
    @DisplayName("OA 审批 /api/oa-requests")
    class OaRequestTests {

        @Test
        @DisplayName("管理员 GET /api/oa-requests → 200")
        void adminListOaRequests() throws Exception {
            grantAllPermissions(adminUser);
            mockMvc.perform(authGet("/api/oa/requests", adminUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200));
        }

        @Test
        @DisplayName("访客 GET /api/oa-requests → code=403")
        void guestListOaRequests() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/oa/requests", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }

    // ── OA 流程管理 ──

    @Nested
    @DisplayName("OA 流程管理 /api/oa-processes")
    class OaProcessTests {

        @Test
        @DisplayName("访客 GET /api/oa-processes → code=403")
        void guestListProcesses() throws Exception {
            denyAllPermissions(guestUser);
            mockMvc.perform(authGet("/api/oa/processes", guestUser))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(403));
        }
    }
}
