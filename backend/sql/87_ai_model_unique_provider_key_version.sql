-- 87_ai_model_unique_provider_key_version.sql
-- AI 模型表：联合唯一约束 (provider_id, model_key, version)
-- 2026-09 改造：支持多版本共存（modelKey 不变，version 不同视为不同记录）
-- 用途：模型升级时保留旧版本，新增同 modelKey 的新版本行，可灰度切换与回滚

-- 1. 删除旧的 uk_model_key（model_key 单独唯一）
ALTER TABLE ai_model DROP INDEX uk_model_key;

-- 2. 添加 (provider_id, model_key, version) 联合唯一约束
ALTER TABLE ai_model
  ADD UNIQUE KEY uk_provider_key_version (provider_id, model_key, version);
