package com.mftb.admin.security;

import com.mftb.admin.config.DocIntegrationAuthenticationFilter;
import com.mftb.admin.config.JwtAuthenticationFilter;
import com.mftb.admin.controller.DocNativeController;
import com.mftb.admin.dto.DocNativeDTO.Page;
import com.mftb.admin.service.doc.DocIntegrationGrantService;
import com.mftb.admin.service.doc.DocNativeAccess;
import com.mftb.admin.service.doc.DocNativeService;
import com.mftb.admin.service.doc.DocNativeSpaceService;
import com.mftb.admin.service.doc.DocNativeWorkflowService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.web.FilterChainProxy;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 真正创建含懒加载 JWT 代理的安全链，防止只编译不启动漏掉过滤器顺序错误。 */
@WebMvcTest(DocNativeController.class)
class DocNativeSecurityTest extends SecurityTestBase {
    @Autowired private FilterChainProxy securityFilters;
    @MockBean private DocNativeService documents;
    @MockBean private DocNativeSpaceService spaces;
    @MockBean private DocNativeWorkflowService workflow;
    @MockBean private DocIntegrationGrantService grants;
    @MockBean private DocNativeAccess access;

    @Test void integrationFilterIsAfterActualJwtProxy() {
        var filters = securityFilters.getFilters("/api/doc/v2/documents");
        int jwt = -1, integration = -1;
        for (int i = 0; i < filters.size(); i++) {
            if (filters.get(i) instanceof JwtAuthenticationFilter) jwt = i;
            if (filters.get(i) instanceof DocIntegrationAuthenticationFilter) integration = i;
        }
        assertTrue(jwt >= 0); assertTrue(integration > jwt);
    }
    @Test void anonymousCannotReadNativeDocuments() throws Exception {
        mockMvc.perform(get("/api/doc/v2/documents")).andExpect(status().isUnauthorized());
        verifyNoInteractions(documents);
    }
    @Test void authorizedUserCanReachNativeEndpoint() throws Exception {
        grantPermission(viewerUser, "doc-plans", "view");
        when(documents.search(isNull(), isNull(), eq("effective"), eq(1), eq(20))).thenReturn(new Page(List.of(), 0, 1, 20));
        mockMvc.perform(authGet("/api/doc/v2/documents", viewerUser))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200))
                .andExpect(header().string("Cache-Control", "private, no-store"));
    }
    @Test void integrationTokenCannotExportOrApproveEvenAtHttpBoundary() throws Exception {
        String header = "Bearer docint_" + "x".repeat(43);
        mockMvc.perform(get("/api/doc/v2/documents/41/export").header("Authorization", header)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/doc/v2/confirmations/5/decision").header("Authorization", header)).andExpect(status().isForbidden());
        verifyNoInteractions(documents, workflow, grants);
    }
}
