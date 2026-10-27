-- 212: RDM 阶段 3 结构（里程碑计划与基线 / 工时明细 / PRD 定稿快照）
-- 目的：把「计划」从需求主表的几个散列日期升级为可追溯的节点基线，
--       把「实际工时」从任务上的一个数字升级为可核对的明细，
--       并让评审通过的 PRD 有不可改的内容版本（否则评审结论与实际开发依据会分叉）。
-- 说明：本文件是可读参考副本，实际执行的是 classpath 下的同名脚本。

-- ── 1. 里程碑：五节点的初步计划 / 批准基线 / 当前预测 / 实际完成 ──
-- 为什么四套日期放同一行：延期对比必须能一眼看出「相对哪条基线延了」，
-- 拆成历史表会让"当前基线"变成一次 join 查询，界面和校验都容易取错。
CREATE TABLE IF NOT EXISTS rdm_milestone (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID rdm_requirement.id',
    code VARCHAR(32) NOT NULL COMMENT '节点编码: PRD_REVIEW/DESIGN_DONE/DEV_START/DEV_DONE/RELEASE',
    name VARCHAR(64) NOT NULL COMMENT '节点名称快照（展示用，改配置不影响历史）',
    owner_user_id BIGINT DEFAULT NULL COMMENT '节点负责人 sys_user.id',
    owner_name VARCHAR(64) DEFAULT NULL COMMENT '负责人姓名快照',
    preliminary_date DATE DEFAULT NULL COMMENT '初步计划（PM 受理时填）',
    baseline_date DATE DEFAULT NULL COMMENT '已批准基线（评审/估时后冻结，不随后续改期覆盖）',
    forecast_date DATE DEFAULT NULL COMMENT '当前预测（改期只动这列，基线保留）',
    actual_date DATE DEFAULT NULL COMMENT '实际完成时间（由流转或任务联动写入）',
    status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/done/not_applicable',
    na_reason VARCHAR(256) DEFAULT NULL COMMENT '不适用原因（如纯后端需求无 UI 设计节点）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '节点顺序',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_milestone (req_id, code),
    KEY idx_rdm_milestone_owner (owner_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求里程碑（五节点计划/基线/预测/实际，按时率与甘特基线的事实来源）';

-- ── 2. 工时明细：按人按工作日记一行，任务上的 actual_hours 是它的汇总 ──
-- 为什么不让 PM 代填实际工时：实际工时的意义是「谁花了多久」，
-- 由别人代填会把负载与估时偏差两类指标同时做假。
CREATE TABLE IF NOT EXISTS rdm_work_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    task_id BIGINT NOT NULL COMMENT '任务ID rdm_work_task.id',
    req_id BIGINT NOT NULL COMMENT '需求ID（冗余，便于按需求/人员汇总）',
    user_id BIGINT NOT NULL COMMENT '填报人 sys_user.id',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '填报人姓名快照',
    work_date DATE NOT NULL COMMENT '工作日期',
    hours DECIMAL(6,2) NOT NULL COMMENT '当日投入工时（人时）',
    remark VARCHAR(255) DEFAULT NULL COMMENT '说明（做了什么/为何加班）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人（修订留痕：保留最后修改人与时间）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_work_log_day (task_id, user_id, work_date),
    KEY idx_rdm_work_log_user_date (user_id, work_date),
    KEY idx_rdm_work_log_req (req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-工时明细（同人同任务同日唯一，重复提交视为修订）';

-- ── 3. PRD 定稿快照：评审结论绑定的是哪一版内容 ──
-- 没有这张表时，「评审通过」只表示某个时刻为真，之后正文还能被改，
-- 开发按新内容做、验收按旧标准查，追溯链会断。
CREATE TABLE IF NOT EXISTS rdm_prd_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    prd_id BIGINT NOT NULL COMMENT 'PRD ID rdm_prd.id',
    req_id BIGINT NOT NULL COMMENT '需求ID（冗余便于按需求查版本链）',
    version_no VARCHAR(16) NOT NULL COMMENT 'PRD 版本号快照，如 v1.2',
    title VARCHAR(200) DEFAULT NULL COMMENT '标题快照',
    feature_list TEXT COMMENT '功能清单快照',
    acceptance_criteria TEXT COMMENT '验收标准快照（验收用例的来源）',
    content_rich MEDIUMTEXT COMMENT '正文快照',
    prototype_url VARCHAR(512) DEFAULT NULL COMMENT '原型链接快照',
    review_id BIGINT DEFAULT NULL COMMENT '产生本快照的评审记录ID',
    conclusion VARCHAR(16) DEFAULT NULL COMMENT '评审结论: passed/rejected',
    conclusion_desc VARCHAR(512) DEFAULT NULL COMMENT '评审意见摘要',
    reviewer_ids VARCHAR(255) DEFAULT NULL COMMENT '评审参与人ID列表（逗号分隔）',
    snapshot_time DATETIME DEFAULT NULL COMMENT '定稿时间',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除（快照本身不可改，只允许逻辑标记）',
    KEY idx_rdm_prd_snapshot_prd (prd_id, snapshot_time),
    KEY idx_rdm_prd_snapshot_req (req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-PRD定稿快照（评审通过即冻结一版，改内容必须走新版本）';
