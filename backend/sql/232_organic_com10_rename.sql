-- 232: 自然流量計分項 COM_10 更名為「金字招牌(廣告)」
-- 背景：原內置名稱「購買廣告-金字招牌」與同維度券類計分項的命名口徑不一致，統一為「金字招牌(廣告)」。
-- 執行方式：本文件僅為參考文檔。實際收斂由 OrganicScoreDataInitializer 的
--          organic:com10-rename-v1 一次性遷移（參數化 UPDATE + 舊值殘留後置校驗）在各環境啟動時自動執行，
--          禁止手動改庫；23_organic_score.sql 屬歷史種子腳本不得修改，舊名稱由本遷移覆蓋。
-- 安全邊界：以舊值本身作條件，管理員在界面上自定義過名稱的行不會被覆蓋。
UPDATE biz_organic_score_rule
SET name = '金字招牌(廣告)',
    updated_by = 'system'
WHERE rule_code = 'COM_10'
  AND name = '購買廣告-金字招牌';
