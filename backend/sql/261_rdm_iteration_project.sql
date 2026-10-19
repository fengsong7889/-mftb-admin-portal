-- 261: RDM 迭代表补「所属项目」列
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.15 负责
-- （先查 information_schema.COLUMNS 再 ADD COLUMN，后置校验列就绪才记版本）。
--
-- 为什么要这一列：归属体系改造把「项目 1─N 迭代」定为标准链路（对齐 Jira Sprint/Version
-- 归属项目的业界做法）。改造前迭代是全局的，SP/VER/HF 三种类型都挂在系统层面，
-- 需求按项目统计时无法回答「这个项目上了哪些迭代、每个迭代上了哪些需求」。
--
-- 口径：sprint / version 两类迭代必须挂项目；hotfix（紧急修复）允许不挂——
-- 跨项目线上事故的「平台级热修」迭代没有单一项目归属（管理员已裁决）。
--
-- 可空且不回填存量：存量迭代无法自动判定归属（编码里没有项目信息），
-- 由管理员在迭代排期列表逐个补挂，未挂行前端显示「未掛項目」警示 Tag。

ALTER TABLE rdm_iteration
    ADD COLUMN project_id BIGINT DEFAULT NULL COMMENT '所属项目ID（sprint/version必填，hotfix可空）' AFTER name;

CREATE INDEX idx_rdm_iteration_project ON rdm_iteration (project_id);
