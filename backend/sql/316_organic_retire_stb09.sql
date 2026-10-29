-- 316: 店鋪維度計分項（STB_09）「超時接單」下架
-- ---------------------------------------------------------------------------
-- 業務決定取消「超時接單」計分項：前端已從默認計分項目錄移除，並登記進
-- RETIRED_ORGANIC_RULE_IDS（庫內殘留行在讀取側被過濾，界面不再展示、也不再作為新增模板）。
-- 本步把口徑收斂到數據側：邏輯刪除而非物理刪除，與應用自身 deleteRule 的 @TableLogic 語義一致，
-- 保留歷史便於對賬與回滾。
-- 為什麼不复用 organic:retire-rules-v1：該鍵只覆蓋 COM_09/STB_04，且生產已記為成功、
-- applyOnce 門控下追加條目不會重跑（歷史事故見 OrganicScoreDataInitializer 類註釋），
-- 因此必須用獨立新鍵 organic:retire-stb09-v1。
-- 冪等性與後置校驗由 Java 遷移保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `deleted` = 1, `updated_by` = 'system'
WHERE `deleted` = 0 AND `rule_code` = 'STB_09';

-- 回滾（僅在需要恢復該計分項時手工執行；同時必須撤掉前端 RETIRED_ORGANIC_RULE_IDS 裡的 'STB_09'，
-- 否則庫內行雖未刪除仍會被讀取側過濾掉）：
--   UPDATE `biz_organic_score_rule` SET `deleted` = 0, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_09' AND `deleted` = 1;
-- 若要让下次启动重新执行本迁移，需删除 sys_schema_migration_log 裡的 organic:retire-stb09-v1 版本行。
