-- 264: rdm_daily_report 触发列改名（last_trigger_type/last_trigger_by → trigger_type/trigger_by）
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.18 负责
-- （先查 information_schema.COLUMNS：新列已存在则跳过，仅当旧列存在才 CHANGE COLUMN；
--   后置校验「新列就绪 + 旧列已消失」才记版本）。
--
-- 为什么要改名：v3.16 首版建表时用了 last_trigger_* 命名，而方案冻结的列名是
-- trigger_type / trigger_by。已跑过旧 v3.16 的库（共享开发库）与按新定义建表的库
-- （生产首次部署）列名不一致 —— 同一份代码在两边读写不同列，这类「开发库与生产库
-- schema 分叉」排查成本极高，必须在同一批交付里收敛掉。
--
-- 为什么用 CHANGE COLUMN 而不是 DROP + ADD：迁移规范禁止生产环境 DROP COLUMN；
-- CHANGE 是非破坏性改名，保留列上已有数据。本表是 v3.16 刚建的新表（改名时 0 行业务数据），
-- 改名不影响任何存量事实。
--
-- 条件执行保证可重放：新库直接建成新名 → 旧列不存在 → 跳过；已收敛的库重跑 → 新列存在 → 跳过。
-- 因此本脚本对新库是空操作，只对「跑过旧 v3.16」的库生效。

ALTER TABLE rdm_daily_report
    CHANGE COLUMN last_trigger_type trigger_type VARCHAR(16) DEFAULT NULL COMMENT '最近一次触发方式: schedule/manual';

ALTER TABLE rdm_daily_report
    CHANGE COLUMN last_trigger_by trigger_by VARCHAR(64) DEFAULT NULL COMMENT '最近一次手动触发人姓名快照（定时为 NULL）';
