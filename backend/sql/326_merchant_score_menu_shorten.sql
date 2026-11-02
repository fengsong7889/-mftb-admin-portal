# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 326: 「商家權重分排名」菜单更名为「商家權重分」
-- ---------------------------------------------------------------------------
-- 背景：菜单名带「排名」是页面形态后缀（本页就是一张排名列表），与同组的
--       「瀑布流推演 / 算法推演 / 商家推廣診斷」口径不一致且偏长，产品决定只保留实体名「商家權重分」。
--       菜单名真值在 sys_menu.name，seedSystemMenus 只新增不覆盖存量名称，故存量库必须靠一次性迁移收敛。
--
-- 命名链：商家評分透視 →（sql/321, ads:merchant-score-menu-rename-v1）→ 商家權重分排名
--         →（本文件, ads:merchant-score-menu-rename-v2）→ 商家權重分
--         321 已记成功不会重跑，所以改名必须用新的 versionKey，不能回改历史脚本。
--
-- 守卫：UPDATE 带旧名称条件，运营在「菜单配置」里自定义过的名称不命中、不会被顶掉；
--       命中 0 行属正常幂等（已收敛或已被改名）。
-- 幂等：条件带旧名称，重复执行命中 0 行。
-- ---------------------------------------------------------------------------

UPDATE `sys_menu`
SET `name` = '商家權重分'
WHERE `menu_key` = 'merchant-score-insight'
  AND `name` = '商家權重分排名';

UPDATE `sys_menu`
SET `name_en` = 'Merchant Weighted Score'
WHERE `menu_key` = 'merchant-score-insight'
  AND (`name_en` IS NULL OR `name_en` = 'Merchant Weighted Score Ranking');

-- 后置确认：菜单名应为「商家權重分」，且不再出现旧名
SELECT `menu_key`, `name`, `name_en`, `parent_id`, `sort_order`
FROM `sys_menu`
WHERE `menu_key` = 'merchant-score-insight' AND `deleted` = 0;

-- 回滚（代码回滚不会撤销已记账迁移，需手工执行；同时把 DataInitializer 的种子名称改回）：
--   UPDATE `sys_menu` SET `name` = '商家權重分排名', `name_en` = 'Merchant Weighted Score Ranking'
--   WHERE `menu_key` = 'merchant-score-insight';
-- 并删除记账行 sys_schema_version / sys_schema_migration_log 中的 ads:merchant-score-menu-rename-v2
-- （仅限本机开发库；生产禁止删记账行）。
