-- 208: RDM M4 产出积分与效能量快照（积分规则 / 积分流水 / 日快照 / 绩效建议值通道）
-- 参考文档：实际执行由 RdmSchemaMigrationInitializer 走 rdm:schema:v1.4（applyOnce + 后置校验）完成。
-- 说明：本脚本只做 CREATE / ADD，不含任何破坏性操作。

-- ── 1. 积分规则（版本化：改口径即升版本，历史流水按当时版本回溯） ──
CREATE TABLE IF NOT EXISTS rdm_score_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    rule_code VARCHAR(32) NOT NULL COMMENT '規則編碼，如 BASE',
    req_type VARCHAR(24) DEFAULT NULL COMMENT '適用需求類型，NULL=全部',
    role_code VARCHAR(32) DEFAULT NULL COMMENT '適用角色，NULL=全部計分角色',
    complexity_weight DECIMAL(5,2) DEFAULT NULL COMMENT '複雜度權重覆蓋，NULL=按默認表',
    type_factor DECIMAL(5,2) DEFAULT NULL COMMENT '類型係數覆蓋，NULL=按默認表',
    priority_bonus DECIMAL(5,2) DEFAULT NULL COMMENT '優先級加分（係數增量）',
    on_time_bonus DECIMAL(5,2) NOT NULL DEFAULT 0.10 COMMENT '按時交付加分',
    late_penalty DECIMAL(5,2) NOT NULL DEFAULT 0.30 COMMENT '逾期扣分上限',
    first_pass_bonus DECIMAL(5,2) NOT NULL DEFAULT 0.10 COMMENT '驗收一次通過加分',
    rework_penalty DECIMAL(5,2) NOT NULL DEFAULT 0.10 COMMENT '每次驗收返工扣分',
    reopen_penalty DECIMAL(5,2) NOT NULL DEFAULT 0.05 COMMENT '每次駁回重開扣分',
    acceptance_factor DECIMAL(5,3) NOT NULL DEFAULT 0.060 COMMENT '滿意度係數（偏離3分部分）',
    quality_floor DECIMAL(5,2) NOT NULL DEFAULT 0.60 COMMENT '質量因子下限（防分数被抹平）',
    role_factor DECIMAL(5,2) DEFAULT NULL COMMENT '角色係數覆蓋，NULL=按默認表',
    unit_score DECIMAL(6,1) NOT NULL DEFAULT 10 COMMENT '單位分',
    alloc_mode VARCHAR(16) NOT NULL DEFAULT 'each' COMMENT '分配模式: each(各角色分别计分)/split(总额按角色瓜分)',
    max_scorable_roles INT NOT NULL DEFAULT 6 COMMENT '单条需求计分角色上限，超出需PMO确认留痕',
    version INT NOT NULL DEFAULT 1 COMMENT '規則版本，同碼唯一',
    effective_from DATE DEFAULT NULL COMMENT '生效日期',
    enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否当前生效（同一时刻只应有一条）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '說明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_score_rule (rule_code, version),
    KEY idx_rdm_score_rule_enabled (enabled, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-产出积分规则（版本化）';

-- ── 2. 积分流水（一条需求 × 一个人 × 一个角色 × 一个周期 = 一行） ──
-- 唯一键是防漂移的第一道闸：重算当期必须幂等 upsert，不能靠"先全删再插"，
-- 否则并发重算会产生双份分数，绩效侧拿到的总分直接失真。
CREATE TABLE IF NOT EXISTS rdm_score_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '業務需求ID',
    user_id BIGINT NOT NULL COMMENT '得分人ID',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '得分人工號快照',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '得分人姓名快照',
    dept_id BIGINT DEFAULT NULL COMMENT '得分人部門ID快照',
    dept_name VARCHAR(64) DEFAULT NULL COMMENT '得分人部門名稱快照',
    role_code VARCHAR(32) NOT NULL COMMENT '計分角色（PM/DEV_LEAD/DEV/DESIGNER/QA/PMO/DISPATCHER）',
    period_code VARCHAR(32) DEFAULT NULL COMMENT '績效周期編碼（對應 hr_perf_cycle.code）',
    score DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '最終得分',
    base_score DECIMAL(8,2) DEFAULT NULL COMMENT '基準分（複雜度×單位分）',
    type_factor DECIMAL(5,2) DEFAULT NULL COMMENT '類型係數',
    priority_factor DECIMAL(5,2) DEFAULT NULL COMMENT '優先級係數',
    on_time_factor DECIMAL(5,2) DEFAULT NULL COMMENT '按時因子',
    quality_factor DECIMAL(5,2) DEFAULT NULL COMMENT '質量因子',
    role_factor DECIMAL(5,2) DEFAULT NULL COMMENT '角色係數',
    breakdown_json TEXT COMMENT '成因明細JSON（績效申訴復算依據）',
    rule_version INT DEFAULT NULL COMMENT '命中的規則版本（歷史不可變）',
    complexity VARCHAR(16) DEFAULT NULL COMMENT '需求複雜度快照',
    req_type VARCHAR(24) DEFAULT NULL COMMENT '需求類型快照',
    priority VARCHAR(8) DEFAULT NULL COMMENT '需求優先級快照',
    on_time TINYINT NOT NULL DEFAULT 1 COMMENT '是否按時上線',
    late_days INT DEFAULT NULL COMMENT '逾期天數',
    rework_count INT DEFAULT NULL COMMENT '驗收返工次數快照',
    acceptance_score TINYINT DEFAULT NULL COMMENT '驗收滿意度快照',
    first_pass TINYINT DEFAULT NULL COMMENT '驗收是否一次通過',
    push_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '績效推送狀態: none/suggested/confirmed/rejected',
    pushed_at DATETIME DEFAULT NULL COMMENT '推送時間',
    calculated_at DATETIME DEFAULT NULL COMMENT '計算時間',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_score_owner (req_id, user_id, role_code, period_code),
    KEY idx_rdm_score_period_user (period_code, user_id),
    KEY idx_rdm_score_dept (period_code, dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-产出积分流水';

-- ── 3. 效能量日快照（趋势页与报表的唯一数据源） ──
-- 必须按天冻结：实时算会让"上周看过的数字这周变了"，绩效口径一旦如此就无法解释。
CREATE TABLE IF NOT EXISTS rdm_metric_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    stat_date DATE NOT NULL COMMENT '快照日期',
    dim_type VARCHAR(16) NOT NULL DEFAULT 'COMPANY' COMMENT '維度: COMPANY/DEPT/PERSON/PM',
    dim_id BIGINT DEFAULT NULL COMMENT '維度對象ID，COMPANY 為 NULL',
    dim_name VARCHAR(64) DEFAULT NULL COMMENT '維度名稱快照',
    req_total INT NOT NULL DEFAULT 0 COMMENT '截至當日存量需求數',
    submitted INT NOT NULL DEFAULT 0 COMMENT '當日新提交',
    accepted INT NOT NULL DEFAULT 0 COMMENT '當日受理',
    released INT NOT NULL DEFAULT 0 COMMENT '當日上線',
    overdue INT NOT NULL DEFAULT 0 COMMENT '當日逾期存量',
    avg_response_hours DECIMAL(8,2) DEFAULT NULL COMMENT '平均響應時長（小時）',
    avg_delivery_days DECIMAL(8,2) DEFAULT NULL COMMENT '平均交付週期（天）',
    on_time_rate DECIMAL(5,4) DEFAULT NULL COMMENT '按時上線率',
    reject_rate DECIMAL(5,4) DEFAULT NULL COMMENT '駁回率',
    first_pass_rate DECIMAL(5,4) DEFAULT NULL COMMENT '驗收一次通過率',
    rework_count INT NOT NULL DEFAULT 0 COMMENT '當日返工次數',
    change_count INT NOT NULL DEFAULT 0 COMMENT '當日變更次數',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_metric_day (stat_date, dim_type, dim_id),
    KEY idx_rdm_metric_dim (dim_type, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-效能量日快照';

-- ── 4. 绩效建议值通道（hr_perf_score_item 扩展列）──
-- 不复用 self_score/supervisor_score：那两列是人工评价语义，写进机器建议值会让
-- 校准环节看不出“这条是 RDM 推的还是主管打的”，申诉时无法区分责任。
-- 注：ADD COLUMN 不可重复执行，因此这三列由 RdmSchemaMigrationInitializer 先查
-- information_schema 再条件添加（否则脚本中途失败重跑会报 duplicate column）。

-- ── 5. 现行口径规则种子（v1，各角色分别计分） ──
INSERT IGNORE INTO rdm_score_rule (
    rule_code, req_type, role_code, priority_bonus, on_time_bonus, late_penalty,
    first_pass_bonus, rework_penalty, reopen_penalty, acceptance_factor, quality_floor,
    unit_score, alloc_mode, max_scorable_roles, version, effective_from, enabled, remark, created_by, updated_by
) VALUES (
    'BASE', NULL, NULL, 0.10, 0.10, 0.30,
    0.10, 0.10, 0.05, 0.060, 0.60,
    10.0, 'each', 6, 1, '2026-07-01', 1, '現行口徑：各角色分別計分，單位分 10，單條需求最多 6 個角色計分', 'system', 'system'
);
