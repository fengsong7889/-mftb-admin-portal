-- 313: 店鋪維度計分項（STB_08）由「取消訂單 · 每取消一單按次扣分」改為「訂單取消率 · 梯度加分」
-- ---------------------------------------------------------------------------
-- 計分主體翻轉：從「每取消一單扣 deduction_per_order 分」改為「取消率 ≤ 上界即得該檔固定加分」，
-- 因此 mode（3=規則減分 → 6=條件計分）、name、description、condition_items 必須一起收斂，
-- 只改前端保底會讓看庫/對賬口徑與界面長期不一致。
-- 新口徑三要素全部住在 condition_items：
--   檔位  {"condition":"cancel_rate_max","rate":取消率上界(%),"score":固定加分}（上界升序即匹配順序）
--   門檻  {"condition":"cancel_min_orders","minOrders":納入計算的最低單量,"score":0}（固定放末位）
-- 與前端 DEFAULT_CANCEL_RATE_BANDS（1%→30、3%→20、5%→10）和 DEFAULT_CANCEL_MIN_ORDERS（30）一致。
-- stat_days 保留（新口徑仍按統計天數取數），只在 NULL 時補默認 30，不頂管理員已調的值；
-- 舊口徑專用列 deduction_per_order 置 NULL，留著會被讀成「本項還在按次扣分」。
-- 業務取數口徑「只統計外賣單，自取單不納入；用戶取消與商家取消均計入取消率」寫進評分說明與界面備注，
-- 本倉庫無計分代碼，判定在召回側/業務系統，尚未落地。
-- 冪等性與後置校驗由 Java 遷移 organic:stb08-cancel-rate-v1 保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `name` = '訂單取消率',
    `description` = '統計期內外賣單的取消率（自取單不納入，用戶取消與商家取消均計入），單量達門檻才納入，按取消率梯度加分：取消率越低加分越多，命中一檔即停、不累加，高於最高檔不加分',
    `mode` = 6,
    `stat_days` = COALESCE(`stat_days`, 30),
    `deduction_per_order` = NULL,
    `condition_items` = '[{"condition":"cancel_rate_max","rate":1,"score":30},{"condition":"cancel_rate_max","rate":3,"score":20},{"condition":"cancel_rate_max","rate":5,"score":10},{"condition":"cancel_min_orders","minOrders":30,"score":0}]',
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_08' AND `deleted` = 0
  AND (`condition_items` IS NULL OR `condition_items` = 'null' OR `condition_items` NOT LIKE '%cancel_rate_max%');

-- 名稱、說明與計分方式單獨收斂（只改仍是舊內置值/舊方式的行）：
--   UPDATE `biz_organic_score_rule` SET `name` = '訂單取消率', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_08' AND `deleted` = 0 AND `name` = '取消訂單';
--   UPDATE `biz_organic_score_rule` SET `description` = '統計期內外賣單的取消率（自取單不納入，用戶取消與商家取消均計入），單量達門檻才納入，按取消率梯度加分：取消率越低加分越多，命中一檔即停、不累加，高於最高檔不加分', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_08' AND `deleted` = 0 AND `description` = '統計天數內（含當天），每取消一單固定扣分，即時生效';
--   UPDATE `biz_organic_score_rule` SET `mode` = 6, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_08' AND `deleted` = 0 AND `mode` <> 6;

-- 回滾（僅在需要恢復舊口徑時手工執行；舊值取自歷史種子 23_organic_score.sql）：
--   UPDATE `biz_organic_score_rule`
--   SET `name` = '取消訂單',
--       `description` = '統計天數內（含當天），每取消一單固定扣分，即時生效',
--       `mode` = 3, `score` = 0, `stat_days` = 7, `deduction_per_order` = 80, `condition_items` = NULL, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_08' AND `deleted` = 0;
-- 回滾後必須同時刪除 sys_schema_migration_log 裡的 organic:stb08-cancel-rate-v1 版本行，
-- 否則下次啟動不再重跑該遷移（前端加載保底仍會把界面顯示成取消率梯度口徑）。
