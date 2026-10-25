package com.mftb.admin.service.doc;

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

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 全系统接口清单：从 Spring Controller 映射扫描，不读请求内容、不保存密钥。
 * 入参/出参由方法签名反射成结构化字段表（{@link ApiSchemaResolver}），示例值按类型占位且敏感字段脱敏。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocApiCatalogService {
    /** 单批写入行数：出参字段表让单行变大，分批发避免一次性撑爆 max_allowed_packet。 */
    private static final int BATCH_SIZE = 200;
    private final RequestMappingHandlerMapping mappings;
    private final DocNativeStore store;
    private final DocNativeAccess access;

    @Transactional
    public Map<String, Object> scan() {
        access.menu("doc-api-center", "edit");
        long startedAt = System.currentTimeMillis();
        Map<String, String> names = systemNames();
        List<ApiCatalogEntry> rows = new ArrayList<>();
        // 同一返回类型只推导一次：上千个接口里大量共用 Result<List<XxxVO>> 等签名。
        Map<String, String> schemaCache = new HashMap<>();
        Map<String, String> exampleCache = new HashMap<>();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime scanStarted = now.minusSeconds(1);
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : mappings.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            HandlerMethod handler = entry.getValue();
            Set<String> paths = info.getPatternValues();
            Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();
            String method = methods.isEmpty() ? "GET" : methods.iterator().next().name();
            if (!Set.of("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS").contains(method)) continue;
            Method target = handler.getMethod();
            for (String path : paths) {
                if (!path.startsWith("/api/")) continue;
                String systemCode = DocApiSystemMap.code(path);
                String systemName = DocApiSystemMap.displayName(systemCode, names.get(systemCode));
                String handlerName = handler.getBeanType().getSimpleName() + "#" + target.getName();
                Operation operation = target.getAnnotation(Operation.class);
                String summary = operation == null ? null : trimToNull(operation.summary(), 200);
                String description = operation == null ? null : trimToNull(operation.description(), 1000);
                // 有 @Operation.summary 用人工语义；否则按方法名/路径生成草稿，并标记 auto 供人工复核。
                String draft = summary == null ? ApiNameDraft.draft(method, target.getName(), path) : null;
                String apiName = summary != null ? summary : draft;
                String apiNameSource = apiName == null ? null : (summary != null ? "operation" : "auto");
                String authScope = truncate(ApiSchemaResolver.authScope(target), 500);
                String returnType = target.getGenericReturnType().getTypeName();
                String responseFields = schemaCache.computeIfAbsent(returnType, key -> ApiSchemaResolver.responseJson(target));
                String responseExample = exampleCache.computeIfAbsent(returnType, key -> ApiSchemaResolver.example(target));
                String requestExample = ApiSchemaResolver.requestExample(target);
                rows.add(new ApiCatalogEntry(null, systemCode, systemName, method, truncate(path, 500),
                        truncate(handlerName, 255), ApiSchemaResolver.requestParams(target), truncate(returnType, 2000),
                        truncate(responseFields, 20000), "code", apiName, apiNameSource, description, null,
                        "JWT", authScope, 1, 1, null, "v1", null, truncate(requestExample, 20000),
                        truncate(responseExample, 20000), ApiSchemaResolver.errorCodes(authScope), null, true, now));
            }
        }
        persist(rows);
        store.jdbc().update("UPDATE doc_api_catalog SET active=0,updated_at=NOW() "
                + "WHERE source='code' AND synced_at < ?", scanStarted);
        long named = rows.stream().filter(row -> row.apiName() != null).count();
        log.info("接口清单同步完成：{} 个接口，命名 {}，出参 {}，耗时 {} ms",
                rows.size(), named, rows.stream().filter(row -> row.responseFields() != null).count(),
                System.currentTimeMillis() - startedAt);
        return Map.of("scanned", rows.size(), "systems", rows.stream().map(ApiCatalogEntry::systemCode).distinct().count(),
                "named", named, "withSchema", rows.stream().filter(row -> row.responseFields() != null).count());
    }

    /**
     * 代码扫描是幂等增量同步：不清表，保留人工补的文档字段；本次未出现的旧 code 行标记 inactive。
     * 名称只覆盖 operation 与 auto 来源，人工命名永不被重扫覆盖。
     */
    private void persist(List<ApiCatalogEntry> rows) {
        if (rows.isEmpty()) return;
        String sql = "INSERT INTO doc_api_catalog(system_code,system_name,method,path,handler,request_schema,"
                + "response_schema,response_fields,source,api_name,api_name_source,description,auth_scope,"
                + "error_codes,request_example,response_example,synced_at,active) "
                + "VALUES(?,?,?,?,?,?,?,?,'code',?,?,?,?,?,?,?,NOW(),1) "
                + "ON DUPLICATE KEY UPDATE system_name=VALUES(system_name),handler=VALUES(handler),"
                + "request_schema=VALUES(request_schema),response_schema=VALUES(response_schema),"
                + "response_fields=VALUES(response_fields),"
                + "api_name_source=IF(api_name IS NULL OR api_name='' OR api_name_source='auto',"
                + "VALUES(api_name_source),api_name_source),"
                + "api_name=IF(api_name IS NULL OR api_name='' OR api_name_source='auto',VALUES(api_name),api_name),"
                + "description=IF(description IS NULL OR description='',VALUES(description),description),"
                + "auth_scope=IF(auth_scope IS NULL OR auth_scope='',VALUES(auth_scope),auth_scope),"
                + "error_codes=IF(error_codes IS NULL OR error_codes='',VALUES(error_codes),error_codes),"
                + "request_example=IF(request_example IS NULL OR request_example='',VALUES(request_example),request_example),"
                + "response_example=IF(response_example IS NULL OR response_example='',VALUES(response_example),response_example),"
                + "synced_at=NOW(),updated_at=NOW(),active=1";
        List<Object[]> args = rows.stream().map(row -> new Object[]{
                row.systemCode(), row.systemName(), row.method(), row.path(), row.handler(),
                row.requestSchema(), row.responseSchema(), row.responseFields(), row.apiName(),
                row.apiNameSource(), row.description(), row.authScope(), row.errorCodes(), row.requestExample(),
                row.responseExample()
        }).toList();
        for (int start = 0; start < args.size(); start += BATCH_SIZE) {
            store.jdbc().batchUpdate(sql, args.subList(start, Math.min(start + BATCH_SIZE, args.size())));
        }
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

    /**
     * @param filter 文档完整度筛选：null/空=全部，draft=草稿，published=已发布，deprecated=已弃用，
     *               incomplete=缺名称/出参结构/响应示例/错误码之一
     */
    public ApiCatalogPage apis(String systemCode, String keyword, String filter, int page, int size) {
        access.menu("doc-api-center", "view");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        String system = StringUtils.hasText(systemCode) ? systemCode.trim() : null;
        String like = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        String extra = filterClause(filter);
        Long total = store.jdbc().queryForObject("SELECT COUNT(*) FROM doc_api_catalog WHERE active=1" + extra
                        + " AND (? IS NULL OR system_code=?) AND (? IS NULL OR path LIKE ? OR handler LIKE ? "
                        + "OR api_name LIKE ? OR description LIKE ? OR scenario LIKE ?)",
                Long.class, system, system, like, like, like, like, like, like);
        List<ApiCatalogEntry> rows = store.jdbc().query("SELECT " + SELECT + " FROM doc_api_catalog WHERE active=1" + extra
                        + " AND (? IS NULL OR system_code=?) AND (? IS NULL OR path LIKE ? OR handler LIKE ? "
                        + "OR api_name LIKE ? OR description LIKE ? OR scenario LIKE ?) "
                        + "ORDER BY system_code,path,method LIMIT ? OFFSET ?",
                (rs, i) -> entry(rs),
                system, system, like, like, like, like, like, like, safeSize, (safePage - 1) * safeSize);
        return new ApiCatalogPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    /** 只允许白名单常量片段，绝不把外部字符串拼进 SQL。 */
    private static String filterClause(String filter) {
        if (!StringUtils.hasText(filter)) return "";
        return switch (filter.trim()) {
            case "draft" -> " AND doc_status=1";
            case "published" -> " AND doc_status=2";
            case "deprecated" -> " AND doc_status=3";
            case "incomplete" -> " AND (api_name IS NULL OR api_name='' OR response_fields IS NULL"
                    + " OR response_fields='' OR response_example IS NULL OR response_example=''"
                    + " OR error_codes IS NULL OR error_codes='')";
            default -> "";
        };
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
        String nameSource = StringUtils.hasText(input.apiName()) ? "manual" : null;
        int updated = store.jdbc().update("UPDATE doc_api_catalog SET api_name=?,api_name_source=COALESCE(?,api_name_source),"
                        + "description=?,scenario=?,"
                        + "auth_type=?,auth_scope=?,visibility=?,doc_status=?,version=?,base_url=?,"
                        + "request_example=?,response_example=?,error_codes=?,changelog=?,"
                        + "owner_user_id=COALESCE(owner_user_id,?),updated_at=NOW() WHERE id=? AND active=1",
                trim(input.apiName(), 200), nameSource, trim(input.description(), 1000), trim(input.scenario(), 2000),
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
            + "response_schema,response_fields,source,api_name,api_name_source,description,scenario,auth_type,"
            + "auth_scope,visibility,doc_status,owner_user_id,version,base_url,request_example,response_example,"
            + "error_codes,changelog,active,synced_at";

    private ApiCatalogEntry entry(java.sql.ResultSet rs) throws java.sql.SQLException {
        String systemCode = rs.getString("system_code");
        return new ApiCatalogEntry(rs.getLong("id"), systemCode,
                DocApiSystemMap.displayName(systemCode, rs.getString("system_name")),
                rs.getString("method"), rs.getString("path"), rs.getString("handler"),
                rs.getString("request_schema"), rs.getString("response_schema"), rs.getString("response_fields"),
                rs.getString("source"), rs.getString("api_name"), rs.getString("api_name_source"),
                rs.getString("description"), rs.getString("scenario"),
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

    private static String trim(String value, int max) {
        if (value == null) return null;
        String text = value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String trimToNull(String value, int max) {
        if (!StringUtils.hasText(value)) return null;
        return trim(value, max);
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() > max ? value.substring(0, max) : value;
    }
}
