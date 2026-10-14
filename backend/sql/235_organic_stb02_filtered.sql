-- ============================================================
-- 235: 自然流量 STB_02 營業狀態「休息打烊」升级为系统过滤档
--
-- 背景：休息打烊原先按「重降權扣 80 分」配置，业务口径已改为
--       「商家打烊时系统直接过滤，不加载到瀑布流」——不是扣分，而是不参与召回。
--       此前该语义只存在于前端常量（BUSINESS_STATE_ITEMS 的第 4 档 filtered），
--       靠索引位置约定，看库无法得知这一档不计数；本迁移把语义写进数据本身。
--
-- 做法：condition_items 第 4 槽（索引 3，即休息打烊）的 condition 置为 'filtered'、score 归 0；
--       评分说明仅在仍为旧内置文案时同步，管理员自定义过的不覆盖。
--
-- 幂等：condition 已是 'filtered' 的行不再更新；description 以旧文案片段作条件。
-- 实际执行由 OrganicScoreDataInitializer 的 organic:stb02-filtered-v1 负责（Java 侧解析 JSON 后回写，
-- 以便在 H2 单测中验证；本文件为 MySQL 参考写法）。
-- ============================================================

UPDATE `biz_organic_score_rule`
SET `condition_items` = JSON_SET(`condition_items`, '$[3].condition', 'filtered', '$[3].score', 0),
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_02'
  AND `condition_items` IS NOT NULL
  AND JSON_LENGTH(`condition_items`) >= 4
  AND JSON_UNQUOTE(JSON_EXTRACT(`condition_items`, '$[3].condition')) <> 'filtered';

UPDATE `biz_organic_score_rule`
SET `description` = '營業中滿分；休息一會與爆單暫停（2小時自動恢復）按檔降權；休息打烊由系統直接過濾，不加載到瀑布流也不計分',
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_02'
  AND `description` LIKE '%四檔狀態分別配置得分%';

-- 后置校验：第 4 槽不得再有未标记为 filtered 的行
SELECT COUNT(*) AS unfiltered_remains
FROM `biz_organic_score_rule`
WHERE `rule_code` = 'STB_02'
  AND `condition_items` IS NOT NULL
  AND JSON_LENGTH(`condition_items`) >= 4
  AND JSON_UNQUOTE(JSON_EXTRACT(`condition_items`, '$[3].condition')) <> 'filtered';
