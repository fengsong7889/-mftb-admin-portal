-- 266: ai_model 重复数据治理（同名模型被重复种入 7 份）
--
-- 根因：唯一键 uk_provider_key_version(provider_id, model_key, version) 里 version 一直是 NULL，
--       而 MySQL 唯一索引不约束 NULL → DataInitializer 的 `INSERT IGNORE` 每次启动都能插进一整组
--       新行，7 次重启后 3 个模型变成 21 行。扩散面：模型接入列表、授权/额度下拉、申请页模型卡片。
--
-- 治理策略（与 Java 迁移 ai:model-dedup:v1.0 等价，此处为一次性参考文档；实际幂等由 Java 保证）：
--   1) 同名组内把「最新一行」的可变字段回填到「保留行」（保留最小 id，因为授权/额度数据可能引用它）；
--   2) 软删其余重复行（不物理删除，保留可追溯与回滚能力）；
--   3) 把启用行的 version 空值统一成 'default'，让唯一键真正生效；
--   4) 种子同步改为写 version='default'，此后 INSERT IGNORE 天然幂等。
--
-- 禁止破坏性操作：只 UPDATE，不 DELETE / DROP。

-- 1) 回填保留行字段（取组内 id 最大行的值）
UPDATE ai_model keep
JOIN (
    SELECT provider_id, model_key, MIN(id) keep_id, MAX(id) latest_id
    FROM ai_model WHERE deleted = 0
    GROUP BY provider_id, model_key HAVING COUNT(*) > 1
) g ON keep.id = g.keep_id
JOIN ai_model latest ON latest.id = g.latest_id
SET keep.name = latest.name,
    keep.description = latest.description,
    keep.api_compat = latest.api_compat,
    keep.modalities = latest.modalities,
    keep.vision_support = latest.vision_support,
    keep.function_calling = latest.function_calling,
    keep.json_mode = latest.json_mode,
    keep.streaming = latest.streaming,
    keep.thinking_mode = latest.thinking_mode,
    keep.type = latest.type,
    keep.deploy_type = latest.deploy_type,
    keep.context_window = latest.context_window,
    keep.max_output_tokens = latest.max_output_tokens,
    keep.input_price = latest.input_price,
    keep.output_price = latest.output_price,
    keep.cached_input_price = latest.cached_input_price,
    keep.currency = latest.currency,
    keep.concurrency_limit = latest.concurrency_limit,
    keep.status = latest.status,
    keep.sort_order = latest.sort_order;

-- 2) 软删组内重复行（保留最小 id）
UPDATE ai_model m
JOIN (
    SELECT provider_id, model_key, MIN(id) keep_id
    FROM ai_model WHERE deleted = 0
    GROUP BY provider_id, model_key HAVING COUNT(*) > 1
) g ON m.provider_id = g.provider_id AND m.model_key = g.model_key AND m.id > g.keep_id
SET m.deleted = 1,
    m.updated_by = 'system-ai-model-dedup';

-- 3) 启用行 version 空值统一为 'default'，让 uk_provider_key_version 真正生效
UPDATE ai_model
SET version = 'default'
WHERE deleted = 0 AND (version IS NULL OR version = '');

-- 4) 自检（期望 0 行）
SELECT provider_id, model_key, COUNT(*) AS duplicated
FROM ai_model WHERE deleted = 0
GROUP BY provider_id, model_key HAVING COUNT(*) > 1;
