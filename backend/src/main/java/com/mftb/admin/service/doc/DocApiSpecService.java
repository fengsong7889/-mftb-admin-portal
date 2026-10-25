package com.mftb.admin.service.doc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

/**
 * P1c 接口文档：把 OpenAPI 变成可 diff 的结构化资产。
 *
 * <p>破坏性变更只记录“待确认”，不在这里擅自改文档状态；确认入口是
 * {@link #ackChange(long)}，由负责人/空间管理逐条确认。
 */
@Service
@RequiredArgsConstructor
public class DocApiSpecService {
    private static final Set<String> METHODS = Set.of("get", "post", "put", "delete", "patch", "head", "options");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final DocNativeStore store;
    private final DocNativeAccess access;

    @Transactional
    public ApiSpecView importSpec(long nodeId, ApiSpecImport input) {
        access.human();
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        access.live(head);
        Long revisionId = head.getEffectiveRevisionId();
        if (revisionId == null) throw new BusinessException(409, "此文檔尚無生效版本");
        Map<String, Object> root = parse(input.rawSpec());
        Map<String, Object> paths = map(root.get("paths"));
        if (paths.isEmpty()) throw new BusinessException(400, "OpenAPI 未包含 paths");
        String specVersion = input.specVersion().trim();
        if (store.count("SELECT COUNT(*) FROM doc_api_spec WHERE node_id=? AND spec_version=?", nodeId, specVersion) > 0) {
            throw new BusinessException(409, "該規格版本已存在");
        }
        String format = root.containsKey("openapi") ? "openapi3" : "swagger2";
        String baseUrl = baseUrl(root);
        String rawHash = hash(input.rawSpec());
        ApiSpec previous = latest(nodeId, input.systemCode());
        Long specId = insertSpec(nodeId, revisionId, input.systemCode().trim(), format, specVersion, baseUrl, rawHash, input.rawSpec());
        List<ApiOperation> operations = new ArrayList<>();
        Map<String, String> newHashes = new LinkedHashMap<>();
        for (Map.Entry<String, Object> pathEntry : paths.entrySet()) {
            String path = pathEntry.getKey();
            Map<String, Object> pathItem = map(pathEntry.getValue());
            for (String method : METHODS) {
                Object raw = pathItem.get(method);
                if (!(raw instanceof Map<?, ?>)) continue;
                Map<String, Object> operation = map(raw);
                String operationId = text(operation.get("operationId"));
                if (operationId == null) operationId = method.toUpperCase(Locale.ROOT) + " " + path;
                String summary = text(operation.get("summary"));
                String tag = firstTag(operation.get("tags"));
                boolean deprecated = Boolean.TRUE.equals(operation.get("deprecated"));
                String schemaHash = hash(canonical(operation));
                String key = method.toUpperCase(Locale.ROOT) + " " + path;
                newHashes.put(key, schemaHash);
                operations.add(new ApiOperation(null, truncate(operationId, 160), method.toUpperCase(Locale.ROOT),
                        truncate(path, 255), truncate(summary, 255), truncate(tag, 64), deprecated, schemaHash));
            }
        }
        if (operations.isEmpty()) throw new BusinessException(400, "OpenAPI 未包含可識別的操作");
        for (ApiOperation operation : operations) {
            store.jdbc().update("INSERT INTO doc_api_operation(spec_id,operation_id,method,path,summary,tag,"
                            + "deprecated,schema_hash) VALUES(?,?,?,?,?,?,?,?)",
                    specId, operation.operationId(), operation.method(), operation.path(), operation.summary(),
                    operation.tag(), operation.deprecated() ? 1 : 0, operation.schemaHash());
        }
        if (previous != null) diff(previous, specId, nodeId, head.getSpaceId(), newHashes, operations);
        store.audit(nodeId, head.getSpaceId(), access.actor(), "API_IMPORT", revisionId,
                "spec=" + specVersion + ",ops=" + operations.size(), null);
        return view(specId);
    }

    public List<ApiSpec> specs(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        return store.jdbc().query("SELECT id,node_id,revision_id,system_code,spec_format,spec_version,base_url,"
                        + "spec_hash,created_at FROM doc_api_spec WHERE node_id=? ORDER BY id DESC LIMIT 50",
                (rs, i) -> spec(rs), nodeId);
    }

