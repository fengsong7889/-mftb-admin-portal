-- ============================================================
-- 规则编码规范化：STO_ → STB_/PLT_ 前缀重命名
-- 店铺维度(2): STO_01→STB_02, STO_02→STB_03, STO_04→STB_05, STO_05→STB_06, STO_07→STB_07, STO_08→STB_08, STO_09→STB_09
-- 平台维度(4): STO_03→PLT_03, STO_03B→PLT_04
-- ============================================================

-- Step 1: 临时重命名（避免冲突）
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_01' WHERE `rule_code` = 'STO_01';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_02' WHERE `rule_code` = 'STO_02';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_04' WHERE `rule_code` = 'STO_04';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_05' WHERE `rule_code` = 'STO_05';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_07' WHERE `rule_code` = 'STO_07';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_08' WHERE `rule_code` = 'STO_08';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_STO_09' WHERE `rule_code` = 'STO_09';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_PLT_03' WHERE `rule_code` = 'STO_03';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'TMP_PLT_04' WHERE `rule_code` = 'STO_03B';

-- Step 2: 正式重命名为目标编码
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_02' WHERE `rule_code` = 'TMP_STO_01';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_03' WHERE `rule_code` = 'TMP_STO_02';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_05' WHERE `rule_code` = 'TMP_STO_04';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_06' WHERE `rule_code` = 'TMP_STO_05';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_07' WHERE `rule_code` = 'TMP_STO_07';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_08' WHERE `rule_code` = 'TMP_STO_08';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_09' WHERE `rule_code` = 'TMP_STO_09';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'PLT_03' WHERE `rule_code` = 'TMP_PLT_03';
UPDATE `biz_organic_score_rule` SET `rule_code` = 'PLT_04' WHERE `rule_code` = 'TMP_PLT_04';
