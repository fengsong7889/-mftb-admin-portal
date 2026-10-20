package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把指向「被去重软删模型」的引用重映射到同名组的保留行（配套 {@code ai:model-dedup:v1.0}）。
 * <p><b>为什么必须做</b>：去重只是把重复行软删，但授权数据里存的是 {@code model_id}——
 * 员工/部门/职位/角色授权与额度策略一旦引用了被软删的 id，就变成"配置还在、模型已不存在"的悬空引用：
 * 页面显示 {@code #4} 这种原始 id，四维授权并集里这条实际失效，用户会变成"明明配了却没权限"。
 * <p>覆盖两类引用：
 * <ul>
 *   <li>bigint 列（{@code model_id} / {@code downgrade_model_id} / {@code model_id} 映射表）；</li>
 *   <li>JSON 列里的 {@code "modelId":N}（职位授权策略与角色授权策略的 {@code model_configs}）。</li>
 * </ul>
 * 只重映射到同名组保留行，不改任何其它字段；重复项由 {@code collectXxxModels} 的并集语义天然吸收。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(24)
public class AiModelRefRemapInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:model-ref-remap:v1.0";

    /** bigint 引用列（表 → 列），都是历史上直接存 ai_model.id 的地方 */
    private static final Map<String, String> BIGINT_REFS = new LinkedHashMap<>();
    /** JSON 引用列（表 → 列），值是 [{"modelId":N,...}] 形态 */
    private static final Map<String, String> JSON_REFS = new LinkedHashMap<>();

    static {
        BIGINT_REFS.put("ai_employee_auth", "model_id");
        BIGINT_REFS.put("ai_department_auth", "model_id");
        BIGINT_REFS.put("ai_dept_auth_group_model", "model_id");
        BIGINT_REFS.put("ai_position_model_mapping", "model_id");
        BIGINT_REFS.put("ai_role_model_mapping", "model_id");
        BIGINT_REFS.put("ai_quota_config", "model_id");
        BIGINT_REFS.put("ai_quota_override", "model_id");
        BIGINT_REFS.put("ai_dept_quota_policy", "downgrade_model_id");
        BIGINT_REFS.put("ai_emp_quota_policy", "downgrade_model_id");
        BIGINT_REFS.put("ai_role_quota_policy", "downgrade_model_id");
        JSON_REFS.put("ai_emp_pos_auth_strategy", "model_configs");
        JSON_REFS.put("ai_emp_role_auth", "model_configs");
    }

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    /** 被软删的重复模型 id → 同名组保留 id（最小 id）。 */
    private Map<Long, Long> buildRemap() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT dropped.id AS dropped_id, kept.keep_id AS keep_id "
                + "FROM ai_model dropped "
                + "JOIN (SELECT provider_id, model_key, MIN(id) keep_id FROM ai_model "
                + "      WHERE deleted = 0 GROUP BY provider_id, model_key) kept "
                + "  ON kept.provider_id <=> dropped.provider_id AND kept.model_key = dropped.model_key "
                + "WHERE dropped.deleted = 1");
        Map<Long, Long> remap = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Object droppedId = row.get("dropped_id");
            Object keepId = row.get("keep_id");
            if (droppedId instanceof Number d && keepId instanceof Number k && d.longValue() != k.longValue()) {
                remap.put(d.longValue(), k.longValue());
            }
        }
        return remap;
    }

    private void doMigrate() {
        Map<Long, Long> remap = buildRemap();
        if (remap.isEmpty()) {
            log.info("模型引用重映射: 无需处理的悬空引用");
            return;
        }
        int total = 0;
        for (Map.Entry<String, String> ref : BIGINT_REFS.entrySet()) {
            String table = ref.getKey();
            String column = ref.getValue();
            if (!tableExists(table)) {
                continue;
            }
            for (Map.Entry<Long, Long> e : remap.entrySet()) {
                total += jdbcTemplate.update(
                        "UPDATE " + table + " SET " + column + " = ?, updated_at = NOW() WHERE " + column + " = ?",
                        e.getValue(), e.getKey());
            }
        }
        for (Map.Entry<String, String> ref : JSON_REFS.entrySet()) {
            String table = ref.getKey();
            String column = ref.getValue();
            if (!tableExists(table)) {
                continue;
            }
            total += remapJsonRefs(table, column, remap);
        }
        log.info("模型引用重映射: 悬空引用 {} 个, 修正 {} 处（表 {} / JSON {}）",
                remap.size(), total, BIGINT_REFS.size(), JSON_REFS.size());
    }

    /** JSON 里的 modelId 只能按文本替换（列是 TEXT，MySQL 不便就地改数组元素）。 */
    private int remapJsonRefs(String table, String column, Map<Long, Long> remap) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, " + column + " AS cfg FROM " + table + " WHERE " + column + " IS NOT NULL AND " + column + " != 'null'");
        int changed = 0;
        for (Map<String, Object> row : rows) {
            Object raw = row.get("cfg");
            if (!(raw instanceof String json) || json.isBlank()) {
                continue;
            }
            String next = json;
            for (Map.Entry<Long, Long> e : remap.entrySet()) {
                next = next.replaceAll("\"modelId\"\\s*:\\s*" + e.getKey() + "(\\D)", "\"modelId\":" + e.getValue() + "$1");
            }
            if (!next.equals(json)) {
                jdbcTemplate.update("UPDATE " + table + " SET " + column + " = ?, updated_at = NOW() WHERE id = ?",
                        next, row.get("id"));
                changed++;
            }
        }
        return changed;
    }

    private boolean tableExists(String table) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return exists != null && exists > 0;
    }

    /**
     * 后置校验：授权与额度配置里不允许再有指向软删模型的悬空引用。
     * 历史用量表（ai_usage_log）不在校验范围内——它是事实记录，引用当时真实存在过的模型是对的。
     */
    private void verifyMigration() {
        Map<Long, Long> remap = buildRemap();
        if (remap.isEmpty()) {
            return;
        }
        List<String> placeholders = new ArrayList<>();
        for (Long id : remap.keySet()) {
            placeholders.add(String.valueOf(id));
        }
        String in = String.join(",", placeholders);
        for (Map.Entry<String, String> ref : BIGINT_REFS.entrySet()) {
            if (!tableExists(ref.getKey())) {
                continue;
            }
            Integer left = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + ref.getKey() + " WHERE " + ref.getValue() + " IN (" + in + ")",
                    Integer.class);
            if (left != null && left > 0) {
                throw new IllegalStateException(ref.getKey() + "." + ref.getValue()
                        + " 仍有 " + left + " 行指向被软删模型，悬空引用未清干净");
            }
        }
        for (Map.Entry<String, String> ref : JSON_REFS.entrySet()) {
            if (!tableExists(ref.getKey())) {
                continue;
            }
            int hit = 0;
            for (Long id : remap.keySet()) {
                Integer n = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM " + ref.getKey() + " WHERE " + ref.getValue()
                        + " LIKE CONCAT('%\"modelId\":', ?, '%')", Integer.class, id);
                hit += n == null ? 0 : n;
            }
            if (hit > 0) {
                throw new IllegalStateException(ref.getKey() + "." + ref.getValue()
                        + " 仍有 " + hit + " 行 JSON 里引用被软删模型");
            }
        }
    }
}
