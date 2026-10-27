-- 202: P1 績效考核 M2（结果台账/改判留痕/申诉登记）——一次性参考文档；
--      实际执行与幂等由 HrPerfReportSchemaInitializer 负责。
--      版本键: hr:performance-report:v1.0（表+字典+编号）+ hr:performance-report-menu:v1.0（菜单/授权/系统准入）
--      留痕口径: hr_perf_calibration_log 只增不改，一次动作一行（改判/申诉修订/分布例外/评估人改派）
--      例外放行是计划级动作（没有具体考核单），因此 assessment_id/user_id 可空，由服务层按 action 校验
--      申诉口径: 仅对 confirmed 结果可提；轻量登记不走 OA，HR 受理后可直接改判修订并回指本单

-- 改判留痕流水
CREATE TABLE IF NOT EXISTS hr_perf_calibration_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    assessment_id BIGINT DEFAULT NULL COMMENT '被改判的考核单(例外放行为计划级动作, 为空)',
    plan_id BIGINT DEFAULT NULL COMMENT '所属计划(冗余便于按计划筛)',
    user_id BIGINT DEFAULT NULL COMMENT '被考核人(例外放行为空)',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照',
    emp_name VARCHAR(64) DEFAULT NULL COMMENT '姓名快照',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门快照',
    action VARCHAR(24) NOT NULL COMMENT '动作: CALIBRATE/APPEAL_REVISE/DIST_WAIVER/REASSIGN',
    before_score DECIMAL(6,2) DEFAULT NULL COMMENT '改判前得分',
    before_grade VARCHAR(16) DEFAULT NULL COMMENT '改判前等级',
    after_score DECIMAL(6,2) DEFAULT NULL COMMENT '改判后得分',
    after_grade VARCHAR(16) DEFAULT NULL COMMENT '改判后等级',
    reason VARCHAR(500) DEFAULT NULL COMMENT '理由(改判与例外放行必填)',
    ref_appeal_id BIGINT DEFAULT NULL COMMENT '关联申诉单(APPEAL_REVISE 回填)',
    operator_user_id BIGINT DEFAULT NULL COMMENT '操作人ID(姓名可重名, 追责靠ID)',
    operator_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_perf_log_assessment (`assessment_id`),
    KEY idx_perf_log_plan (`plan_id`),
    KEY idx_perf_log_action (`action`),
    KEY idx_perf_log_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效改判留痕';

-- 申诉登记
CREATE TABLE IF NOT EXISTS hr_perf_appeal (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '申诉单号(PA+YYYYMMDD+4位)',
    assessment_id BIGINT NOT NULL COMMENT '被申诉的考核单',
    plan_id BIGINT DEFAULT NULL COMMENT '所属计划',
    user_id BIGINT NOT NULL COMMENT '申诉人(即被考核人)',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照',
    emp_name VARCHAR(64) DEFAULT NULL COMMENT '姓名快照',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门快照',
    plan_name VARCHAR(128) DEFAULT NULL COMMENT '计划名称快照',
    reason VARCHAR(500) NOT NULL COMMENT '申诉理由',
    expectation VARCHAR(500) DEFAULT NULL COMMENT '期望处理',
    status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/processing/resolved/rejected',
    handler_user_id BIGINT DEFAULT NULL COMMENT '受理人ID',
    handler_name VARCHAR(64) DEFAULT NULL COMMENT '受理人姓名快照',
    handled_at DATETIME DEFAULT NULL COMMENT '办结时间',
    conclusion VARCHAR(500) DEFAULT NULL COMMENT '处理结论(办结/驳回必填)',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_perf_appeal_req (`req_no`),
    KEY idx_perf_appeal_status (`status`),
    KEY idx_perf_appeal_user (`user_id`),
    KEY idx_perf_appeal_assessment (`assessment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效申诉登记';

-- 申诉状态字典
INSERT IGNORE INTO sys_hr_dict (dict_type, code, name, name_en, sort_order, status, created_by, updated_by) VALUES
  ('PERF_APPEAL_STATUS','pending','待受理','Pending',1,1,'SYSTEM','SYSTEM'),
  ('PERF_APPEAL_STATUS','processing','處理中','Processing',2,1,'SYSTEM','SYSTEM'),
  ('PERF_APPEAL_STATUS','resolved','已辦結','Resolved',3,1,'SYSTEM','SYSTEM'),
  ('PERF_APPEAL_STATUS','rejected','已駁回','Rejected',4,1,'SYSTEM','SYSTEM');

-- 申诉编号规则
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('hr_perf_appeal','绩效申诉編號','集團人事','PA','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號');
