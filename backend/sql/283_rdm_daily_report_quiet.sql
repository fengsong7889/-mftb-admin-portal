-- 283: 日报无异常日降噪策略（rdm_daily_report_config.quiet_policy）
--
-- 【本脚本仅作人工留档，不参与应用启动执行】
-- 真实 DDL 以内联形式写在 RdmSchemaMigrationInitializer（rdm:schema:v3.30），
-- 由 SchemaVersionTracker.applyOnce(key, task, verify) 门控；本文件不进镜像。
--
-- 背景：日报每天都发，但多数日子「无逾期、无到期」，正文只是把「全部正常」写成长摘要。
-- 时间一长读者会形成「日报不用看」的习惯，真正出事那天反而被忽略。
-- 降噪把「无异常日」压成一句结论或不发，异常日不变：
--   full  = 照常发完整摘要（改造前行为，回滚只需把值改回 full）
--   brief = 只发一句结论（默认；仍有一条，不会让人以为系统坏了）
--   skip  = 当日不发（仍然生成快照，打开日报页可看）
--
-- 口径：仅对「定时推送」生效；手动触发与预览照常发完整内容（用户主动要看）。

ALTER TABLE rdm_daily_report_config
    ADD COLUMN quiet_policy VARCHAR(16) NOT NULL DEFAULT 'brief'
        COMMENT '无异常日降噪策略: full=照常发摘要 / brief=只发一句结论 / skip=不发（仍落快照）'
        AFTER message_field_options;
