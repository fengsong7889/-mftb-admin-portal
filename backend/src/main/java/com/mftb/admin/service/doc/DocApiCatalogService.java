package com.mftb.admin.service.doc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.DocApiSystemMap;
import io.swagger.v3.oas.annotations.Operation;
import com.mftb.admin.dto.DocKnowledgeDTO.ApiCatalogEntry;
import com.mftb.admin.dto.DocKnowledgeDTO.ApiCatalogPage;
import com.mftb.admin.dto.DocKnowledgeDTO.ApiCatalogSystem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.lang.annotation.Annotation;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 全系统接口清单：从 Spring Controller 映射扫描，不读请求内容、不保存密钥。
 * 入参/出参记录 Java 类型与注解；后续 OpenAPI 导入可在此基础上补充结构化 schema。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocApiCatalogService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final RequestMappingHandlerMapping mappings;
    private final DocNativeStore store;
    private final DocNativeAccess access;

    @Transactional
    public Map<String, Object> scan() {
        access.menu("doc-api-center", "edit");
        Map<String, String> names = systemNames();
        List<ApiCatalogEntry> rows = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime scanStarted = now.minusSeconds(1);
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : mappings.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            HandlerMethod handler = entry.getValue();
            Set<String> paths = info.getPatternValues();
            Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();
            String method = methods.isEmpty() ? "GET" : methods.iterator().next().name();
            if (!Set.of("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS").contains(method)) continue;
            for (String path : paths) {
                if (!path.startsWith("/api/")) continue;
                String systemCode = DocApiSystemMap.code(path);
                String handlerName = handler.getBeanType().getSimpleName() + "#" + handler.getMethod().getName();
                Operation operation = handler.getMethodAnnotation(Operation.class);
                String apiName = operation == null ? null : truncate(operation.summary(), 200);
                String description = operation == null ? null : truncate(operation.description(), 1000);
                rows.add(new ApiCatalogEntry(null, systemCode, DocApiSystemMap.displayName(systemCode, names.get(systemCode)),
                        method, truncate(path, 500), truncate(handlerName, 255),
                        params(handler), truncate(handler.getReturnType().getGenericParameterType().getTypeName(), 2000),
                        "code", apiName, description, null, "JWT", null, 1, 1, null, "v1", null,
                        null, null, null, null, true, now));
            }
        }
        // 代码扫描是幂等增量同步：不清表，保留人工补的文档字段；本次未出现的旧 code 行标记 inactive。
        if (!rows.isEmpty()) {
            List<Object[]> args = rows.stream().map(row -> new Object[]{
                    row.systemCode(), row.systemName(), row.method(), row.path(), row.handler(),
                    row.requestSchema(), row.responseSchema(), row.apiName(), row.description()
            }).toList();
            store.jdbc().batchUpdate("INSERT INTO doc_api_catalog(system_code,system_name,method,path,handler,"
                            + "request_schema,response_schema,source,api_name,description,synced_at,active) "
                            + "VALUES(?,?,?,?,?,?,?,'code',?,?,NOW(),1) "
                            + "ON DUPLICATE KEY UPDATE system_name=VALUES(system_name),handler=VALUES(handler),"
                            + "request_schema=VALUES(request_schema),response_schema=VALUES(response_schema),"
                            + "api_name=IF(api_name IS NULL OR api_name='',VALUES(api_name),api_name),"
                            + "description=IF(description IS NULL OR description='',VALUES(description),description),"
                            + "synced_at=NOW(),updated_at=NOW(),active=1", args);
        }
        store.jdbc().update("UPDATE doc_api_catalog SET active=0,updated_at=NOW() "
                + "WHERE source='code' AND synced_at < ?", scanStarted);
        return Map.of("scanned", rows.size(), "systems", rows.stream().map(ApiCatalogEntry::systemCode).distinct().count());
    }

    public List<ApiCatalogSystem> systems() {
        access.menu("doc-api-center", "view");
        // 未知/歷史前綴統一併入平台支撐系統：左側只允許 16 個正式系統，避免中英混排與同名重複項。
        Map<String, Long> counts = new LinkedHashMap<>();
        store.jdbc().query("SELECT system_code,COUNT(*) AS endpoint_count FROM doc_api_catalog "
                        + "WHERE active=1 GROUP BY system_code",
                rs -> {
                    String code = rs.getString("system_code");
                    String normalized = DocApiSystemMap.known(code) ? code : "platform";
                    counts.merge(normalized, rs.getLong("endpoint_count"), Long::sum);
                });
        return counts.entrySet().stream()
                .map(item -> new ApiCatalogSystem(item.getKey(), DocApiSystemMap.name(item.getKey()), item.getValue()))
                .sorted(java.util.Comparator.comparingInt((ApiCatalogSystem item) -> DocApiSystemMap.order(item.systemCode())))
                .toList();
    }

    public ApiCatalogPage apis(String systemCode, String keyword, int page, int size) {
        access.menu("doc-api-center", "view");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        String system = StringUtils.hasText(systemCode) ? systemCode.trim() : null;
        String like = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        Long total = store.jdbc().queryForObject("SELECT COUNT(*) FROM doc_api_catalog WHERE active=1 "
                        + "AND (? IS NULL OR system_code=?) AND (? IS NULL OR path LIKE ? OR handler LIKE ? "
                        + "OR api_name LIKE ? OR description LIKE ? OR scenario LIKE ?)",
                Long.class, system, system, like, like, like, like, like, like);
        List<ApiCatalogEntry> rows = store.jdbc().query("SELECT " + SELECT + " FROM doc_api_catalog WHERE active=1 "
                        + "AND (? IS NULL OR system_code=?) AND (? IS NULL OR path LIKE ? OR handler LIKE ? "
                        + "OR api_name LIKE ? OR description LIKE ? OR scenario LIKE ?) "
                        + "ORDER BY system_code,path,method LIMIT ? OFFSET ?",
                (rs, i) -> entry(rs),
                system, system, like, like, like, like, like, like, safeSize, (safePage - 1) * safeSize);
        return new ApiCatalogPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    public ApiCatalogEntry api(long id) {
        access.menu("doc-api-center", "view");
        List<ApiCatalogEntry> rows = store.jdbc().query("SELECT " + SELECT + " FROM doc_api_catalog WHERE id=? AND active=1",
                (rs, i) -> entry(rs), id);
        if (rows.isEmpty()) throw new BusinessException(404, "接口不存在");
        return rows.get(0);
    }

    @Transactional
    public ApiCatalogEntry update(long id, com.mftb.admin.dto.DocKnowledgeDTO.ApiCatalogSave input) {
        access.menu("doc-api-center", "edit");
        if (input.docStatus() == 2 && !StringUtils.hasText(input.apiName())) {
            throw new BusinessException(400, "发布前必須填寫接口名稱");
        }
        int updated = store.jdbc().update("UPDATE doc_api_catalog SET api_name=?,description=?,scenario=?,"
                        + "auth_type=?,auth_scope=?,visibility=?,doc_status=?,version=?,base_url=?,"
                        + "request_example=?,response_example=?,error_codes=?,changelog=?,"
                        + "owner_user_id=COALESCE(owner_user_id,?),updated_at=NOW() WHERE id=? AND active=1",
                trim(input.apiName(), 200), trim(input.description(), 1000), trim(input.scenario(), 2000),
                trim(input.authType(), 32) == null ? "JWT" : trim(input.authType(), 32),
                trim(input.authScope(), 500), input.visibility(), input.docStatus(),
                trim(input.version(), 32) == null ? "v1" : trim(input.version(), 32),
                trim(input.baseUrl(), 255), trim(input.requestExample(), 20000),
                trim(input.responseExample(), 20000), trim(input.errorCodes(), 10000),
                trim(input.changelog(), 10000), access.actor(), id);
        if (updated == 0) throw new BusinessException(404, "接口不存在或已下線");
        return api(id);
    }

    private static final String SELECT = "id,system_code,system_name,method,path,handler,request_schema,"
            + "response_schema,source,api_name,description,scenario,auth_type,auth_scope,visibility,"
            + "doc_status,owner_user_id,version,base_url,request_example,response_example,error_codes,"
            + "changelog,active,synced_at";

    private ApiCatalogEntry entry(java.sql.ResultSet rs) throws java.sql.SQLException {
        String systemCode = rs.getString("system_code");
        return new ApiCatalogEntry(rs.getLong("id"), systemCode,
                DocApiSystemMap.displayName(systemCode, rs.getString("system_name")),
                rs.getString("method"), rs.getString("path"), rs.getString("handler"),
                rs.getString("request_schema"), rs.getString("response_schema"), rs.getString("source"),
                rs.getString("api_name"), rs.getString("description"), rs.getString("scenario"),
                rs.getString("auth_type"), rs.getString("auth_scope"), rs.getInt("visibility"),
                rs.getInt("doc_status"), (Long) rs.getObject("owner_user_id"), rs.getString("version"),
                rs.getString("base_url"), rs.getString("request_example"), rs.getString("response_example"),
                rs.getString("error_codes"), rs.getString("changelog"), rs.getInt("active") == 1,
                rs.getTimestamp("synced_at").toLocalDateTime());
    }

    /** 系統名稱以門戶種子為真值；庫中缺失或仍是英文時回落到內置中文名。 */
    private Map<String, String> systemNames() {
        Map<String, String> result = new LinkedHashMap<>();
        for (Map<String, Object> row : store.jdbc().queryForList("SELECT code,name FROM sys_system WHERE deleted=0")) {
            String code = String.valueOf(row.get("code"));
            result.put(code, DocApiSystemMap.displayName(code, String.valueOf(row.get("name"))));
        }
        for (String code : DocApiSystemMap.codes()) result.putIfAbsent(code, DocApiSystemMap.name(code));
        return result;
    }

    private static String params(HandlerMethod handler) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (var parameter : handler.getMethodParameters()) {
            Map<String, Object> row = new LinkedHashMap<>();
            // HandlerMethod 的参数名发现器不一定开启；直接读反射 Parameter 名称，
            // 该名称来自编译期 -parameters（pom 已显式开启）。
            String parameterName = parameter.getParameterName();
            if ((parameterName == null || parameterName.isBlank()) && parameter.getParameter() != null) {
                parameterName = parameter.getParameter().getName();
            }
            row.put("name", parameterName);
            row.put("type", parameter.getGenericParameterType().getTypeName());
            List<Map<String, Object>> fields = dtoFields(parameter.getParameter().getType());
            if (!fields.isEmpty()) row.put("fields", fields);
            List<String> annotations = new ArrayList<>();
            for (Annotation annotation : parameter.getParameterAnnotations()) {
                String name = annotation.annotationType().getSimpleName();
                if (Set.of("RequestParam", "PathVariable", "RequestBody", "RequestHeader").contains(name)) {
                    annotations.add(name);
                }
            }
            if (!annotations.isEmpty()) row.put("annotations", annotations);
            rows.add(row);
        }
        try {
            return JSON.writeValueAsString(rows);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static List<Map<String, Object>> dtoFields(Class<?> type) {
        if (type == null || type.isPrimitive() || type.isArray()
                || type.getName().startsWith("java.") || type.getName().startsWith("javax.")
                || type.getName().startsWith("jakarta.")) return List.of();
        List<Map<String, Object>> fields = new ArrayList<>();
        java.util.Set<String> seen = new java.util.LinkedHashSet<>();
        Class<?> current = type;
        while (current != null && current != Object.class && fields.size() < 40) {
            for (java.lang.reflect.Field field : current.getDeclaredFields()) {
                if (java.lang.reflect.Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) continue;
                if (!seen.add(field.getName())) continue;
                fields.add(Map.of("name", field.getName(), "type", field.getGenericType().getTypeName()));
                if (fields.size() >= 40) break;
            }
            current = current.getSuperclass();
        }
        return fields;
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        String text = value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() > max ? value.substring(0, max) : value;
    }
}
