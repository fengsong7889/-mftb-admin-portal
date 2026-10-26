-- 302: 研发任务新增「計劃上線日」字段
-- 用途：拆子任务时必须有明确的对外时间边界。原先任务只有计划起止，
--       子任务可以被写到需求计划上线之后，甘特图看着排满但需求交不出来。
-- 口径：rdm_work_task.plan_release_date 默认继承 rdm_requirement.plan_release_date，
--       且不得晚于需求计划上线日；存量行保持 NULL（不回填，避免把未排期任务伪装成已排期）。
-- 说明：本脚本为一次性参考文档，实际幂等保证由 RdmSchemaMigrationInitializer
--       （versionKey: rdm:schema:v3.35）负责，先查 INFORMATION_SCHEMA 再 ADD COLUMN。
ALTER TABLE rdm_work_task ADD COLUMN plan_release_date DATE DEFAULT NULL
    COMMENT '計劃上線日（不得晚於需求計劃上線日）' AFTER plan_finish_date;
