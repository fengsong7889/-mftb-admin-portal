-- 253: 团队负载（阶段 B-2）—— 新增 rdm_resource_member 资源名册表
-- 版本键: rdm:schema:v3.9（实际幂等由 RdmSchemaMigrationInitializer.applyOnce 保证，本脚本仅为参考文档）
-- 方言：MySQL 8.x。建表用 IF NOT EXISTS，可安全重放。
-- 回滚：回退代码即可，表留着无害（无服务读写时不影响任何存量查询）；本迁移只 ADD 新表，不改任何现有表。
--
-- 背景：B-1 的团队负载人员全集来自「在途项目成员 ∪ 各单据负责人」，仍无法纳入
-- 「已进研发协作名册、但当前无任何在途需求/任务/批次」的人——而这类「不忙的人」
-- 正是分派时最该被看见的。名册表把「谁纳入团队负载」显式化，与是否有单据解耦。
--
-- 与 v3.8 的分工：rdm_task_plan_log 记「任务排期变更审计」；本表是「资源名册」，
-- 二者无语义交集。个人剩余工时/计划层（rdm_resource_plan）在后续版本单独交付。

CREATE TABLE IF NOT EXISTS rdm_resource_member (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '员工 sys_user.id',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '姓名快照',
    dept VARCHAR(128) DEFAULT NULL COMMENT '部门快照',
    role_codes VARCHAR(255) DEFAULT NULL COMMENT '岗位角色JSON数组:pm/product/dev/designer/qa/ops/pmo',
    weekly_capacity_hours DECIMAL(5,2) DEFAULT NULL COMMENT '每周默认容量(人时);空则按工作日8h推算',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1=纳入名册 0=移出(名册靠status管理,不物理删)',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除(兜底;正常用status移出)',
    UNIQUE KEY uk_rrm_user (user_id),
    KEY idx_rrm_status (status, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM资源名册(团队负载纳入人员)';
