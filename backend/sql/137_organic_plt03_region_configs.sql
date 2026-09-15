-- PLT_03 商家扶持升级：新增区域维度配置
-- 新增 region_configs 列存储各区域的前提条件、统计天数、梯度配置 JSON
-- blocked_merchants 保持全局唯一，不受区域限制

-- 1. 新增 region_configs 列
ALTER TABLE biz_organic_score_rule
    ADD COLUMN `region_configs` TEXT DEFAULT NULL COMMENT '区域扶持配置 JSON（仅 PLT_03 使用，按区域独立配置前提条件、统计天数、梯度）'
    AFTER `threshold_score`;

-- 2. 迁移 PLT_03 现有数据到区域配置格式（澳门 + 氹仔，各继承原配置）
UPDATE biz_organic_score_rule
SET region_configs = JSON_OBJECT(
    'MACAU', JSON_OBJECT(
        'prerequisites', IFNULL(prerequisites, 'UNCONDITIONAL'),
        'statDays', IFNULL(stat_days, 30),
        'tiers', IFNULL(JSON_EXTRACT(tiers, '$'), JSON_ARRAY(JSON_OBJECT('threshold', 50, 'direction', 'LESS_THAN', 'score', 20)))
    ),
    'TAIPA', JSON_OBJECT(
        'prerequisites', IFNULL(prerequisites, 'UNCONDITIONAL'),
        'statDays', IFNULL(stat_days, 30),
        'tiers', IFNULL(JSON_EXTRACT(tiers, '$'), JSON_ARRAY(JSON_OBJECT('threshold', 50, 'direction', 'LESS_THAN', 'score', 20)))
    )
),
    description = '按區域配置商家扶持：每個區域獨立設置前提條件、統計天數與梯度加分，屏蔽商家全局統一',
    updated_by = 'system'
WHERE rule_code = 'PLT_03';
