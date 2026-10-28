-- 305: 自然流量计分项 COM_06 / COM_07 更名
--
-- 背景：产品口径调整：
--       COM_06「會員紅包」→「平台會員紅包」
--       COM_07「閃蜂官方神券」→「平台官方神券」
--       历史种子脚本 23_organic_score.sql 不得修改，已跑过种子的环境也不会重读，
--       因此单独登记版本键做一次性收敛；前端加载保底已同步新名称。
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际执行由 OrganicScoreDataInitializer 的
--          organic:com06-com07-rename-v1 迁移负责（参数化 UPDATE + 旧值残留后置校验），
--          并已登记 catalog.json；禁止手动改库。
--
-- 安全边界：名称同时兼容历史种子的「-按金額」后缀与早期界面显示的不带后缀名称；
--          以旧值本身作条件，管理员自定义过的名称/说明不会被覆盖。
UPDATE `biz_organic_score_rule`
SET `name` = '平台會員紅包',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_06'
  AND `name` IN ('會員紅包-按金額', '會員紅包');

UPDATE `biz_organic_score_rule`
SET `description` = '商家設置平台會員紅包加分',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_06'
  AND `description` = '商家設置會員紅包加分';

UPDATE `biz_organic_score_rule`
SET `name` = '平台官方神券',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_07'
  AND `name` IN ('閃蜂官方神券-按金額', '閃蜂官方神券');

UPDATE `biz_organic_score_rule`
SET `description` = '商家設置平台官方神券加分',
    `updated_by` = 'system'
WHERE `rule_code` = 'COM_07'
  AND `description` = '商家設置閃蜂官方神券加分';

-- 后置校验：COM_06/COM_07 的旧名称与旧内置说明残留必须为 0
SELECT COUNT(*) AS legacy_remains
FROM `biz_organic_score_rule`
WHERE (`rule_code` = 'COM_06' AND (`name` IN ('會員紅包-按金額', '會員紅包') OR `description` = '商家設置會員紅包加分'))
   OR (`rule_code` = 'COM_07' AND (`name` IN ('閃蜂官方神券-按金額', '閃蜂官方神券') OR `description` = '商家設置閃蜂官方神券加分'));
