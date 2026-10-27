-- 187: 减免运费(COM_02)评分项增加前置条件：报名减免运费；计分方式限定为固定加分
UPDATE biz_organic_score_rule
SET prerequisites = '報名減免運費',
    mode = 1,
    updated_by = 'system'
WHERE rule_code = 'COM_02';
