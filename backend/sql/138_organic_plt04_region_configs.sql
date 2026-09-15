-- PLT_04 订单过热调控升级：新增区域维度配置
-- 复用 region_configs 列存储各区域的校验间隔、梯度配置 JSON
-- 与 PLT_03 商家扶持共享同一列，按 rule_code 区分

-- 1. 更新列注释（反映 PLT_03 + PLT_04 共用）
ALTER TABLE biz_organic_score_rule
    MODIFY COLUMN `region_configs` TEXT DEFAULT NULL COMMENT '区域配置 JSON（PLT_03 商家扶持 / PLT_04 订单过热调控，按区域独立配置）';

-- 2. 迁移 PLT_04 现有数据到区域配置格式（澳门 + 氹仔，各继承原配置）
UPDATE biz_organic_score_rule
SET region_configs = JSON_OBJECT(
    'MACAU', JSON_OBJECT(
        'calcIntervalHours', IFNULL(calc_interval_hours, 1),
        'tiers', IFNULL(JSON_EXTRACT(tiers, '$'), JSON_ARRAY(
            JSON_OBJECT('threshold', 200, 'direction', 'MORE_THAN', 'score', -10),
            JSON_OBJECT('threshold', 500, 'direction', 'MORE_THAN', 'score', -30),
            JSON_OBJECT('threshold', 1000, 'direction', 'MORE_THAN', 'score', -60)
        ))
    ),
    'TAIPA', JSON_OBJECT(
        'calcIntervalHours', IFNULL(calc_interval_hours, 1),
        'tiers', IFNULL(JSON_EXTRACT(tiers, '$'), JSON_ARRAY(
            JSON_OBJECT('threshold', 200, 'direction', 'MORE_THAN', 'score', -10),
            JSON_OBJECT('threshold', 500, 'direction', 'MORE_THAN', 'score', -30),
            JSON_OBJECT('threshold', 1000, 'direction', 'MORE_THAN', 'score', -60)
        ))
    )
),
    description = '按區域配置訂單過熱調控：每個區域獨立設置校驗間隔與梯度降權，平衡流量分配給其他商家機會',
    updated_by = 'system'
WHERE rule_code = 'PLT_04';
