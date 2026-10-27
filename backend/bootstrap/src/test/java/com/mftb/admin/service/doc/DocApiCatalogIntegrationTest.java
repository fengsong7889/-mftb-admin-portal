package com.mftb.admin.service.doc;

import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 接口文档结构化的真实库验收：扫描一次全量 Controller，核对出参字段表、鉴权 scope、错误码与人工命名保留。
 *
 * <p>只在注入 DB_URL 且显式开启 DOC_API_SCAN_IT=true 时运行：扫描会刷新全量接口行（幂等），
 * 不适合每次 CI 都跑；日常由页面「同步接口清单」触发同一段逻辑。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+", disabledReason = "需要真实 MySQL")
@EnabledIfEnvironmentVariable(named = "DOC_API_SCAN_IT", matches = "true", disabledReason = "全量扫描耗时，按需开启")
class DocApiCatalogIntegrationTest {
    @Autowired private DocApiCatalogService catalog;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SysUserMapper users;

    @BeforeEach void login() {
        SysUser admin = users.selectList(null).stream()
                .filter(user -> "admin".equals(user.getRole()) && Integer.valueOf(1).equals(user.getStatus()))
                .findFirst().orElse(null);
        assertNotNull(admin, "测试库缺少可用的超级管理员账号");
        var auth = new UsernamePasswordAuthenticationToken(admin.getUsername(), null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails(admin);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach void logout() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void scanDerivesResponseSchemaScopesAndKeepsManualNames() {
        Map<String, Object> result = catalog.scan();
        long scanned = ((Number) result.get("scanned")).longValue();
        assertTrue(scanned > 500, "扫描应覆盖全量 Controller，实际 " + scanned);

        Long withSchema = jdbc.queryForObject("SELECT COUNT(*) FROM doc_api_catalog "
                + "WHERE active=1 AND response_fields IS NOT NULL AND response_fields<>''", Long.class);
        assertTrue(withSchema != null && withSchema > scanned / 2, "多数接口应有出参结构，实际 " + withSchema);

        Long named = jdbc.queryForObject("SELECT COUNT(*) FROM doc_api_catalog "
                + "WHERE active=1 AND api_name IS NOT NULL AND api_name<>''", Long.class);
        assertTrue(named != null && named > scanned / 2, "接口名应有草稿或人工值，实际 " + named);

        Long withRequestExample = jdbc.queryForObject("SELECT COUNT(*) FROM doc_api_catalog "
                + "WHERE active=1 AND request_example IS NOT NULL AND request_example<>''", Long.class);
        assertTrue(withRequestExample != null && withRequestExample > 100, "写接口应有请求体示例，实际 " + withRequestExample);

        Map<String, Object> row = jdbc.queryForMap("SELECT response_fields,auth_scope,error_codes,"
                + "response_example,api_name,api_name_source FROM doc_api_catalog "
                + "WHERE path='/api/doc/v3/api-center/apis' AND method='GET' AND active=1 LIMIT 1");
        String fields = String.valueOf(row.get("response_fields"));
        assertTrue(fields.contains("\"fields\""), "出参必须是结构化 JSON");
        assertTrue(fields.contains("ApiCatalogPage"), "出参应包含真实返回类型，实际 " + fields);
        assertEquals("doc-api-center:view", row.get("auth_scope"), "权限应从 @RequirePermission 推导");
        String errorCodes = String.valueOf(row.get("error_codes"));
        assertTrue(errorCodes.contains("403") && errorCodes.contains("1006"), "错误码应覆盖通用业务码");
        String example = String.valueOf(row.get("response_example"));
        assertTrue(example.contains("\"code\" : 200") || example.contains("\"code\": 200"), "响应示例应带成功包装");
        assertFalse(example.toLowerCase().contains("password"), "示例不得出现密码字段");
    }
}
