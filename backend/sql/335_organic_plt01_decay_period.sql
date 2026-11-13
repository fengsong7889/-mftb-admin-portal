# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 335: 平台維度計分項（PLT_01）「距離衰減」滿分改為五餐段獨立配置
-- ---------------------------------------------------------------------------
-- 業務決定：滿分不再是一個單一值，而是 早餐 / 午餐 / 下午茶 / 晚餐 / 宵夜 五個時段
-- 各自配置滿分；衰減係數仍全局只有一個配置（decay_coefficient），所有時段共用。
-- 得分 = max(0, 滿分（當前時段） - 衰減係數 × 距離)；當前時段由業務系統傳入，
-- 未配置滿分的時段不計分（不設兜底分）。
--
-- 新增專用列 decay_period_config（沿用 time_period_config 先例）：
--   行形狀 [{periodValue, periodName, score}]，score 语义为该时段「满分」（不是加分）；
--   列已在 LegacyCoreContracts.organicScoreRuleContract 登記 CREATE DDL 與可自愈 ColumnSpec。
--
-- ⚠️ 時序：SchemaContractValidator 是 @Order(Integer.MAX_VALUE)，跑在 OrganicScoreDataInitializer 之後，
--   新庫首啟時該列尚未被契約自愈補上，因此 Java 遷移先探測列是否就緒（SELECT 該列 WHERE 1=0）再決定是否 ALTER，
--   ALTER 失敗不吞異常、直接拋出。不用 INFORMATION_SCHEMA + DATABASE() 模板（H2 下永不相等）。
--   本文件僅作參考文檔，冪等性與後置校驗由 Java 遷移 organic:plt01-decay-period-v1 保證。
--
-- score 保留舊滿分（100）作 legacy 計分引擎兜底：DECAY 模式引擎把 score 當滿分，
-- 置 0 會立即讓生產距離衰減歸零；待引擎讀新列後再收敛（與 STB_01 加分項置 0 的先例不同）。
-- ---------------------------------------------------------------------------
ALTER TABLE `biz_organic_score_rule`
    ADD COLUMN `decay_period_config` TEXT DEFAULT NULL COMMENT '距離衰減分時段滿分配置 JSON（[{periodValue,periodName,score}]，僅 PLT_01）';

-- 數據收斂：五時段全預填舊滿分 100，運營未調整前各時段口徑與舊滿分一致。
-- 守衛 decay_period_config IS NULL：運營已在界面配過滿分清單的行絕不頂掉。
UPDATE `biz_organic_score_rule`
SET `decay_period_config` = '{"items":[{"periodValue":"breakfast","periodName":"早餐","score":100},{"periodValue":"lunch","periodName":"午餐","score":100},{"periodValue":"afternoonTea","periodName":"下午茶","score":100},{"periodValue":"dinner","periodName":"晚餐","score":100},{"periodValue":"lateNight","periodName":"宵夜","score":100}]}',
    `updated_by` = 'system'
WHERE `rule_code` = 'PLT_01' AND `deleted` = 0 AND `decay_period_config` IS NULL;

-- 計分說明收斂：以舊內置值作條件，絕不頂掉管理員自定義文案。
UPDATE `biz_organic_score_rule`
SET `description` = '滿分按時段獨立配置，得分 = 滿分（當前時段） - 衰減係數 × 距離，距離越遠得分越低',
    `updated_by` = 'system'
WHERE `rule_code` = 'PLT_01' AND `deleted` = 0
  AND `description` = '滿分按衰減係數×距離遞減，距離越遠得分越低';

-- 回滾（僅在需要恢復「單一滿分」形態時手工執行；同時必須把前端面板改回單一滿分入口）：
--   UPDATE `biz_organic_score_rule`
--   SET `decay_period_config` = NULL, `updated_by` = 'system'
--   WHERE `rule_code` = 'PLT_01' AND `deleted` = 0;
--   UPDATE `biz_organic_score_rule`
--   SET `description` = '滿分按衰減係數×距離遞減，距離越遠得分越低', `updated_by` = 'system'
--   WHERE `rule_code` = 'PLT_01' AND `deleted` = 0
--     AND `description` = '滿分按時段獨立配置，得分 = 滿分（當前時段） - 衰減係數 × 距離，距離越遠得分越低';
-- 列依「生產禁止 DROP COLUMN」規則保留，不回滾結構。
-- 若要让下次启动重新执行本迁移，需删除 sys_schema_migration_log 裡的 organic:plt01-decay-period-v1 版本行。