    public ApiSpecView view(long specId) {
        ApiSpec spec = requireSpec(specId);
        Head head = store.head(spec.nodeId(), false);
        access.readDocumentCompat(head);
        List<ApiOperation> operations = store.jdbc().query(
                "SELECT id,operation_id,method,path,summary,tag,deprecated,schema_hash "
                        + "FROM doc_api_operation WHERE spec_id=? ORDER BY path,method",
                (rs, i) -> new ApiOperation(rs.getLong("id"), rs.getString("operation_id"),
                        rs.getString("method"), rs.getString("path"), rs.getString("summary"),
                        rs.getString("tag"), rs.getInt("deprecated") == 1, rs.getString("schema_hash")), specId);
        List<ApiChange> changes = store.jdbc().query(
                "SELECT id,change_type,operation_key,detail,acknowledged_by,created_at FROM doc_api_change "
                        + "WHERE to_spec_id=? ORDER BY id", (rs, i) -> change(rs), specId);
        int pending = changes.stream().filter(c -> c.acknowledgedBy() == null
                && (c.changeType() == 2 || c.changeType() == 3)).toList().size();
        return new ApiSpecView(spec, operations, changes, pending);
    }

    public List<ApiChange> diff(long specId, Long againstSpecId) {
        ApiSpec spec = requireSpec(specId);
        Head head = store.head(spec.nodeId(), false);
        access.readDocumentCompat(head);
        if (againstSpecId == null) {
            return store.jdbc().query("SELECT id,change_type,operation_key,detail,acknowledged_by,created_at "
                    + "FROM doc_api_change WHERE to_spec_id=? ORDER BY id", (rs, i) -> change(rs), specId);
        }
        return store.jdbc().query("SELECT id,change_type,operation_key,detail,acknowledged_by,created_at "
                + "FROM doc_api_change WHERE to_spec_id=? AND from_spec_id=? ORDER BY id",
                (rs, i) -> change(rs), specId, againstSpecId);
    }

    @Transactional
    public ApiChange ackChange(long changeId) {
        Head head = store.head(store.jdbc().queryForObject(
                "SELECT node_id FROM doc_api_change WHERE id=?", Long.class, changeId), true);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        int updated = store.jdbc().update("UPDATE doc_api_change SET acknowledged_by=? "
                + "WHERE id=? AND acknowledged_by IS NULL", access.actor(), changeId);
        if (updated == 0) throw new BusinessException(409, "變更已確認或不存在");
        store.audit(head.getNodeId(), head.getSpaceId(), access.actor(), "API_CHANGE_ACK",
                head.getEffectiveRevisionId(), "change=" + changeId, null);
        return store.jdbc().queryForObject("SELECT id,change_type,operation_key,detail,acknowledged_by,created_at "
                        + "FROM doc_api_change WHERE id=?", (rs, i) -> change(rs), changeId);
    }

    private void diff(ApiSpec previous, long toSpecId, long nodeId, long spaceId,
                      Map<String, String> newHashes, List<ApiOperation> operations) {
        Map<String, String> oldHashes = new LinkedHashMap<>();
        store.jdbc().query("SELECT method,path,schema_hash FROM doc_api_operation WHERE spec_id=?",
                rs -> {
                    oldHashes.put(rs.getString("method") + " " + rs.getString("path"), rs.getString("schema_hash"));
                }, previous.id());
        for (ApiOperation operation : operations) {
            String key = operation.method() + " " + operation.path();
            String old = oldHashes.get(key);
            int type;
            String detail;
            if (old == null) {
                type = 1;
                detail = "新增操作";
            } else if (!old.equals(operation.schemaHash())) {
                type = operation.deprecated() ? 4 : 3;
                detail = operation.deprecated() ? "操作已弃用" : "操作结构/描述变更（保守判定为破坏性）";
            } else {
                continue;
            }
            store.jdbc().update("INSERT INTO doc_api_change(node_id,from_spec_id,to_spec_id,change_type,"
                            + "operation_key,detail) VALUES(?,?,?,?,?,?)",
                    nodeId, previous.id(), toSpecId, type, key, detail);
        }
        for (String oldKey : oldHashes.keySet()) {
            if (newHashes.containsKey(oldKey)) continue;
            store.jdbc().update("INSERT INTO doc_api_change(node_id,from_spec_id,to_spec_id,change_type,"
                            + "operation_key,detail) VALUES(?,?,?,?,?,?)",
                    nodeId, previous.id(), toSpecId, 2, oldKey, "删除操作");
        }
    }

