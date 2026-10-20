package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * ai_model 重复数据治理（参考文档 {@code backend/sql/266_ai_model_dedup.sql}）。
 * <p><b>根因</b>：唯一键 {@code uk_provider_key_version(provider_id, model_key, version)} 里
 * {@code version} 一直是 NULL，而 MySQL 唯一索引不约束 NULL ⇒ DataInitializer 的
 * {@code INSERT IGNORE} 每次启动都能再插一整组，7 次重启后 3 个模型变成 21 行。
 * 扩散面：模型接入列表、授权/额度下拉、申请页模型卡片（同名项出现 7 次，管理员无法判断选的是哪一条）。
 * <p><b>治理顺序</b>（顺序很关键，反了会撞唯一键）：
 * <ol>
 *   <li>同名组内把「最新一行」的可变字段回填给「保留行」——保留最小 id，因为授权/额度数据可能已引用它；</li>
 *   <li>软删其余重复行（只 UPDATE，不物理删除，保留追溯与回滚能力）；</li>
 *   <li>启用行 version 空值统一成 {@code 'default'}，让唯一键真正生效；</li>
 *   <li>种子同步写 {@code 'default'}（见 {@code DataInitializer} 模型种子），此后 INSERT IGNORE 天然幂等。</li>
 * </ol>
 * 与既有规范一致：{@link SchemaVersionTracker#applyOnce(String, Runnable, Runnable)} 带后置校验，
 * 校验不过不记版本、下次启动重试；失败一律抛出，不吞异常。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(22)
public class AiModelDedupInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:model-dedup:v1.0";
    /** 软删行的操作人签名，便于事后区分「系统治理改动」与「人工改动」 */
    private static final String OPERATOR = "system-ai-model-dedup";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        // 1) 回填保留行：取组内 id 最大行（最新种子）的能力/上下文/价格字段
        int synced = jdbcTemplate.update(
                "UPDATE ai_model keep "
                + "JOIN (SELECT provider_id, model_key, MIN(id) keep_id, MAX(id) latest_id FROM ai_model "
                + "      WHERE deleted = 0 GROUP BY provider_id, model_key HAVING COUNT(*) > 1) g "
                + "  ON keep.id = g.keep_id "
                + "JOIN ai_model latest ON latest.id = g.latest_id "
                + "SET keep.name = latest.name, keep.description = latest.description, "
                + "    keep.api_compat = latest.api_compat, keep.modalities = latest.modalities, "
                + "    keep.vision_support = latest.vision_support, keep.function_calling = latest.function_calling, "
                + "    keep.json_mode = latest.json_mode, keep.streaming = latest.streaming, "
                + "    keep.thinking_mode = latest.thinking_mode, keep.type = latest.type, "
                + "    keep.deploy_type = latest.deploy_type, keep.context_window = latest.context_window, "
                + "    keep.max_output_tokens = latest.max_output_tokens, keep.input_price = latest.input_price, "
                + "    keep.output_price = latest.output_price, keep.cached_input_price = latest.cached_input_price, "
                + "    keep.currency = latest.currency, keep.concurrency_limit = latest.concurrency_limit, "
                + "    keep.status = latest.status, keep.sort_order = latest.sort_order");
        // 2) 软删组内重复行（必须在回填之后：此时保留行 version 仍为 NULL，不会与新唯一键值冲突）
        int retired = jdbcTemplate.update(
                "UPDATE ai_model m "
                + "JOIN (SELECT provider_id, model_key, MIN(id) keep_id FROM ai_model WHERE deleted = 0 "
                + "      GROUP BY provider_id, model_key HAVING COUNT(*) > 1) g "
                + "  ON m.provider_id = g.provider_id AND m.model_key = g.model_key AND m.id > g.keep_id "
                + "SET m.deleted = 1, m.updated_by = '" + OPERATOR + "'");
        // 3) 启用行补齐 version 非空值：MySQL 唯一索引不约束 NULL，这是重复插入的根因
        int normalized = jdbcTemplate.update(
                "UPDATE ai_model SET version = 'default' "
                + "WHERE deleted = 0 AND (version IS NULL OR version = '')");
        log.info("ai_model 去重治理: 回填保留行={}, 软删重复行={}, version 归一={}, 操作人={}",
                synced, retired, normalized, OPERATOR);
    }

    /** 后置校验：启用行不得再同名重复，且 version 必须非空（否则唯一键继续形同虚设）。 */
    private void verifyMigration() {
        Integer duplicated = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT provider_id, model_key FROM ai_model WHERE deleted = 0 "
                + "GROUP BY provider_id, model_key HAVING COUNT(*) > 1) d", Integer.class);
        if (duplicated != null && duplicated > 0) {
            throw new IllegalStateException("ai_model 仍存在 " + duplicated + " 组重复启用行，去重未生效");
        }
        Integer nullVersion = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_model WHERE deleted = 0 AND (version IS NULL OR version = '')",
                Integer.class);
        if (nullVersion != null && nullVersion > 0) {
            throw new IllegalStateException("ai_model 仍有 " + nullVersion + " 条启用行 version 为空，唯一键无法防重");
        }
    }
}
