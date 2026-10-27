-- 215: RDM 阶段 6 结构（贡献预算 + HR 建议流程）
-- 目的：让「积分」到「绩效」之间有一段可复核、可撤回、可追溯的人工流程。
--       积分直接写进考核单等于把绩效判定权交给算分脚本；
--       而没有预算上限的积分，会让一个部门的总分随人头数与并行需求量无限膨胀。
-- 说明：本文件是可读参考副本，实际执行的是 classpath 下的同名脚本。

-- ── 贡献预算：一个周期 × 一个部门（0 = 全员）的积分上限 ──
-- 预算只用于超限预警，不自动折算个人分数：
-- 自动折算会让一个人的分数取决于同部门其他人产出了多少，那不再是他的贡献。
CREATE TABLE IF NOT EXISTS rdm_score_budget (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    period_code VARCHAR(32) NOT NULL COMMENT '绩效周期编码 hr_perf_cycle.code',
    dept_id BIGINT NOT NULL DEFAULT 0 COMMENT '部门ID，0=全员预算（兜底口径）',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    score_budget DECIMAL(12,2) NOT NULL COMMENT '本周期该部门可分配的贡献分预算上限',
    warning_ratio DECIMAL(5,2) NOT NULL DEFAULT 80.00 COMMENT '预警阈值（预算占用达到该百分比时提示 PMO）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '预算依据（人力/迭代容量/历史均值等）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_score_budget (period_code, dept_id),
    KEY idx_rdm_score_budget_period (period_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-贡献分预算（周期×部门上限与预警阈值，只预警不折算）';

-- ── HR 建议：由积分流水聚合出的人工复核清单 ──
-- 状态只能单向流转 draft → confirmed → pushed，pushed 之后只能 withdraw（撤回会清空建议值），
-- 不允许把已推送的建议直接改分：那等于绕过 HR 校准通道改考核。
CREATE TABLE IF NOT EXISTS rdm_hr_suggestion (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    period_code VARCHAR(32) NOT NULL COMMENT '绩效周期编码',
    user_id BIGINT NOT NULL COMMENT '被建议人 sys_user.id',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照（HR 系统按工号匹配，改不了历史）',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '姓名快照',
    dept_id BIGINT DEFAULT NULL COMMENT '部门ID快照',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    total_score DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本周期贡献分合计',
    record_count INT NOT NULL DEFAULT 0 COMMENT '依据的积分流水条数（0 说明没有可追溯明细）',
    delivered_count INT NOT NULL DEFAULT 0 COMMENT '交付需求数',
    avg_acceptance_score DECIMAL(4,2) DEFAULT NULL COMMENT '上线后业务验收平均分',
    first_pass_count INT NOT NULL DEFAULT 0 COMMENT '一次通过的需求数',
    budget_used_ratio DECIMAL(5,2) DEFAULT NULL COMMENT '所属部门预算占用百分比',
    over_budget TINYINT NOT NULL DEFAULT 0 COMMENT '是否超出预算（1=超出，需 PMO 复核说明）',
    breakdown_json TEXT COMMENT '分项依据快照（角色/需求/规则版本，供申诉复算）',
    rule_version INT DEFAULT NULL COMMENT '出分时生效的规则版本',
    status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/confirmed/pushed/withdrawn',
    reviewer_user_id BIGINT DEFAULT NULL COMMENT '复核人（PMO/主管）',
    reviewer_name VARCHAR(64) DEFAULT NULL COMMENT '复核人姓名快照',
    review_time DATETIME DEFAULT NULL COMMENT '复核时间',
    review_remark VARCHAR(500) DEFAULT NULL COMMENT '复核意见（驳回或超限说明必填）',
    pushed_at DATETIME DEFAULT NULL COMMENT '推送建议值到绩效的时间',
    generated_at DATETIME DEFAULT NULL COMMENT '本次聚合时间（重算会更新）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_hr_suggestion (period_code, user_id),
    KEY idx_rdm_hr_suggestion_period (period_code, status),
    KEY idx_rdm_hr_suggestion_dept (dept_id, period_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-HR绩效建议（积分聚合→人工复核→推送，状态单向流转并留痕）';