    private Long insertSpec(long nodeId, long revisionId, String systemCode, String format,
                            String version, String baseUrl, String hash, String rawSpec) {
        KeyHolder keys = new GeneratedKeyHolder();
        store.jdbc().update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO doc_api_spec(node_id,revision_id,system_code,spec_format,spec_version,base_url,"
                            + "source_type,raw_spec,spec_hash,synced_at) VALUES(?,?,?,?,?,?,1,?,?,NOW())",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, nodeId);
            ps.setLong(2, revisionId);
            ps.setString(3, systemCode);
            ps.setString(4, format);
            ps.setString(5, version);
            ps.setString(6, baseUrl);
            ps.setString(7, rawSpec);
            ps.setString(8, hash);
            return ps;
        }, keys);
        Number key = keys.getKey();
        if (key == null) throw new BusinessException(500, "規格保存失敗");
        return key.longValue();
    }

    private ApiSpec latest(long nodeId, String systemCode) {
        List<ApiSpec> rows = store.jdbc().query("SELECT id,node_id,revision_id,system_code,spec_format,spec_version,"
                        + "base_url,spec_hash,created_at FROM doc_api_spec WHERE node_id=? AND system_code=? "
                        + "ORDER BY id DESC LIMIT 1", (rs, i) -> spec(rs), nodeId, systemCode);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private ApiSpec requireSpec(long specId) {
        List<ApiSpec> rows = store.jdbc().query("SELECT id,node_id,revision_id,system_code,spec_format,spec_version,"
                + "base_url,spec_hash,created_at FROM doc_api_spec WHERE id=?", (rs, i) -> spec(rs), specId);
        if (rows.isEmpty()) throw new BusinessException(404, "接口規格不存在");
        return rows.get(0);
    }

    private static ApiSpec spec(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp created = rs.getTimestamp("created_at");
        return new ApiSpec(rs.getLong("id"), rs.getLong("node_id"), rs.getLong("revision_id"),
                rs.getString("system_code"), rs.getString("spec_format"), rs.getString("spec_version"),
                rs.getString("base_url"), rs.getString("spec_hash"),
                created == null ? null : created.toLocalDateTime());
    }

    private static ApiChange change(java.sql.ResultSet rs) throws java.sql.SQLException {
        Long ack = (Long) rs.getObject("acknowledged_by");
        Timestamp created = rs.getTimestamp("created_at");
        return new ApiChange(rs.getLong("id"), rs.getInt("change_type"), rs.getString("operation_key"),
                rs.getString("detail"), ack,
                created == null ? null : created.toLocalDateTime());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parse(String raw) {
        try {
            return JSON.readValue(raw, Map.class);
        } catch (Exception jsonError) {
            try {
                Object yaml = new Yaml(new SafeConstructor(new LoaderOptions())).load(raw);
                return map(yaml);
            } catch (Exception yamlError) {
                throw new BusinessException(400, "OpenAPI 必須是合法 JSON 或 YAML");
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of();
    }

    private static String baseUrl(Map<String, Object> root) {
        if (root.get("servers") instanceof List<?> servers && !servers.isEmpty()
                && servers.get(0) instanceof Map<?, ?> server && server.get("url") != null) {
            return truncate(String.valueOf(server.get("url")), 255);
        }
        String host = text(root.get("host"));
        String basePath = text(root.get("basePath"));
        if (host == null) return null;
        return truncate(host + (basePath == null ? "" : basePath), 255);
    }

    private static String firstTag(Object value) {
        if (value instanceof List<?> tags && !tags.isEmpty()) return String.valueOf(tags.get(0));
        return null;
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String canonical(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessException(400, "無法序列化操作定義");
        }
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        String text = value.replaceAll("[\\p{Cntrl}]", "").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }
}
