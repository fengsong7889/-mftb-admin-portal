-- ============================================================
-- 50: 合并迁移 - STO_03 商家扶持 + STO_03B 订单过热调控 → 平台维度
-- 说明：确保两条规则都迁移到平台维度
-- ============================================================

-- 先查看当前状态（执行后可对比）
SELECT rule_code, dimension, name FROM biz_organic_score_rule 
WHERE rule_code IN ('STO_03', 'STO_03B') AND deleted = 0;

-- STO_03: 商家扶持 → 平台维度
UPDATE `biz_organic_score_rule`
SET `name` = '商家扶持',
    `dimension` = 4,
    `updated_at` = NOW()
WHERE `rule_code` = 'STO_03'
  AND `deleted` = 0;

-- STO_03B: 订单过热调控 → 平台维度
UPDATE `biz_organic_score_rule`
SET `name` = '訂單過熱調控',
    `dimension` = 4,
    `description` = '按當天計算，商家訂單過熱時按梯度降權，平衡流量分配給其他商家機會',
    `updated_at` = NOW()
WHERE `rule_code` = 'STO_03B'
  AND `deleted` = 0;

-- 验证结果
SELECT rule_code, dimension, name FROM biz_organic_score_rule 
WHERE rule_code IN ('STO_03', 'STO_03B') AND deleted = 0;
