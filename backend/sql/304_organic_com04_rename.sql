-- 304: 自然流量计分项 COM_04 更名为「門店新客券」
--
-- 背景：产品口径调整，原「新客立減」统一更名为「門店新客券」；
--       历史种子脚本 23_organic_score.sql 不得修改，已跑过种子的环境也不会重读，
--       因此单独登记版本键做一次性收敛。
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际执行由 OrganicScoreDataInitializer 的
--          organic:com04-rename-v1 迁移负责（参数化 UPDATE + 旧值残留后置校验），
--          并已登记 catalog.json；禁止手动改库。
--
-- 安全边界：以旧值本身作条件，管理员在界面上自定义过的名称/说明不会被覆盖；
--          只命中 rule_code = 'COM_04' 的行。
UPDATE `biz_organic_score_rule`
SET `name` = '門店新客券',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_04'
  AND `name` = '新客立減';

UPDATE `biz_organic_score_rule`
SET `description` = '商家參與門店新客券活動加分',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_04'
  AND `description` = '商家參與新客立減活動加分';

-- 后置校验：旧名称/旧内置说明残留必须为 0
SELECT COUNT(*) AS legacy_remains
FROM `biz_organic_score_rule`
WHERE `rule_code` = 'COM_04'
  AND (`name` = '新客立減' OR `description` = '商家參與新客立減活動加分');
