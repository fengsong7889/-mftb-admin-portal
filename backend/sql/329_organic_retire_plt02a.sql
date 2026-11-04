# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 329: 平台維度計分項（PLT_02A）「配送範圍」下架
-- ---------------------------------------------------------------------------
-- 業務決定取消「配送範圍」計分項：前端已從默認計分項目錄移除，並登記進
-- RETIRED_ORGANIC_RULE_IDS（庫內殘留行在讀取側被過濾，界面不再展示、也不再作為新增模板）。
-- 本步把口徑收斂到數據側：邏輯刪除而非物理刪除，與應用自身 deleteRule 的 @TableLogic 語義一致，
-- 保留歷史便於對賬與回滾；號位不回收，歷史訂單與快照仍按該編碼追溯。
-- 為什麼複用舊鍵不行：organic:retire-rules-v1 只覆蓋 COM_09/STB_04、organic:retire-stb09-v1 只覆蓋
-- STB_09，且生產已記為成功、applyOnce 門控下追加條目不會重跑（歷史事故見 OrganicScoreDataInitializer
-- 類註釋），因此必須用獨立新鍵 organic:retire-plt02a-v1。
-- 表結構不動：time_range_scores 列與後端 DTO 字段保留（其它規則不受影響，回滾也不需要 ALTER）。
-- 冪等性與後置校驗由 Java 遷移保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `deleted` = 1, `updated_by` = 'system'
WHERE `deleted` = 0 AND `rule_code` = 'PLT_02A';

-- 回滾（僅在需要恢復該計分項時手工執行；同時必須撤掉前端 RETIRED_ORGANIC_RULE_IDS 裡的 'PLT_02A'，
-- 並把模板行加回 DEFAULT_ORGANIC_SCORE_RULES，否則庫內行雖未刪除仍會被讀取側過濾掉）：
--   UPDATE `biz_organic_score_rule` SET `deleted` = 0, `updated_by` = 'system'
--   WHERE `rule_code` = 'PLT_02A' AND `deleted` = 1;
-- 若要让下次启动重新执行本迁移，需删除 sys_schema_migration_log 裡的 organic:retire-plt02a-v1 版本行。
