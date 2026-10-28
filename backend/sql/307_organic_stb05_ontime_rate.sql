-- 307: 出餐計分項（STB_05）改為「出餐準時率」梯度計分
-- ---------------------------------------------------------------------------
-- 舊口徑「當天出餐時間 > 過去 N 天均值即扣分」作廢：均值基線下只要比均值慢一點就掉分，
-- 業務口徑改為按準時率檔位給分（率越高分越多，命中一檔即停、不累加，低於最低檔不得分）。
-- 舊檔位（over_avg_deduction / 主輔營達標）沒有需要保留的歷史數據，直接覆寫 condition_items
-- 等同刪除舊檔位；名稱與說明同步為新口徑，前端按 DEFAULT_ONTIME_RATE_BANDS 展示。
-- 幂等性由 Java 遷移 organic:stb05-ontime-rate-v1 保證，本文件僅作參考文檔。
-- ---------------------------------------------------------------------------
UPDATE `biz_organic_score_rule`
SET `name` = '出餐準時率',
    `description` = '統計過去N天（不含當天）出餐準時率，按準時率梯度計分：按率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分',
    `condition_items` = '[{"condition":"ontime_rate","rate":100,"score":60},{"condition":"ontime_rate","rate":95,"score":50},{"condition":"ontime_rate","rate":90,"score":40},{"condition":"ontime_rate","rate":80,"score":25},{"condition":"ontime_rate","rate":70,"score":10}]',
    `stat_days_total` = COALESCE(`stat_days_total`, 7),
    `updated_by` = 'system'
WHERE `rule_code` = 'STB_05' AND `deleted` = 0;
