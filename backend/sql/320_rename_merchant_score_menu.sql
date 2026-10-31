-- Copyright (c) 2026 fengsong7889. All Rights Reserved.
-- 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
-- 完整许可条款见仓库根目录 LICENSE 文件。
-- 320: 「商家評分透視」菜单更名为「商家權重分排名」
-- ---------------------------------------------------------------------------
-- 背景：自然流量占比（權重）配置模块已停用并将删除，页面不再计算占比/归一/加权贡献，
-- 只展示商业、店铺、平台三个维度的得分合计与排名；原名「評分透視」不再表达当前口径。
-- 注意：DataInitializer.seedSystemMenus 只在名称为占位时才校正，不会覆盖存量名称，
--       故存量库必须由本迁移改名；新库由种子直接写新名称。
-- 守卫：只改「仍是历史默认名」的行，运营在菜单配置里自定义过的名称不覆盖 ——
--       与 Java 侧 ads:merchant-score-menu-rename-v1 的 WHERE 条件严格一致，
--       否则手工执行本脚本会把运营自定义名冲掉（原 319 版缺此守卫，已修正）。
-- 序号：原占用 319，与 origin/main 的 319_search_config.sql 重号，按规范顺延为 320。
-- ---------------------------------------------------------------------------

UPDATE sys_menu SET name = '商家權重分排名'
 WHERE menu_key = 'merchant-score-insight' AND deleted = 0 AND name = '商家評分透視';

UPDATE sys_menu SET name_en = 'Merchant Weighted Score Ranking'
 WHERE menu_key = 'merchant-score-insight' AND deleted = 0
   AND (name_en IS NULL OR name_en = 'Merchant Score Insight');
