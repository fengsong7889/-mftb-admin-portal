-- 310: 接單計分項（STB_06）由「拒絕接單 · 按次計罰扣分」改為「自動接單 · 固定加分」
-- ---------------------------------------------------------------------------
-- 業務口徑翻轉：原規則處罰商家拒單（每拒一單扣 deduction_per_order 分，統計天數含當天），
-- 現改為獎勵商家在店端開啟自動接單 —— 開啟即得一次性固定加分，未開啟不加分。
-- 因此 mode（3=規則減分 → 1=規則加分）、score、name、description 必須一起收斂，
-- 只改前端保底會讓看庫/對賬口徑與界面長期不一致。
-- 舊口徑沒有需要保留的歷史數據，因此不做兼容轉換；score 只在未配置（=0，舊界面從未寫 score）
-- 時補默認 50 分，避免頂掉管理員已在界面調過的分值。
-- 舊口徑專用列 stat_days / deduction_per_order 置 NULL：留著會被讀成「本項還在按次扣分」。
-- 幂等性與後置校驗由 Java 遷移 organic:stb06-auto-accept-v1 保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `name` = '自動接單',
    `description` = '商家在店端開啟自動接單即得固定加分，未開啟不加分；不再按拒絕單量計罰',
    `mode` = 1,
    `score` = COALESCE(NULLIF(`score`, 0), 50),
    `stat_days` = NULL,
    `deduction_per_order` = NULL,
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_06' AND `deleted` = 0;

-- 回滾（僅在需要恢復舊口徑時手工執行；舊值取自歷史種子 23_organic_score.sql）：
--   UPDATE `biz_organic_score_rule`
--   SET `name` = '拒絕接單',
--       `description` = '統計天數內（含當天），每拒絕一單固定扣分，即時生效',
--       `mode` = 3, `score` = 0, `stat_days` = 7, `deduction_per_order` = 80, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_06' AND `deleted` = 0;
-- 回滾後必須同時把 sys_schema_migration_log 裡的 organic:stb06-auto-accept-v1 版本行刪除，
-- 否則下次啟動不再重跑該遷移（前端加載保底仍會把界面顯示成自動接單口徑）。
