-- 256: 团队负载（阶段 B-2.5）—— 新增 rdm_resource_plan 个人工作计划表 + rdm_resource_plan_log 计划调整审计表
-- 版本键: rdm:schema:v3.10（实际幂等由 RdmSchemaMigrationInitializer.applyOnce 保证，本脚本仅为参考文档）
-- 方言：MySQL 8.x。建表用 IF NOT EXISTS，可安全重放；本迁移只 ADD 两张新表，不改任何现有表。
-- 回滚：回退代码即可，空表留着无害（尚无服务读写时不影响任何存量查询）；错误约束用后续新版本迁移补正，不改历史。
--
-- 背景：B-1 的团队负载里，产品需求、测试批次「只有件数、无个人工时」，被如实标为 data_incomplete，
-- 无法参与参考负载率计算；研发/设计任务虽有计划工时，但「负责人确认的剩余工时」无处沉淀。
-- rdm_resource_plan 提供「个人 × 来源 × 岗位阶段」的计划/剩余工时载体，让各岗位都能算负载占用率。
--
-- 避免双真值（关键）：
--   * 来源为 rdm_work_task 时，负责人/计划工时/起止日期以原任务为唯一真值，plan 仅补充 remaining_hours，
--     并对 work_task_id 设 UNIQUE，保证「一份任务最多一条计划」，不让同一任务被计两次。
--   * 来源为需求/批次/协调（无原任务工时）时，plan 才承载 plan_hours/日期。
-- 与 v3.8 rdm_task_plan_log 的分工：那张表记「甘特拖拽改任务起止日期」的排期审计（日期语义）；
--   rdm_resource_plan_log 记「个人工作计划的创建/改派/剩余工时调整」审计（负载分派语义），二者不重叠。

CREATE TABLE IF NOT EXISTS rdm_resource_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '承担人 sys_user.id',
    source_type VARCHAR(16) NOT NULL COMMENT '来源类型:work_task/requirement/test_batch/project/coordination',
    source_id BIGINT NOT NULL COMMENT '来源单据主键(任务/需求/批次/项目id;协调项自增id)',
    work_task_id BIGINT DEFAULT NULL COMMENT '来源为执行任务时的 rdm_work_task.id;UNIQUE 防一份任务被重复计时',
    role_code VARCHAR(16) DEFAULT NULL COMMENT '岗位/阶段:product/dev/designer/qa/coord',
    plan_hours DECIMAL(7,2) DEFAULT NULL COMMENT '计划工时(来源为任务时取原任务,不在plan重复存)',
    remaining_hours DECIMAL(7,2) DEFAULT NULL COMMENT '负责人确认的剩余工时;新计划初值=计划工时',
    plan_start_date DATE DEFAULT NULL COMMENT '计划开始',
    plan_end_date DATE DEFAULT NULL COMMENT '计划完成',
    status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/done/cancelled',
    confirmed_by VARCHAR(64) DEFAULT NULL COMMENT '剩余工时确认人快照',
    confirmed_at DATETIME DEFAULT NULL COMMENT '剩余工时确认时间',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rrp_work_task (work_task_id),
    KEY idx_rrp_user_status (user_id, status, deleted),
    KEY idx_rrp_source (source_type, source_id),
    CONSTRAINT ck_rrp_plan_hours CHECK (plan_hours IS NULL OR plan_hours >= 0),
    CONSTRAINT ck_rrp_remaining CHECK (remaining_hours IS NULL OR remaining_hours >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM个人工作计划(跨来源负载工时载体)';

CREATE TABLE IF NOT EXISTS rdm_resource_plan_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    plan_id BIGINT DEFAULT NULL COMMENT '关联 rdm_resource_plan.id(建计划动作时可为空)',
    user_id BIGINT NOT NULL COMMENT '被计划承担人 sys_user.id',
    source_type VARCHAR(16) NOT NULL COMMENT '来源类型',
    source_id BIGINT NOT NULL COMMENT '来源单据主键',
    action VARCHAR(32) NOT NULL COMMENT 'create/update/reassign/dispatch/cancel',
    operator_id BIGINT NOT NULL COMMENT '操作人 sys_user.id',
    operator_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照',
    old_value VARCHAR(512) DEFAULT NULL COMMENT '变更前摘要(工时/剩余/负责人),不存敏感业务正文',
    new_value VARCHAR(512) DEFAULT NULL COMMENT '变更后摘要',
    reason VARCHAR(255) DEFAULT NULL COMMENT '改派/调整原因',
    client_request_id VARCHAR(64) DEFAULT NULL COMMENT '幂等请求ID(与 rdm_idempotent_log 对账)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    KEY idx_rrpl_plan (plan_id),
    KEY idx_rrpl_source (source_type, source_id),
    KEY idx_rrpl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM个人计划调整/改派审计(只追加不可变)';
