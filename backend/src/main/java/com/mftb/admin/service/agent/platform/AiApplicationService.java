package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * WP04：Agent 应用与版本。应用是「谁负责、为哪个业务域服务、用了哪些工具/知识/预算」的主线，
 * 版本发布后不可修改；回滚等于重新指向旧版本并留一条发布快照。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiApplicationService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public List<Map<String, Object>> list(String keyword) {
        String sql = "SELECT id, app_key, name, system_code, owner_name, purpose, status, published_version, updated_at "
                + "FROM ai_application WHERE 1=1";
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(keyword)) {
            sql += " AND (app_key LIKE ? OR name LIKE ?)";
            args.add("%" + keyword.trim() + "%");
            args.add("%" + keyword.trim() + "%");
        }
        sql += " ORDER BY updated_at DESC LIMIT 200";
        return jdbc.queryForList(sql, args.toArray());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> save(Map<String, Object> body, String operator) {
        String appKey = text(body.get("appKey"));
        String name = text(body.get("name"));
        String systemCode = StringUtils.hasText(text(body.get("systemCode"))) ? text(body.get("systemCode")) : "common";
        if (appKey == null || !appKey.matches("[a-z][a-z0-9-]{2,63}")) {
            throw new BusinessException("appKey 需為 3-64 位小寫字母、數字或連字號，且以字母開頭");
        }
        if (name == null || name.length() > 128) throw new BusinessException("請填寫應用名稱（≤128 字）");
        if (!systemCode.matches("[a-z][a-z0-9-]{1,31}")) throw new BusinessException("systemCode 格式不正確");
        boolean exists = !jdbc.queryForList("SELECT id FROM ai_application WHERE app_key = ?", appKey).isEmpty();
        if (exists) {
            jdbc.update("UPDATE ai_application SET name=?, system_code=?, owner_user_id=?, owner_name=?, purpose=? WHERE app_key=?",
                    name, systemCode, longOrNull(body.get("ownerUserId")), text(body.get("ownerName")),
                    truncate(text(body.get("purpose")), 512), appKey);
        } else {
            jdbc.update("INSERT INTO ai_application(app_key, name, system_code, owner_user_id, owner_name, purpose, created_by) "
                            + "VALUES(?,?,?,?,?,?,?)",
                    appKey, name, systemCode, longOrNull(body.get("ownerUserId")), text(body.get("ownerName")),
                    truncate(text(body.get("purpose")), 512), operator);
        }
        return one(appKey);
    }

    public Map<String, Object> one(String appKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, app_key, name, system_code, owner_user_id, owner_name, purpose, status, published_version "
                        + "FROM ai_application WHERE app_key = ?", appKey);
        if (rows.isEmpty()) throw new BusinessException(404, "應用不存在");
        Map<String, Object> app = new LinkedHashMap<>(rows.get(0));
        app.put("versions", versions(appKey));
        return app;
    }

    public List<Map<String, Object>> versions(String appKey) {
        return jdbc.queryForList("SELECT v.id, v.version_no, v.status, v.model_key, v.prompt_profile_key, "
                + "v.tool_whitelist_json, v.knowledge_systems_json, v.budget_scope_type, v.budget_scope_key, "
                + "v.change_note, v.published_at, v.published_by, v.created_at "
                + "FROM ai_application_version v JOIN ai_application a ON a.id = v.app_id "
                + "WHERE a.app_key = ? ORDER BY v.version_no DESC LIMIT 100", appKey);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createVersion(String appKey, Map<String, Object> body, String operator) {
        Long appId = appIdForUpdate(appKey);
        List<String> tools = stringList(body.get("toolWhitelist"));
        List<String> knowledge = stringList(body.get("knowledgeSystems"));
        Integer next = jdbc.queryForObject(
                "SELECT COALESCE(MAX(version_no), 0) + 1 FROM ai_application_version WHERE app_id = ?", Integer.class, appId);
        String toolsJson;
        String knowledgeJson;
        try {
            toolsJson = mapper.writeValueAsString(tools);
            knowledgeJson = mapper.writeValueAsString(knowledge);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(500, "版本配置無法序列化");
        }
        jdbc.update("INSERT INTO ai_application_version(app_id, version_no, status, model_key, prompt_profile_key, "
                        + "tool_whitelist_json, knowledge_systems_json, budget_scope_type, budget_scope_key, change_note) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?)",
                appId, next, "draft", text(body.get("modelKey")), text(body.get("promptProfileKey")),
                toolsJson, knowledgeJson,
                StringUtils.hasText(text(body.get("budgetScopeType"))) ? text(body.get("budgetScopeType")) : "USER",
                text(body.get("budgetScopeKey")), truncate(text(body.get("changeNote")), 512));
        return versionRow(appKey, next);
    }

    /** 发布：旧版本置 retired，新版本置 published，并写入不可变发布快照。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> publish(String appKey, Integer versionNo, String operator, String note) {
        Long appId = appIdForUpdate(appKey);
        Map<String, Object> version = versionRow(appKey, versionNo);
        if (version == null) throw new BusinessException(404, "版本不存在");
        if (!"retired".equals(version.get("status")) && !"draft".equals(version.get("status"))
                && !"published".equals(version.get("status"))) {
            throw new BusinessException("版本狀態不允許發布");
        }
        jdbc.update("UPDATE ai_application_version SET status='retired' WHERE app_id=? AND status='published'", appId);
        jdbc.update("UPDATE ai_application_version SET status='published', published_at=NOW(), published_by=? "
                + "WHERE app_id=? AND version_no=?", operator, appId, versionNo);
        jdbc.update("UPDATE ai_application SET published_version=? WHERE id=?", versionNo, appId);
        String snapshot;
        try {
            snapshot = mapper.writeValueAsString(Map.of(
                    "appKey", appKey, "versionNo", versionNo, "publishedBy", operator,
                    "modelKey", String.valueOf(version.getOrDefault("model_key", "")),
                    "toolWhitelist", String.valueOf(version.getOrDefault("tool_whitelist_json", "")),
                    "knowledgeSystems", String.valueOf(version.getOrDefault("knowledge_systems_json", "")),
                    "at", java.time.LocalDateTime.now().toString()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(500, "發布快照無法生成");
        }
        jdbc.update("INSERT INTO ai_release_snapshot(app_key, app_version, snapshot_json, released_by, note) "
                + "VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE snapshot_json=VALUES(snapshot_json), released_by=VALUES(released_by)",
                appKey, versionNo, snapshot, operator, truncate(note, 512));
        log.info("[AgentApp] 发布 app={} version={} by={}", appKey, versionNo, operator);
        return one(appKey);
    }

    /** 回滚：把指定旧版本重新发布，并在最新发布记录上标记回滚时间。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> rollback(String appKey, Integer versionNo, String operator, String note) {
        Integer current = jdbc.queryForObject(
                "SELECT published_version FROM ai_application WHERE app_key=?", Integer.class, appKey);
        if (current == null || current == 0) throw new BusinessException("應用尚未發布，無需回滾");
        if (current.equals(versionNo)) throw new BusinessException("目標版本已是當前生產版本");
        Map<String, Object> result = publish(appKey, versionNo, operator, note == null ? "rollback" : note);
        jdbc.update("UPDATE ai_release_snapshot SET rolled_back_at=NOW() WHERE app_key=? AND app_version=?",
                appKey, current);
        jdbc.update("UPDATE ai_application_version SET status='retired' WHERE app_id="
                + "(SELECT id FROM ai_application WHERE app_key=?) AND version_no=?", appKey, current);
        log.info("[AgentApp] 回滚 app={} from={} to={} by={}", appKey, current, versionNo, operator);
        return result;
    }

    /** 当前生产版本；未发布返回 null（调用方必须按“无授权工具集”处理）。 */
    public Map<String, Object> published(String appKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT v.* FROM ai_application a JOIN ai_application_version v ON v.app_id=a.id "
                        + "WHERE a.app_key=? AND a.status=1 AND v.status='published' ORDER BY v.version_no DESC LIMIT 1", appKey);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<String> toolWhitelist(Map<String, Object> version) {
        if (version == null) return List.of();
        try {
            return mapper.readValue(String.valueOf(version.getOrDefault("tool_whitelist_json", "[]")),
                    new com.fasterxml.jackson.core.type.TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of();
        }
    }

    private Long appIdForUpdate(String appKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id FROM ai_application WHERE app_key=? FOR UPDATE", appKey);
        if (rows.isEmpty()) throw new BusinessException(404, "應用不存在，請先登記");
        return ((Number) rows.get(0).get("id")).longValue();
    }

    /** 发布快照列表（不可变记录，含回滚标记）；不返回 snapshot_json 全文。 */
    public List<Map<String, Object>> releases(String appKey) {
        String sql = "SELECT app_key, app_version, released_by, released_at, rolled_back_at, note "
                + "FROM ai_release_snapshot";
        if (StringUtils.hasText(appKey)) {
            return jdbc.queryForList(sql + " WHERE app_key=? ORDER BY released_at DESC LIMIT 100", appKey);
        }
        return jdbc.queryForList(sql + " ORDER BY released_at DESC LIMIT 100");
    }

    /** 指定版本（运行冻结用）；不存在返回 null。 */
    public Map<String, Object> version(String appKey, Integer versionNo) {
        return versionRow(appKey, versionNo);
    }

    private Map<String, Object> versionRow(String appKey, Integer versionNo) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT v.* FROM ai_application a JOIN ai_application_version v ON v.app_id=a.id "
                        + "WHERE a.app_key=? AND v.version_no=?", appKey, versionNo);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static String text(Object v) { return v == null ? null : String.valueOf(v).trim(); }
    private static Long longOrNull(Object v) {
        if (v instanceof Number n) return n.longValue();
        String s = text(v);
        return s != null && s.matches("\\d{1,19}") ? Long.valueOf(s) : null;
    }
    private static String truncate(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item != null && String.valueOf(item).length() <= 64) out.add(String.valueOf(item));
        }
        return out;
    }
}
