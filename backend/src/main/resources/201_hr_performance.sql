-- 201: P1 績效考核（周期/模板/计划/考核单/明细）——一次性参考文档；
--      实际执行与幂等由 HrPerfSchemaInitializer 负责。
--      版本键: hr:performance-schema:v1.0（表+字典+编号+流程）+ hr:performance-menu:v1.0（菜单/授权/系统准入）
--      状态机: self_pending → supervisor_pending → calibration_pending → confirm_pending → confirmed（voided 作废）
--      敏感口径: 结果在 confirmed 前对本人不可见；评估人以 evaluator_user_id(BIGINT) 为权威，姓名仅快照

-- 考核周期
CREATE TABLE IF NOT EXISTS hr_perf_cycle (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '周期编号(PC+YYYYMMDD+4位)',
    code VARCHAR(32) NOT NULL COMMENT '周期编码，如 2026Q3',
    name VARCHAR(64) NOT NULL COMMENT '周期名称',
    cycle_type VARCHAR(16) NOT NULL COMMENT '周期类型: QUARTER/YEAR',
    period_start DATE NOT NULL COMMENT '考核期开始',
    period_end DATE NOT NULL COMMENT '考核期结束',
    status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/published/closed',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_perf_cycle_code (`code`),
    UNIQUE KEY uk_perf_cycle_req (`req_no`),
    KEY idx_perf_cycle_status (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考核周期';

-- 考核模板
CREATE TABLE IF NOT EXISTS hr_perf_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(64) NOT NULL COMMENT '模板名称',
    apply_cycle_type VARCHAR(16) DEFAULT NULL COMMENT '适用周期类型，空为通用',
    grade_scheme TEXT COMMENT '等级方案 JSON: [{code,minScore,ratio}]',
    weight_sum INT NOT NULL DEFAULT 100 COMMENT '指标权重合计',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1 启用 0 停用',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考核模板';

-- 考核指标
CREATE TABLE IF NOT EXISTS hr_perf_indicator (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    template_id BIGINT NOT NULL COMMENT '所属模板',
    name VARCHAR(128) NOT NULL COMMENT '指标名称',
    indicator_type VARCHAR(32) DEFAULT NULL COMMENT '指标类型(字典 PERF_INDICATOR_TYPE)',
    weight DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '权重',
    target_desc VARCHAR(500) DEFAULT NULL COMMENT '目标值/衡量标准',
    scoring_desc VARCHAR(500) DEFAULT NULL COMMENT '评分口径',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_perf_ind_template (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考核指标';

-- 考核计划
CREATE TABLE IF NOT EXISTS hr_perf_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '计划编号(PP+YYYYMMDD+4位)',
    cycle_id BIGINT NOT NULL COMMENT '所属周期',
    template_id BIGINT NOT NULL COMMENT '使用模板',
    name VARCHAR(64) NOT NULL COMMENT '计划名称',
    scope_json TEXT COMMENT '范围条件 JSON: 部门/职级/在职状态',
    self_start DATE NOT NULL COMMENT '自评开始',
    self_end DATE NOT NULL COMMENT '自评截止',
    sup_start DATE NOT NULL COMMENT '上级评开始',
    sup_end DATE NOT NULL COMMENT '上级评截止',
    calib_end DATE NOT NULL COMMENT '校准截止',
    status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/running/confirm_pending/confirmed',
    flow_no VARCHAR(64) DEFAULT NULL COMMENT '整批确认关联的 OA 流程编号',
    summary VARCHAR(500) DEFAULT NULL COMMENT '计划说明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_perf_plan_req (`req_no`),
    KEY idx_perf_plan_cycle (`cycle_id`, `status`),
    KEY idx_perf_plan_flow (`flow_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考核计划';

-- 员工考核单
CREATE TABLE IF NOT EXISTS hr_perf_assessment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '考核单编号(PH+YYYYMMDD+4位)',
    plan_id BIGINT NOT NULL COMMENT '所属计划',
    user_id BIGINT NOT NULL COMMENT '被考核人 sys_user.id',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照',
    emp_name VARCHAR(64) NOT NULL COMMENT '姓名快照',
    dept_id BIGINT DEFAULT NULL COMMENT '部门 ID 快照',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    sequence_type VARCHAR(32) DEFAULT NULL COMMENT '序列快照',
    position_name VARCHAR(64) DEFAULT NULL COMMENT '职位快照',
    position_level VARCHAR(32) DEFAULT NULL COMMENT '职级快照',
    evaluator_user_id BIGINT DEFAULT NULL COMMENT '评估人 sys_user.id(权威)',
    evaluator_name VARCHAR(64) DEFAULT NULL COMMENT '评估人姓名快照',
    status VARCHAR(24) NOT NULL DEFAULT 'self_pending' COMMENT '状态见 HrPerfConstants',
    self_score DECIMAL(6,2) DEFAULT NULL COMMENT '自评加权分',
    self_comment VARCHAR(1000) DEFAULT NULL COMMENT '自评评语',
    self_at DATETIME DEFAULT NULL COMMENT '自评提交时间',
    supervisor_score DECIMAL(6,2) DEFAULT NULL COMMENT '上级加权分',
    supervisor_comment VARCHAR(1000) DEFAULT NULL COMMENT '上级评语',
    supervisor_at DATETIME DEFAULT NULL COMMENT '上级提交时间',
    calibrated_score DECIMAL(6,2) DEFAULT NULL COMMENT '校准后得分',
    calibrated_grade VARCHAR(16) DEFAULT NULL COMMENT '校准后等级',
    calibrated_by VARCHAR(64) DEFAULT NULL COMMENT '校准备案人',
    calibrated_reason VARCHAR(500) DEFAULT NULL COMMENT '改判理由',
    final_score DECIMAL(6,2) DEFAULT NULL COMMENT '最终得分',
    final_grade VARCHAR(16) DEFAULT NULL COMMENT '最终等级',
    confirmed_at DATETIME DEFAULT NULL COMMENT '结果确认时间',
    applied_note VARCHAR(500) DEFAULT NULL COMMENT '结果应用说明',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_perf_assess_req (`req_no`),
    UNIQUE KEY uk_perf_assess_plan_user (`plan_id`, `user_id`),
    KEY idx_perf_assess_user (`user_id`, `status`),
    KEY idx_perf_assess_eval (`evaluator_user_id`, `status`),
    KEY idx_perf_assess_plan (`plan_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工考核单';

-- 指标打分明细
CREATE TABLE IF NOT EXISTS hr_perf_score_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    assessment_id BIGINT NOT NULL COMMENT '所属考核单',
    indicator_id BIGINT DEFAULT NULL COMMENT '来源指标',
    indicator_name VARCHAR(128) NOT NULL COMMENT '指标名称快照',
    weight DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '权重快照',
    target_value VARCHAR(500) DEFAULT NULL COMMENT '完成情况/实际值',
    self_score DECIMAL(6,2) DEFAULT NULL COMMENT '自评分',
    supervisor_score DECIMAL(6,2) DEFAULT NULL COMMENT '上级评分',
    final_score DECIMAL(6,2) DEFAULT NULL COMMENT '最终评分',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_perf_item_assess (`assessment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR指标打分明细';

-- 等级与指标类型字典
INSERT IGNORE INTO sys_hr_dict (dict_type, code, name, name_en, sort_order, status, created_by, updated_by) VALUES
  ('PERF_GRADE','S','S 卓越','S',1,1,'SYSTEM','SYSTEM'),
  ('PERF_GRADE','A','A 优秀','A',2,1,'SYSTEM','SYSTEM'),
  ('PERF_GRADE','B','B 合格','B',3,1,'SYSTEM','SYSTEM'),
  ('PERF_GRADE','C','C 待改进','C',4,1,'SYSTEM','SYSTEM'),
  ('PERF_GRADE','D','D 不合格','D',5,1,'SYSTEM','SYSTEM'),
  ('PERF_INDICATOR_TYPE','RESULT','業績','Result',1,1,'SYSTEM','SYSTEM'),
  ('PERF_INDICATOR_TYPE','COMPETENCY','能力','Competency',2,1,'SYSTEM','SYSTEM'),
  ('PERF_INDICATOR_TYPE','ATTITUDE','態度','Attitude',3,1,'SYSTEM','SYSTEM'),
  ('PERF_INDICATOR_TYPE','COMPLIANCE','合規','Compliance',4,1,'SYSTEM','SYSTEM');

-- 编号规则
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('hr_perf_cycle','考核周期編號','集團人事','PC','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('hr_perf_plan','考核計劃編號','集團人事','PP','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('hr_perf_assessment','考核單編號','集團人事','PH','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號');

-- 整批确认审批流程定义
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES ('hr_perf_confirm','績效結果確認','hr','RiseOutlined','考核計劃整批結果提交 HR 審批，通過後下發全部員工結果','oa_general',17,1);
