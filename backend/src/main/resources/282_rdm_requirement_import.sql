-- 281: RDM 存量需求导入（云效迁移）配套结构。
--
-- 口径说明：
--   external_no     仅记录外部编号，用于回到云效查看更详细内容；不参与需求编号（XQ）规则，
--                   也不允许用它冒充正式需求号。
--   external_source 来源标识，当前只有 YUNXIAO；与 external_no 组成唯一键做导入幂等。
--   project_manager_* 需求级项目经理：绑定项目时默认继承 rdm_project.pm_user_id，
--                   未绑定项目时取导入行填写的人。
--
-- 本文件为一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer 的
-- rdm:schema:v3.29 负责（逐列先查 INFORMATION_SCHEMA 再加，索引先用 STATISTICS 判重）。
ALTER TABLE rdm_requirement ADD COLUMN external_no VARCHAR(64) DEFAULT NULL COMMENT '外部来源编号（云效工作项编号），仅记录用于回查' AFTER version_no;
ALTER TABLE rdm_requirement ADD COLUMN external_source VARCHAR(32) DEFAULT NULL COMMENT '外部来源: YUNXIAO' AFTER external_no;
ALTER TABLE rdm_requirement ADD COLUMN project_manager_user_id BIGINT DEFAULT NULL COMMENT '项目经理ID（需求级，未绑项目时使用）' AFTER assignee_pm_name;
ALTER TABLE rdm_requirement ADD COLUMN project_manager_user_name VARCHAR(64) DEFAULT NULL COMMENT '项目经理姓名快照' AFTER project_manager_user_id;
CREATE UNIQUE INDEX uk_rdm_req_external ON rdm_requirement (external_source, external_no);
