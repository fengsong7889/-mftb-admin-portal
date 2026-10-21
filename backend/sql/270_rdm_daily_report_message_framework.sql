-- 270: 钉钉日报改为固定框架 + 全局字段开关，预置模板转自定义模板
--
-- 用途：群报/个人通知不再把「项目→迭代→全部需求行」一次性铺进聊天窗口，
--       改为代码内置的固定层级框架（汇总行 → 项目行 → 迭代行 → 未挂项目迭代 → 引导链接），
--       可配的只有「每行展示哪几个字段」；旧 7 套预置模板转为可自由编辑的自定义模板保留。
--
-- 说明：本脚本仅作参照文档，实际幂等执行由 Java 迁移
--       rdmSchemaMigrationInitializer（versionKey = rdm:schema:v3.23）负责：
--       先查 INFORMATION_SCHEMA.COLUMNS，不存在才 ADD COLUMN；UPDATE 可重放。
--       生产发布禁止直接执行本脚本。
--
-- 回滚：把模式改回 template 即可恢复「按模板文本渲染」，两列可保留（旧代码忽略）；
--       如需恢复预置标记，按 7 个内置 template_key 把 is_preset 置回 1（非必需）。

ALTER TABLE rdm_daily_report_config
    ADD COLUMN message_mode VARCHAR(16) NOT NULL DEFAULT 'fixed'
        COMMENT '钉钉消息模式: fixed=固定框架 / template=自定义模板'
        AFTER board_show_unassigned;

ALTER TABLE rdm_daily_report_config
    ADD COLUMN message_field_options VARCHAR(1000) DEFAULT NULL
        COMMENT '固定框架的字段开关（JSON，全局一套）'
        AFTER message_mode;

-- 预置模板转为自定义模板：不删行、不改文案，仍可在模板页自由编辑
UPDATE rdm_daily_report_template
   SET is_preset = 0, updated_by = 'system', updated_at = NOW()
 WHERE is_preset = 1 AND deleted = 0;
