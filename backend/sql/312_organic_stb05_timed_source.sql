-- 312: 店鋪維度計分項（STB_05）出餐準時率的統計窗口交給業務系統定時任務
-- ---------------------------------------------------------------------------
-- 業務明確：出餐準時率由業務系統定時任務算好後傳遞，不是實時傳數，也不由本頁決定統計幾天。
-- 界面保留「統計天數」輸入框會讓運營誤以為改這裡就能改窗口，因此該配置項已從界面移除，
-- 庫裡對應的 stat_days_total（organic:stb05-ontime-rate-v1 曾補默認 7）與歷史殘留的
-- stat_days_recent 一律置 NULL，避免看庫時誤讀為「本項還在按 N 天統計」。
-- 評分說明同步為定時任務口徑：只在兩個已知內置值上收斂（種子原文與上一次遷移寫回的文案），
-- 管理員自定義過的說明不命中舊值、不會被頂掉。
-- 檔位（condition='ontime_rate' + rate + score）本步不改，仍沿用 organic:stb05-ontime-rate-v1 的梯度。
-- 冪等性與後置校驗由 Java 遷移 organic:stb05-timed-source-v1 保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `description` = '出餐準時率由業務系統定時任務計算後傳遞（非實時傳數），本項只配置檔位與分值：按準時率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分',
    `stat_days_total` = NULL,
    `stat_days_recent` = NULL,
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_05' AND `deleted` = 0;

-- 說明單獨收斂（只改仍是舊內置值的行）：
--   UPDATE `biz_organic_score_rule` SET `description` = '出餐準時率由業務系統定時任務計算後傳遞（非實時傳數），本項只配置檔位與分值：按準時率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_05' AND `deleted` = 0
--     AND `description` IN ('統計過去N天（不含當天）出餐均值，當天出餐時間超過均值即扣分',
--                           '統計過去N天（不含當天）出餐準時率，按準時率梯度計分：按率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分');

-- 回滾（僅在需要恢復「本頁可配統計窗口」口徑時手工執行）：
--   UPDATE `biz_organic_score_rule`
--   SET `description` = '統計過去N天（不含當天）出餐準時率，按準時率梯度計分：按率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分',
--       `stat_days_total` = 7, `stat_days_recent` = NULL, `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_05' AND `deleted` = 0;
-- 回滾後必須同時刪除 sys_schema_migration_log 裡的 organic:stb05-timed-source-v1 版本行，
-- 否則下次啟動不再重跑該遷移（界面已無統計天數輸入框，改也無處可改）。
