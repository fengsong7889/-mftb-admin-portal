# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 330: 店鋪維度計分項（STB_01）「主營時段加分」改為五餐段獨立配分
-- ---------------------------------------------------------------------------
-- 業務決定：主營時段加分不再是一個固定分，而是 早餐 / 午餐 / 下午茶 / 晚餐 / 宵夜
-- 五個時段各自配分；當前處於哪個時段由業務系統傳入，命中一檔即停、不累加，未配置的時段不加分。
--
-- 新增專用列 time_period_config（沿用 store_label_config / traffic_balance_config / free_shipping_config 先例）：
--   不复用 condition_items —— 避免消費方把「當前時段命中一檔」誤讀成條件計分；
--   不复用 time_range_scores —— 那是已下架的 PLT_02A 配送分層結構（四檔 × 五時段），語義不同。
--   列已在 LegacyCoreContracts.organicScoreRuleContract 登記 CREATE DDL 與可自愈 ColumnSpec。
--
-- ⚠️ 時序：SchemaContractValidator 是 @Order(Integer.MAX_VALUE)，跑在 OrganicScoreDataInitializer 之後，
--   新庫首啟時該列尚未被契約自愈補上，因此 Java 遷移先探測列是否就緒（SELECT 該列 WHERE 1=0）再決定是否 ALTER，
--   ALTER 失敗不吞異常、直接拋出。不用 INFORMATION_SCHEMA + DATABASE() 模板：它在測試用 H2 下永不相等，
--   會讓補列邏輯落在沒被單測覆蓋的狀態。
--   本文件僅作參考文檔，冪等性與後置校驗由 Java 遷移 organic:stb01-time-period-v1 保證。
-- ---------------------------------------------------------------------------
ALTER TABLE `biz_organic_score_rule`
    ADD COLUMN `time_period_config` TEXT DEFAULT NULL COMMENT '主營時段分時段計分配置 JSON（[{periodValue,periodName,score}]，僅 STB_01）';

-- 數據收斂：把原固定分放進午餐一檔，其餘四檔留待運營配置；score 置 0，
-- 因為本項得分此後只由 time_period_config 決定，保留固定分會讓外部計分引擎重複累加。
-- 守衛 time_period_config IS NULL：運營已在界面配過清單的行絕不頂掉。
UPDATE `biz_organic_score_rule`
SET `time_period_config` = JSON_OBJECT(
        'items', JSON_ARRAY(JSON_OBJECT('periodValue', 'lunch', 'periodName', '午餐', 'score', `score`))),
    `score` = 0,
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_01' AND `deleted` = 0 AND `time_period_config` IS NULL AND `score` IS NOT NULL;

UPDATE `biz_organic_score_rule`
SET `time_period_config` = JSON_OBJECT('items', JSON_ARRAY()),
    `score` = 0,
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_01' AND `deleted` = 0 AND `time_period_config` IS NULL AND `score` IS NULL;

-- 回滾（僅在需要恢復「單一固定分」形態時手工執行；同時必須把前端模板與面板改回固定分入口，
-- 否則界面仍按分時段清單讀寫，會看不到已回滾的 score）：
--   UPDATE `biz_organic_score_rule`
--   SET `score` = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`time_period_config`, '$.items[0].score')) AS SIGNED), 0),
--       `time_period_config` = NULL, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_01' AND `deleted` = 0;
--   ALTER TABLE `biz_organic_score_rule` DROP COLUMN `time_period_config`;
-- 若要让下次启动重新执行本迁移，需删除 sys_schema_migration_log 裡的 organic:stb01-time-period-v1 版本行。
