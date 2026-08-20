-- ============================================================
-- 清理自然流量评分规则中的临时编码（STB_TMP_* / PLT_TMP_*）
-- 这些是编码规范化迁移前的旧数据，已被新的 STB_XX / PLT_XX 替代
-- ============================================================

-- 逻辑删除所有 STB_TMP_* 和 PLT_TMP_* 编码的规则
UPDATE `biz_organic_score_rule`
SET `deleted` = 1, `updated_at` = NOW()
WHERE `rule_code` LIKE 'STB_TMP_%' OR `rule_code` LIKE 'PLT_TMP_%';
