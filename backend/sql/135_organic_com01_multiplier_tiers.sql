-- 满额立减规则(COM_01)升级为倍数梯度计分模式
-- 新增 multiplier_tiers 字段存储倍数梯度配置 JSON

-- 1. 新增 multiplier_tiers 列
ALTER TABLE biz_organic_score_rule
    ADD COLUMN `multiplier_tiers` TEXT DEFAULT NULL COMMENT '倍数梯度计分配置 JSON（[{multiplier, score}]，以门店客单价为基准）'
    AFTER `activity_items`;

-- 2. 更新 COM_01 满额立减规则为倍数梯度计分模式(mode=7)
UPDATE biz_organic_score_rule
SET mode = 7,
    score = 0,
    description = '商家參與滿額立減活動加分，以門店客單價為基準按倍數梯度計分：門檻越低得分越高',
    multiplier_tiers = '[{"multiplier":1,"score":30},{"multiplier":2,"score":20},{"multiplier":3,"score":10}]',
    updated_by = 'system'
WHERE rule_code = 'COM_01';
