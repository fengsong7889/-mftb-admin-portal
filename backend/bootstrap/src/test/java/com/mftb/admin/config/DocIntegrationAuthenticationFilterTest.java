package com.mftb.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.doc.DocIntegrationGrantService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DocIntegrationAuthenticationFilterTest {
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); }
    @ParameterizedTest
    @CsvSource({"GET,/api/doc/v2/documents", "GET,/api/doc/v2/documents/41", "GET,/api/doc/v2/documents/41/revisions/83",
        "GET,/api/doc/v2/ingest-receipts/request-001", "POST,/api/doc/v2/documents", "POST,/api/doc/v2/documents/41/revisions"})
    void permitsOnlyReadAndDraftEndpoints(String method, String path) {
        assertTrue(DocIntegrationAuthenticationFilter.permitted(method, path));
    }
    @ParameterizedTest
    @CsvSource({"POST,/api/doc/v2/confirmations/5/decision", "GET,/api/doc/v2/documents/41/export",
        "POST,/api/doc/v2/documents/41/execution", "PUT,/api/doc/v2/documents/41/acl",
        "POST,/api/doc/v2/grants", "POST,/api/doc/v2/documents/41/trash", "GET,/api/doc/v2/spaces",
        "GET,/api/doc/v2/documents/0", "GET,/api/doc/v2/documents/41/revisions/0", "GET,/api/auth/check"})
    void forbiddenEndpointNeverAuthenticatesOrRunsController(String method, String path) throws Exception {
        var grants = mock(DocIntegrationGrantService.class);
        var chain = mock(FilterChain.class);
        var request = new MockHttpServletRequest(method, path);
        request.addHeader("Authorization", "Bearer docint_" + "x".repeat(43));
        var response = new MockHttpServletResponse();
        new DocIntegrationAuthenticationFilter(grants, new ObjectMapper()).doFilter(request, response, chain);
        assertEquals(403, response.getStatus()); verifyNoInteractions(grants, chain);
    }
    @Test void authenticationFailureClearsIdentityAndIsNotCached() throws Exception {
        var grants = mock(DocIntegrationGrantService.class);
        when(grants.authenticate(anyString(), eq(false))).thenThrow(new BusinessException(401, "集成凭据无效"));
        var chain = mock(FilterChain.class);
        var request = new MockHttpServletRequest("GET", "/api/doc/v2/documents");
        request.addHeader("Authorization", "Bearer docint_" + "x".repeat(43));
        var response = new MockHttpServletResponse();
        new DocIntegrationAuthenticationFilter(grants, new ObjectMapper()).doFilter(request, response, chain);
        assertEquals(401, response.getStatus()); assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("private, no-store", response.getHeader("Cache-Control")); verifyNoInteractions(chain);
    }
    @Test void oversizeBodyRejectedBeforeAuthentication() throws Exception {
        var grants = mock(DocIntegrationGrantService.class); var chain = mock(FilterChain.class);
        var request = new MockHttpServletRequest("POST", "/api/doc/v2/documents");
        request.setContent(new byte[3 * 1024 * 1024 + 1]);
        var response = new MockHttpServletResponse();
        new DocIntegrationAuthenticationFilter(grants, new ObjectMapper()).doFilter(request, response, chain);
        assertEquals(413, response.getStatus()); verifyNoInteractions(grants, chain);
    }
}
