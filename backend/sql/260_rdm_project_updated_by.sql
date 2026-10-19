-- 260: RDM 项目主表补「最后更新人」列
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.14 负责
-- （先查 information_schema.COLUMNS 再 ADD COLUMN，后置校验列就绪才记版本）。
--
-- 为什么要这一列：项目总览列表要显示「最後更新人」，而 rdm_project 过去只有 updated_at，
-- 只能看到何时改过、看不到谁改的，追责与交接都断在这一步。全项目已有 updated_by 惯例
-- （sys_user / eam_model / rdm_task_type_config 等），本列同构。
--
-- 注意：项目的 MetaObjectHandler 只按名字填 createdAt / updatedAt，updated_by 不会被自动
-- 填充，必须由 RdmProjectService 在 createProject / updateProject 显式赋值。
--
-- 可空且不回填存量：历史行「谁改的」已是未知事实，编造一个更新人比留空更糟。

ALTER TABLE rdm_project
    ADD COLUMN updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人姓名快照' AFTER updated_at;
