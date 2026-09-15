-- 满额立减规则(COM_01)增加门槛≤客单价直接给分配置
-- 业务：① 门槛≤客单价 → 固定加分；② 门槛 < 客单价 × 倍数 → 按档加分
-- 新增 threshold_score 字段（135 脚本已含倍数梯度部分）

-- 1. 新增 threshold_score（门槛≤客单价时固定加分）列
ALTER TABLE biz_organic_score_rule
    ADD COLUMN `threshold_score` INT DEFAULT NULL COMMENT '门槛≤客单价时固定加分（仅 COM_01 使用）'
    AFTER `multiplier_tiers`;

-- 2. 更新 COM_01 满额立减规则：补默认加分配置与最新计分说明
UPDATE biz_organic_score_rule
SET threshold_score = 10,
    description = '商家參與滿額立減活動加分：門檻≤客單價直接給分，再以門店客單價為基準按倍數梯度計分（門檻越低得分越高）',
    updated_by = 'system'
WHERE rule_code = 'COM_01';
