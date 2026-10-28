-- 303: 自然流量计分项 COM_02「减免运费」新增计分配置列
--
-- 背景：减免运费计分改为「报名分 + 人工配置的门槛档位」，并增加报名分护栏
--       （有效门槛上限默认跟随末档，超过上限默认停发报名分），配置需要随规则落库，
--       不再只存页面草稿。
--
-- 结构：free_shipping_config TEXT，存 JSON：
--       { enrollmentScore, thresholdEnabled, thresholdBands: [{threshold, score}],
--         guardThreshold?, enrollWhenGuarded }
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际补列由
--          LegacyCoreContracts.organicScoreRuleContract() 的结构契约在每次启动时自愈
--          （先查 INFORMATION_SCHEMA.COLUMNS，缺失才 ADD COLUMN），禁止手动改库。
--
-- 回滚：列可保留不删（旧代码不会读取），如需清理请走发布评审，禁止直接 DROP COLUMN。
ALTER TABLE `biz_organic_score_rule`
  ADD COLUMN `free_shipping_config` TEXT DEFAULT NULL
  COMMENT '減免運費計分配置 JSON（門檻檔位 + 報名分護欄，僅 COM_02）';
