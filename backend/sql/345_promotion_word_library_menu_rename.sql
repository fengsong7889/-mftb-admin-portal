# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 345: 「詞庫管理」菜单更名为「算法推薦詞庫」
-- ---------------------------------------------------------------------------
-- 背景：该菜单挂在「商家推廣工具」（ads 域）下，供算法推荐取词；与搜索运营系统的
--       「搜索詞庫」（分詞詞庫/同義詞庫/熱搜詞庫/停用詞庫）分属两套。原名不带归属，
--       在任何界面里都容易被读成搜索侧的词库，产品决定把用途写进菜单名。
--       菜单名真值在 sys_menu.name（英文在 sys_menu.name_en），seedSystemMenus 只新增
--       不覆盖存量名称、seedMenuEnglishNames 也只填空值，故存量库必须靠一次性迁移收敛。
--
-- 记账：DataInitializer 的 versionTracker.applyOnce("ads:promotion-word-library-menu-rename-v1",
--       task, verify)；新库由种子直接写新名，两条路径收敛到同一个名称。
--
-- 守卫：UPDATE 带旧名称作条件（name_en 额外接管 NULL/空串），运营在「菜单配置」里
--       自定义过的名称不命中、不会被顶掉；命中 0 行属正常幂等。
-- 界面真值：sys_translation 的 menu.promotion-word-library 行是 zh-CN/en/ja/ko/ru 取菜单名
--       的实际来源（TranslationDataInitializer.syncMenuNames 仅插入不更新），因此本条必须一并
--       改写：zh-TW/en 换新名，其余语言整键删除，交给启动期的 zh-CN 回填 + 自动机翻重新补齐
--       （留空串会让 i18next 认为「该语言有值」而不再回落，显示空白）。
-- ---------------------------------------------------------------------------

UPDATE `sys_menu`
SET `name` = '算法推薦詞庫'
WHERE `menu_key` = 'promotion-word-library'
  AND `name` = '詞庫管理';

UPDATE `sys_menu`
SET `name_en` = 'Algorithm Recommendation Library'
WHERE `menu_key` = 'promotion-word-library'
  AND (`name_en` IS NULL OR `name_en` = '' OR `name_en` = 'Word Library');

-- 语言包字段同步（Java 迁移里逐键改写 JSON，这里给等价的手工口径）：
--   zh-TW / en 换新名，zh-CN / ja / ko / ru 删除旧键等待回填与机翻。
--   本表由 TranslationDataInitializer.syncMenuNames 播种，仅插入不更新，故不改这里界面仍显示旧名。

-- 后置确认：菜单名应为「算法推薦詞庫」，且不再出现旧名
SELECT `menu_key`, `name`, `name_en`, `parent_id`, `sort_order`, `system_code`
FROM `sys_menu`
WHERE `menu_key` = 'promotion-word-library' AND `deleted` = 0;

SELECT `field_key`, `field_name`, `translations_json`
FROM `sys_translation`
WHERE `field_key` = 'menu.promotion-word-library' AND `deleted` = 0;

-- 回滚（代码回滚不会撤销已记账迁移，需手工执行；同时把 DataInitializer 的种子名称改回）：
--   UPDATE `sys_menu` SET `name` = '詞庫管理', `name_en` = 'Word Library'
--   WHERE `menu_key` = 'promotion-word-library';
-- 并删除记账行 sys_schema_version / sys_schema_migration_log 中的 ads:promotion-word-library-menu-rename-v1
-- （仅限本机开发库；生产禁止删记账行）。
