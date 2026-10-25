package com.mftb.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.doc.DocIntegrationGrantService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** 不新增匿名白名单；Opaque 集成令牌只在白名单方法/路径建立受限身份。 */
@RequiredArgsConstructor
public class DocIntegrationAuthenticationFilter extends OncePerRequestFilter {
    private final DocIntegrationGrantService grants;
    private final ObjectMapper json;

    public static boolean permitted(String method,String path) {
        if ("GET".equals(method)) return path.matches("/api/doc/v2/documents(?:/[1-9][0-9]*(?:/revisions/[1-9][0-9]*)?)?")
                || path.matches("/api/doc/v2/ingest-receipts/[A-Za-z0-9_.:-]{8,128}");
        return "POST".equals(method) && (path.equals("/api/doc/v2/documents") || path.matches("/api/doc/v2/documents/[1-9][0-9]*/revisions"));
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        String path=request.getRequestURI();
        if (path.startsWith("/api/doc/v2/")) {
            response.setHeader("Cache-Control","private, no-store");
            if (request.getContentLengthLong()>3L*1024*1024) { reject(response,413,"請求內容過大"); return; }
        }
        String header=request.getHeader("Authorization");
        if (header==null || !header.startsWith("Bearer "+DocIntegrationGrantService.TOKEN_PREFIX)) { chain.doFilter(request,response); return; }
        try {
            if (!permitted(request.getMethod(),path)) throw new BusinessException(403,"集成憑據不可執行此操作");
            var identity=grants.authenticate(header.substring(7),"POST".equals(request.getMethod()));
            SecurityContextHolder.getContext().setAuthentication(identity);
        } catch (BusinessException exception) {
            SecurityContextHolder.clearContext(); reject(response,exception.getCode(),exception.getMessage()); return;
        }
        chain.doFilter(request,response);
    }
    private void reject(HttpServletResponse response,int code,String message) throws IOException {
        response.setStatus(code); response.setContentType("application/json;charset=UTF-8");
        json.writeValue(response.getWriter(),Result.error(code,message));
    }
}
