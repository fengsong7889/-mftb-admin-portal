-- 272_rdm_daily_report_rule_project_ids.sql
-- 参照文档，不参与执行；执行体在 RdmSchemaMigrationInitializer#doDailyReportRuleProjectIdsMigrate。
-- 推送规则支持多项目/全部项目：
--   project_ids 为空 + project_id 为空 + iteration_code 为空 = 全部在途项目
--   project_ids 非空 = 多项目范围（project_id 落 NULL）
--   单项目仍兼容 project_id
ALTER TABLE rdm_daily_report_rule
    ADD COLUMN project_ids VARCHAR(1000) DEFAULT NULL
    COMMENT '多项目范围 JSON array；空=单项目/全部项目/仅迭代' AFTER project_id;
