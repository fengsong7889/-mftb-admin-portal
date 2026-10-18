-- =============================================================
-- 245_rdm_project_lead_columns.sql
-- 项目主表补四组负责人列（技术/UI 设计/测试/运维，各 userId+姓名快照共 8 列）
-- 参考文档：实际执行与幂等由 RdmSchemaMigrationInitializer rdm:schema:v3.7 负责
--           （逐列先查再加，ADD COLUMN 不可整脚本重放），不进镜像。
-- 与代码侧 RdmProject 实体/RdmProjectService 写入逻辑同批原子交付：
--   缺列时服务层 insert/update 直接报“未知列”。
-- =============================================================

ALTER TABLE rdm_project ADD COLUMN tech_lead_user_id BIGINT DEFAULT NULL COMMENT '技术负责人用户ID' AFTER product_owner_user_name;
ALTER TABLE rdm_project ADD COLUMN tech_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '技术负责人姓名快照' AFTER tech_lead_user_id;
ALTER TABLE rdm_project ADD COLUMN ui_designer_user_id BIGINT DEFAULT NULL COMMENT 'UI设计负责人用户ID' AFTER tech_lead_user_name;
ALTER TABLE rdm_project ADD COLUMN ui_designer_user_name VARCHAR(64) DEFAULT NULL COMMENT 'UI设计负责人姓名快照' AFTER ui_designer_user_id;
ALTER TABLE rdm_project ADD COLUMN qa_lead_user_id BIGINT DEFAULT NULL COMMENT '测试/QA负责人用户ID' AFTER ui_designer_user_name;
ALTER TABLE rdm_project ADD COLUMN qa_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '测试/QA负责人姓名快照' AFTER qa_lead_user_id;
ALTER TABLE rdm_project ADD COLUMN ops_lead_user_id BIGINT DEFAULT NULL COMMENT '运维/DevOps负责人用户ID' AFTER qa_lead_user_name;
ALTER TABLE rdm_project ADD COLUMN ops_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '运维/DevOps负责人姓名快照' AFTER ops_lead_user_id;
