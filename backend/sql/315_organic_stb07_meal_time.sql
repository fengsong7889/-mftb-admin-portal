-- 315: 店鋪維度計分項（STB_07）由「出餐超時 · 每超時一單按次扣分」改為「出餐時長 · 固定加分（開啟自動校正）」
-- ---------------------------------------------------------------------------
-- 業務口徑翻轉：原規則處罰商家超時出餐（每超時一單扣 deduction_per_order 分，統計天數不含當天），
-- 現改為按出餐時長給一次性固定加分，配置項只剩兩個：「開啟自動校正」開關 + 「固定加分」分值。
-- 因此 mode（3=規則減分 → 1=規則加分）、score、name、description 必須一起收斂，
-- 只改前端保底會讓看庫/對賬口徑與界面長期不一致（與 STB_06 自動接單同构）。
-- 「開啟自動校正」不新增列，沿用既有 prerequisites 列（與 COM_02 減免運費「報名即給分」同先例）：
--   非空 = 開啟，空 = 關閉；播種值 '開啟自動校正' 必須與前端 MEAL_TIME_AUTO_CORRECT_PREREQUISITE 一致，
--   否則遷移寫入的行在界面會被讀成「未開啟」。不新增列因此無需遞增 LegacyCoreContracts 契約與契約測試。
-- 舊口徑沒有需要保留的歷史數據，因此不做兼容轉換：
--   score 只在未配置（=0 或 NULL，舊界面把分值放在 deduction_per_order 而從未寫 score）時補默認 50，不頂管理員已調的分值；
--   舊口徑專用列 stat_days / deduction_per_order 置 NULL：留著會被讀成「本項還在按 N 天統計、每單扣分」。
-- 冪等性與後置校驗由 Java 遷移 organic:stb07-meal-time-v1 保證（name/description 以舊內置值作條件，自定義文案不頂），
-- 本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `name` = '出餐時長',
    `description` = '開啟自動校正後按出餐時長計分，命中即得固定加分，不累加',
    `mode` = 1,
    `score` = COALESCE(NULLIF(`score`, 0), 50),
    `prerequisites` = COALESCE(NULLIF(`prerequisites`, ''), '開啟自動校正'),
    `stat_days` = NULL,
    `deduction_per_order` = NULL,
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_07' AND `deleted` = 0
  AND (`name` = '出餐超時' OR `description` = '統計天數內（不含當天），每超時一單固定扣分，即時生效' OR `mode` <> 1);

-- 名稱、說明、方式、分值與開關也可分別單獨收斂（只改仍是舊內置值/舊方式的行）：
--   UPDATE `biz_organic_score_rule` SET `name` = '出餐時長', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND `name` = '出餐超時';
--   UPDATE `biz_organic_score_rule` SET `description` = '開啟自動校正後按出餐時長計分，命中即得固定加分，不累加', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND `description` = '統計天數內（不含當天），每超時一單固定扣分，即時生效';
--   UPDATE `biz_organic_score_rule` SET `mode` = 1, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND `mode` <> 1;
--   UPDATE `biz_organic_score_rule` SET `score` = 50, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND COALESCE(`score`, 0) <= 0;
--   UPDATE `biz_organic_score_rule` SET `prerequisites` = '開啟自動校正', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND (`prerequisites` IS NULL OR `prerequisites` = '');
--   UPDATE `biz_organic_score_rule` SET `stat_days` = NULL, `deduction_per_order` = NULL, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0 AND (`stat_days` IS NOT NULL OR `deduction_per_order` IS NOT NULL);

-- 回滾（僅在需要恢復舊口徑時手工執行；舊值取自歷史種子 23_organic_score.sql）：
--   UPDATE `biz_organic_score_rule`
--   SET `name` = '出餐超時',
--       `description` = '統計天數內（不含當天），每超時一單固定扣分，即時生效',
--       `mode` = 3, `score` = 0, `prerequisites` = NULL, `stat_days` = 7, `deduction_per_order` = 70, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_07' AND `deleted` = 0;
-- 回滾後必須同時刪除 sys_schema_migration_log 裡的 organic:stb07-meal-time-v1 版本行，
-- 否則下次啟動不再重跑該遷移（前端加載保底仍會把界面顯示成出餐時長固定加分口徑）。
