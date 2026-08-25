-- 55_payment_mode_config.sql
-- 廣告購買頁「訂單結算」支付方式配置（按廣告類型獨立）
-- 值域：promo_only=僅推廣金 / gift_only=僅贈送天數 / mixed=混合支付 / switchable=可切換
-- 規則配置頁面保存時通過 /api/sys-config/{key} 同步寫入此表，前端購買頁從後端讀取

INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
('payment_mode_revival',          'mixed', '盤活復蘇訂單結算支付方式（promo_only/gift_only/mixed/switchable）'),
('payment_mode_popular_merchant', 'mixed', '人氣商家訂單結算支付方式（promo_only/gift_only/mixed/switchable）'),
('payment_mode_golden_signboard', 'mixed', '金字招牌訂單結算支付方式（promo_only/gift_only/mixed/switchable）');
