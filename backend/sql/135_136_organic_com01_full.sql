-- 满额立减规则(COM_01)完整升级：倍数梯度计分 + 门槛≤客单价直接给分
-- 合并 135（倍数梯度）+ 136（门槛≤客单价加分）

-- 1. 新增 multiplier_tiers 列（倍数梯度配置 JSON）
ALTER TABLE biz_organic_score_rule
    ADD COLUMN `multiplier_tiers` TEXT DEFAULT NULL COMMENT '倍数梯度计分配置 JSON（[{multiplier, score}]，以门店客单价为基准）'
    AFTER `activity_items`;

-- 2. 新增 threshold_score 列（门槛≤客单价时固定加分）
ALTER TABLE biz_organic_score_rule
    ADD COLUMN `threshold_score` INT DEFAULT NULL COMMENT '门槛≤客单价时固定加分（仅 COM_01 使用）'
    AFTER `multiplier_tiers`;

-- 3. 更新 COM_01 满额立减规则：升级为倍数梯度计分模式 + 补默认阈值加分
UPDATE biz_organic_score_rule
SET mode = 7,
    score = 0,
    threshold_score = 10,
    description = '商家參與滿額立減活動加分：門檻≤客單價直接給分，再以門店客單價為基準按倍數梯度計分（門檻越低得分越高）',
    multiplier_tiers = '[{"multiplier":1,"score":30},{"multiplier":2,"score":20},{"multiplier":3,"score":10}]',
    updated_by = 'system'
WHERE rule_code = 'COM_01';
