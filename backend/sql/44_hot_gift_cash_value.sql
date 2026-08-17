-- 人气商家定价配置：新增赠送天数每日现金价值字段
-- 用于定义每个赠送天等价多少金额（MOP），购买页据此计算赠送天数抵扣额和补差价
-- 幂等脚本：列已存在时跳过

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'biz_ad_pricing_hot' 
    AND COLUMN_NAME = 'gift_cash_value');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE biz_ad_pricing_hot ADD COLUMN gift_cash_value INT DEFAULT NULL COMMENT ''赠送天数每日现金价值（MOP），NULL或0表示未配置''',
    'SELECT ''Column gift_cash_value already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
