-- Copyright (c) 2026 fengsong7889. All Rights Reserved.
-- 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
-- 完整许可条款见仓库根目录 LICENSE 文件。
-- 325: 「商家權重分排名」调整到「實驗沙盤」分组第一位
-- ---------------------------------------------------------------------------
-- 背景：商家权重分排名是沙盘的核心入口，产品决定置于实验沙盘分组首位，
--       瀑布流推演/算法推演/商家推广诊断依次顺延。
-- 注意：DataInitializer.seedSystemMenus 不覆盖存量菜单的 sort_order，
--       存量库必须由本迁移强制重排；新库由种子直接按新顺序写入。
--       执行真值是 Java 侧 versionKey ads:merchant-score-menu-first-v1，
--       本脚本供手工执行/审计对照，WHERE 条件与 Java 侧严格一致。
-- 守卫：只改 parent_id 与 sort_order，不碰运营在菜单配置里自定义的名称。
-- ---------------------------------------------------------------------------

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'traffic-sandbox' AND deleted = 0 LIMIT 1) t)
 WHERE menu_key = 'merchant-score-insight' AND deleted = 0
   AND parent_id != (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'traffic-sandbox' AND deleted = 0 LIMIT 1) t2);

UPDATE sys_menu SET sort_order = 1 WHERE menu_key = 'merchant-score-insight'        AND deleted = 0 AND sort_order != 1;
UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'waterfall-simulation'          AND deleted = 0 AND sort_order != 2;
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'algorithm-simulation'          AND deleted = 0 AND sort_order != 3;
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'merchant-promotion-diagnose'   AND deleted = 0 AND sort_order != 4;
