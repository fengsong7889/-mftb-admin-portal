-- 246: 甘特图调期（阶段二）—— rdm_work_task 补 plan_version 乐观锁列 + 新增 rdm_task_plan_log 审计表
-- 版本键: rdm:schema:v3.8（实际幂等由 RdmSchemaMigrationInitializer.applyOnce 保证，本脚本仅为参考文档）
-- 方言：MySQL 8.x。ADD COLUMN 不可重复执行，逐列先查 INFORMATION_SCHEMA 再加；建表用 IF NOT EXISTS。
-- 回滚：回退代码即可，列与表留着无害（服务层不读不写时不影响存量查询）。

-- 1) 排期乐观锁版本列：拖拽调期与任务表单改期共用，防并发互盖
ALTER TABLE rdm_work_task
    ADD COLUMN plan_version INT NOT NULL DEFAULT 1
    COMMENT '排期版本(乐观锁):计划起止/负责人变更自增' AFTER iteration_code;

-- 2) 排期变更审计表（只追加，不修改不软删）
CREATE TABLE IF NOT EXISTS rdm_task_plan_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    task_id BIGINT NOT NULL COMMENT '任务ID rdm_work_task.id',
    task_no VARCHAR(32) DEFAULT NULL COMMENT '任务编号快照',
    req_id BIGINT NOT NULL COMMENT '需求ID(冗余便于追溯)',
    user_id BIGINT NOT NULL COMMENT '操作人 sys_user.id',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照',
    old_start_date DATE DEFAULT NULL COMMENT '原计划开始',
    old_finish_date DATE DEFAULT NULL COMMENT '原计划完成',
    new_start_date DATE DEFAULT NULL COMMENT '新计划开始',
    new_finish_date DATE DEFAULT NULL COMMENT '新计划完成',
    old_version INT DEFAULT NULL COMMENT '变更前版本',
    new_version INT DEFAULT NULL COMMENT '变更后版本',
    client_request_id VARCHAR(64) DEFAULT NULL COMMENT '幂等请求标识',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
    KEY idx_tpl_task (task_id),
    KEY idx_tpl_req (req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM任务排期变更审计(只追加)';
