-- ============================================================
-- 自然流量评分规则：旧数据清理 + 字段更新
-- 幂等可重复执行：每次后端启动时运行
-- 注意：新增列由 OrganicScoreDataInitializer.java 负责添加
-- ============================================================

-- -------------------------------------------------------
-- 清理旧格式规则（旧种子数据编码）
-- 删除后由 23_organic_score.sql INSERT IGNORE 重新插入新格式
-- -------------------------------------------------------

-- 旧店铺维度编码（STB_02=金牌旧, STB_03=营业状态旧, STB_04=好评旧, STB_05~STB_12=旧规则）
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` IN (
  'STB_02', 'STB_03', 'STB_04', 'STB_05', 'STB_06', 'STB_07', 'STB_08', 'STB_09', 'STB_10', 'STB_11', 'STB_12'
);

-- 旧平台维度编码（PLT_02~06=旧分时段配送范围）
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` IN (
  'PLT_02', 'PLT_03', 'PLT_04', 'PLT_05', 'PLT_06'
);

-- 旧商业维度编码（COM_08=已废弃, COM_11=已永久删除）
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` IN ('COM_08', 'COM_11');

-- 清理可能的临时编码残留
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` LIKE 'STB_TMP_%' OR `rule_code` LIKE 'PLT_TMP_%';

-- 清理可能的 STO_02A/STO_02B 残留（已合并为 STO_02）
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` IN ('STO_02A', 'STO_02B');

-- -------------------------------------------------------
-- 更新已有规则的字段（幂等）
-- -------------------------------------------------------

-- PLT_01 描述更新 + 衰减系数
UPDATE `biz_organic_score_rule`
SET `description` = '滿分按衰減係數×距離遞減，距離越遠得分越低',
    `decay_coefficient` = 5.0000
WHERE `rule_code` = 'PLT_01' AND (`description` LIKE '%e^(-k%' OR `decay_coefficient` IS NULL);

-- STB_01 名称修正
UPDATE `biz_organic_score_rule` SET `name` = '主營時段加分' WHERE `rule_code` = 'STB_01' AND `name` = '主營時段';
