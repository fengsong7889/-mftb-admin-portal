-- 269: 进度日报看板开放链接与展示参数
--
-- 用途：推送链接从站内页（需登录）改为免登看板 /#/rdm-daily-view?token=...
--       配置行新增「链接有效期（天）」与三个展示开关；看板样式固定，只允许调整展示内容。
--
-- 说明：本脚本仅作参照文档，实际幂等执行由 Java 迁移
--       rdmSchemaMigrationInitializer（versionKey = rdm:schema:v3.22）负责：
--       先查 INFORMATION_SCHEMA.COLUMNS，不存在才 ADD COLUMN。
--       生产发布禁止直接执行本脚本。
--
-- 回滚：新列均可保留（旧代码会忽略）；如需彻底回滚需 DROP COLUMN，属破坏性操作，
--       必须按变更窗口审批后单独执行，且先确认无版本引用这些列。

ALTER TABLE rdm_daily_report_config
    ADD COLUMN board_link_valid_days INT NOT NULL DEFAULT 30
        COMMENT '看板开放链接有效期（天）'
        AFTER personal_template_key;

ALTER TABLE rdm_daily_report_config
    ADD COLUMN board_show_requirements TINYINT NOT NULL DEFAULT 1
        COMMENT '看板是否展示需求明细 0/1'
        AFTER board_link_valid_days;

ALTER TABLE rdm_daily_report_config
    ADD COLUMN board_show_owners TINYINT NOT NULL DEFAULT 1
        COMMENT '看板是否展示负责人姓名 0/1'
        AFTER board_show_requirements;

ALTER TABLE rdm_daily_report_config
    ADD COLUMN board_show_unassigned TINYINT NOT NULL DEFAULT 1
        COMMENT '看板是否展示未挂项目的迭代 0/1'
        AFTER board_show_owners;
