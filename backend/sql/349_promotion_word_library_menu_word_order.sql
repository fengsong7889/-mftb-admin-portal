# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 349: 「算法推薦詞庫」菜单更名为「推薦算法詞庫」
-- ---------------------------------------------------------------------------
-- 背景：345 已完成「詞庫管理」→「算法推薦詞庫」的更名，本次产品统一菜单名词序，
--       定版为「推薦算法詞庫」（简体：推荐算法词库）。menu_key 仍为 promotion-word-library，
--       路由、权限矩阵、父子层级与排序均不变。
--
-- 记账：DataInitializer 的 versionTracker.applyOnce("ads:promotion-word-library-menu-rename-v2",
--       task, verify)；新库由种子直接写定版名称，存量库由启动期迁移收敛。
--
-- 守卫：UPDATE 带上一版默认名作条件，运营在「菜单配置」里自定义过的名称不命中；
--       name_en 额外接管 NULL/空串与上一版默认英文名。命中 0 行属正常幂等。
--
-- 界面真值：sys_translation 的 menu.promotion-word-library 行同时保存 zh-TW/en 及其它语言翻译。
--       Java 迁移逐键改写 JSON：zh-TW/en 换新名，zh-CN/ja/ko/ru 删除旧值，交给启动期的
--       zh-CN 回填与自动机翻重新补齐；留空串会让 i18next 认为该语言有值而停止回落。
-- ---------------------------------------------------------------------------

UPDATE `sys_menu`
SET `name` = '推薦算法詞庫'
WHERE `menu_key` = 'promotion-word-library'
  AND `name` = '算法推薦詞庫';

UPDATE `sys_menu`
SET `name_en` = 'Recommendation Algorithm Library'
WHERE `menu_key` = 'promotion-word-library'
  AND (`name_en` IS NULL OR `name_en` = '' OR `name_en` = 'Algorithm Recommendation Library');

-- 后置确认：菜单名应为「推薦算法詞庫」，且不再出现上一版默认名
SELECT `menu_key`, `name`, `name_en`, `parent_id`, `sort_order`, `system_code`
FROM `sys_menu`
WHERE `menu_key` = 'promotion-word-library' AND `deleted` = 0;

SELECT `field_key`, `field_name`, `translations_json`
FROM `sys_translation`
WHERE `field_key` = 'menu.promotion-word-library' AND `deleted` = 0;

-- 回滚（代码回滚不会撤销已记账迁移，需手工执行；同时把 DataInitializer 的种子名称改回）：
--   UPDATE `sys_menu` SET `name` = '算法推薦詞庫', `name_en` = 'Algorithm Recommendation Library'
--   WHERE `menu_key` = 'promotion-word-library';
--   并将 sys_translation 的 menu.promotion-word-library 恢复为上一版默认译文。
--   生产环境禁止删除 sys_schema_version / sys_schema_migration_log 中的迁移记账。
