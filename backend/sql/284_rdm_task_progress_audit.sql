-- 284: 甘特图进度直改与 PRD 排期承诺同步的审计结构
--
-- 说明：本文件为一次性参考文档，真实 DDL 内联在
-- RdmSchemaMigrationInitializer（rdm:schema:v3.31）中，不参与启动执行。
--
-- 背景：
-- 1. 甘特图支持直接在任务条上拖动进度后，进度成为绩效与验收的原始事实，
--    必须能追溯「谁在什么时候把哪条任务从多少改到多少」；
-- 2. PRD 任务改完成日会同步需求的「承诺出 PRD 日期」，
--    排期审计需要说明这次变更顺带改了对外承诺。
--
-- 幂等：ADD COLUMN 由 Java 迁移先查 INFORMATION_SCHEMA；建表用 IF NOT EXISTS。
-- 无 DROP / 无删列。

ALTER TABLE rdm_task_plan_log
    ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT '变更说明(如:同步需求承诺出PRD日期)'
    AFTER client_request_id;

CREATE TABLE IF NOT EXISTS rdm_task_progress_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    task_id BIGINT NOT NULL COMMENT '任务ID rdm_work_task.id',
    task_no VARCHAR(32) DEFAULT NULL COMMENT '任务编号快照',
    req_id BIGINT NOT NULL COMMENT '需求ID(冗余便于追溯)',
    user_id BIGINT NOT NULL COMMENT '操作人 sys_user.id',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照',
    old_progress INT DEFAULT NULL COMMENT '变更前进度',
    new_progress INT DEFAULT NULL COMMENT '变更后进度',
    old_status VARCHAR(32) DEFAULT NULL COMMENT '变更前状态',
    new_status VARCHAR(32) DEFAULT NULL COMMENT '变更后状态',
    remark VARCHAR(1000) DEFAULT NULL COMMENT '说明/完成交付说明',
    client_request_id VARCHAR(64) DEFAULT NULL COMMENT '客户端请求标识',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
    KEY idx_tplg_task (task_id),
    KEY idx_tplg_req (req_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = 'RDM任务进度变更审计(只追加)';
