-- 214: RDM 阶段 5 结构（任务依赖 + 工作日历）
-- 目的：让「甘特图」不只是一张画出来的条形图，而是能算出关键路径的依赖网络；
--       让「个人负载」按真实可用天数算，而不是把工时平摊到周末与请假日上当没人加班。
-- 说明：本文件是可读参考副本，实际执行的是 classpath 下的同名脚本。

-- ── 任务依赖（有向边：pred 完成后 succ 才能开始）──
-- 为什么要独立表而不是在任务上加个 predecessor_ids 逗号字段：
-- 环检测与拓扑排序都需要按边索引查询，逗号字段只能全表扫并让脏数据静默生效。
CREATE TABLE IF NOT EXISTS rdm_task_dependency (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '所属需求ID（两端任务必须同属该需求，跨需求依赖走需求关联）',
    pred_task_id BIGINT NOT NULL COMMENT '前驱任务ID rdm_work_task.id',
    succ_task_id BIGINT NOT NULL COMMENT '后继任务ID rdm_work_task.id',
    dep_type VARCHAR(16) NOT NULL DEFAULT 'FS' COMMENT '依赖类型: FS完成-开始（首期只支持 FS）',
    lag_days INT NOT NULL DEFAULT 0 COMMENT '延迟天数（FS 之后隔几个工作日才能开始，可为负）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_task_dep (pred_task_id, succ_task_id),
    KEY idx_rdm_task_dep_req (req_id),
    KEY idx_rdm_task_dep_succ (succ_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-任务依赖（关键路径与甘特连线的边集，写入时做自环与环检测）';

-- ── 工作日历：按人按日记可用工时 ──
-- 为什么按人而不是全局一张日历：有人请假、有人周末支援上线，
-- 全局日历算出的关键路径与负载对具体的人一律是错的。
CREATE TABLE IF NOT EXISTS rdm_work_calendar (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '人员ID sys_user.id',
    day DATE NOT NULL COMMENT '日期',
    day_type VARCHAR(16) NOT NULL DEFAULT 'leave' COMMENT '类型: leave休假日/overtime加班日/custom自定义容量',
    available_hours DECIMAL(4,1) DEFAULT NULL COMMENT '当日可用工时（leave 视为 0；NULL 表示按默认规则）',
    reason VARCHAR(200) DEFAULT NULL COMMENT '原因（年假/婚假/周末支援上线等）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_work_calendar (user_id, day),
    KEY idx_rdm_work_calendar_day (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-工作日历（按人按日的可用工时，排程与负载计算的输入）';
