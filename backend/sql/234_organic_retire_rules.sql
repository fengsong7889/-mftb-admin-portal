-- ============================================================
-- 234: 自然流量下架计分项收敛（COM_09 點金廣告 / STB_04 店鋪標籤-金牌）
--
-- 背景：这两项已从前端模板 organicTrafficConfig.ts 移除，并由 RETIRED_ORGANIC_RULE_IDS
--       在加载时过滤，不再展示、也不再作为新增模板；但库里仍是 23_organic_score.sql 种子
--       写入的内置行，看库/对账口径与界面不一致。历史种子脚本不得修改，故单独登记一次性收敛。
--
-- 为什么是逻辑删除而不是 DELETE：
--   biz_organic_score_rule 使用 MyBatis-Plus @TableLogic(deleted)，应用自身的删除也是置 deleted=1；
--   保持一致语义，且随时可把 deleted 改回 0 回滚，保留历史配置。
--
-- 幂等：条件带 deleted = 0，重复执行命中 0 行。
-- 实际执行由 OrganicScoreDataInitializer 的 organic:retire-rules-v1 负责（本文件为参考文档）。
-- ============================================================

UPDATE `biz_organic_score_rule`
SET `deleted` = 1,
    `updated_by` = 'system'
WHERE `rule_code` IN ('COM_09', 'STB_04')
  AND `deleted` = 0;

-- 后置校验：两项不得再有未删除的残留行
SELECT COUNT(*) AS legacy_remains
FROM `biz_organic_score_rule`
WHERE `rule_code` IN ('COM_09', 'STB_04')
  AND `deleted` = 0;
