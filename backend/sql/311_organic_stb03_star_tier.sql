-- 311: 店鋪維度計分項（STB_03）由「評價得分 · 逐檔星級固定/動態加減分」改為「店鋪綜合分 · 星級梯度加分」
-- ---------------------------------------------------------------------------
-- 業務改口徑：分數不再由本頁逐檔配置加減分，而是業務系統實時傳入一個「店鋪綜合分」，
-- 本頁只配「綜合分 ≥ 下界 → 固定加分」的梯度（1 星 = 1 分，支持半星 0.5 分）。
-- 舊口徑是「星級恰好等於 N 星」的一檔一價，新口徑是「≥ 下界」的梯度查檔，兩者無法逐檔映射：
-- 把舊的 4 星檔分當「≥4」寫回，會連 4.5 星也按 4 星給分，屬於靜默改變計分行為，因此不做兼容轉換。
-- condition_items 換成默認梯度：condition='star_tier' + star（分數下界）+ score（固定加分），
-- 順序即匹配順序（从高到低，命中一檔即停、分數不累加，低於最低檔不加分），與前端 DEFAULT_STAR_TIER_BANDS 一致。
-- stat_days 置 NULL：本項不再統計期間，留著會被讀成「仍按 N 天滾動統計」。
-- name/description 以舊內置值（= 歷史種子 23_organic_score.sql）作條件，管理員自定義過的文案不覆蓋；
-- condition_items 只覆寫仍不是 star_tier 口徑的行，界面已配成新梯度的原封不動。
-- 冪等性與後置校驗由 Java 遷移 organic:stb03-star-tier-v1 保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `name` = '店鋪綜合分',
    `description` = '店鋪綜合分由業務系統實時傳遞，以最新傳入值比對梯度檔位固定加分：分數越高加分越多，命中一檔即停、分數不累加，低於最低檔不加分',
    `mode` = 6,
    `stat_days` = NULL,
    `condition_items` = '[{"condition":"star_tier","star":5,"score":50},{"condition":"star_tier","star":4.5,"score":40},{"condition":"star_tier","star":4,"score":30},{"condition":"star_tier","star":3.5,"score":15},{"condition":"star_tier","star":3,"score":5}]',
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_03' AND `deleted` = 0
  AND (`condition_items` IS NULL OR `condition_items` = 'null' OR `condition_items` NOT LIKE '%star_tier%');

-- 名稱與說明單獨收斂（只改仍是舊內置值的行，避免頂掉管理員自定義文案）：
--   UPDATE `biz_organic_score_rule` SET `name` = '店鋪綜合分', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_03' AND `deleted` = 0 AND `name` = '評價得分';
--   UPDATE `biz_organic_score_rule` SET `description` = '店鋪綜合分由業務系統實時傳遞，以最新傳入值比對梯度檔位固定加分：分數越高加分越多，命中一檔即停、分數不累加，低於最低檔不加分', `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_03' AND `deleted` = 0 AND `description` = '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率';

-- 回滾（僅在需要恢復舊口徑時手工執行；舊值取自歷史種子 23_organic_score.sql）：
--   UPDATE `biz_organic_score_rule`
--   SET `name` = '評價得分',
--       `description` = '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率',
--       `mode` = 6, `stat_days` = 30,
--       `condition_items` = '[{"condition":"fixed_bonus","score":50},{"condition":"fixed_bonus","score":20},{"condition":"fixed_bonus","score":0},{"condition":"fixed_deduction","score":20},{"condition":"fixed_deduction","score":50}]',
--       `updated_by` = 'system'
--   WHERE `rule_code` = 'STB_03' AND `deleted` = 0;
-- 回滾後必須同時刪除 sys_schema_migration_log 裡的 organic:stb03-star-tier-v1 版本行，
-- 否則下次啟動不再重跑該遷移（前端加載保底仍會把界面顯示成店鋪綜合分梯度口徑）。
