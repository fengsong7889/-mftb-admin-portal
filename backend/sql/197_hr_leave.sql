-- 197: 集团人事(HR) P0 假期额度与请假申请
-- hr_leave_balance：员工×年度×假别的额度台账（年假/调休等按天扣减）；
-- hr_leave_request：请假申请单据，提交后关联 OA 流程（复用 biz_oa_process.oa_leave「請假申請」），
--                  审批通过回调把天数累计到 used_days；驳回只回写单据状态，不动额度。
-- 口径：天数按自然日计（含首尾两天）；剩余额度 = total + carried - used - 审批中占用。
-- 说明：本文件为一次性参考文档；实际建表 + 字典种子 + 后置校验由 HrLeaveSchemaInitializer 的
--       applyOnce("hr:leave-schema:v1.0", task, verify) 负责，并登记 catalog.json 与 ContractRegistry。

CREATE TABLE IF NOT EXISTS hr_leave_balance (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id      BIGINT       NOT NULL COMMENT '关联 sys_user.id',
    emp_no       VARCHAR(32)  DEFAULT NULL COMMENT '员工工号快照',
    year         INT          NOT NULL COMMENT '额度过期年度(自然年)',
    leave_type   VARCHAR(32)  NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE 的 code)',
    total_days   DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '年度授予天数',
    carried_days DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '上年结转天数',
    used_days    DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '已使用天数(审批通过的请假累计)',
    remark       VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by   VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by   VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_leave_balance_user_year_type (user_id, year, leave_type),
    KEY idx_leave_balance_year_type (year, leave_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期额度台账';

CREATE TABLE IF NOT EXISTS hr_leave_request (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no      VARCHAR(32)  NOT NULL COMMENT '请假单编号(LQ+YYYYMMDD+4位序号)',
    user_id     BIGINT       NOT NULL COMMENT '请假人 sys_user.id',
    emp_name    VARCHAR(64)  NOT NULL COMMENT '请假人姓名快照',
    emp_no      VARCHAR(32)  DEFAULT NULL COMMENT '请假人工号快照',
    dept_name   VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    year        INT          NOT NULL COMMENT '所属年度(按开始日期)',
    leave_type  VARCHAR(32)  NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE code)',
    start_date  DATE         NOT NULL COMMENT '请假开始日期',
    end_date    DATE         NOT NULL COMMENT '请假结束日期',
    days        DECIMAL(4,1) NOT NULL COMMENT '请假天数(自然日,含首尾)',
    reason      VARCHAR(512) DEFAULT NULL COMMENT '请假事由',
    status      VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed',
    flow_no     VARCHAR(64)  DEFAULT NULL COMMENT '关联OA流程编号(biz_oa_request.flow_no)',
    remark      VARCHAR(512) DEFAULT NULL COMMENT '备注/办理结果',
    created_by  VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by  VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted     TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_leave_request_req_no (req_no),
    KEY idx_leave_request_user (user_id, year),
    KEY idx_leave_request_status (status, leave_type),
    KEY idx_leave_request_flow (flow_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR请假申请单据';

-- 假期类型字典种子（与 HrLeaveSchemaInitializer 同构）
INSERT IGNORE INTO sys_hr_dict (dict_type, code, name, name_en, sort_order, status, created_by, updated_by) VALUES
    ('LEAVE_TYPE', 'ANNUAL',  '年假',   'Annual Leave',     1, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'PERSONAL','事假',   'Personal Leave',   2, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'SICK',    '病假',   'Sick Leave',       3, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'MARRIAGE','婚假',   'Marriage Leave',   4, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'MATERNITY','产假',  'Maternity Leave',  5, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'BEREAVEMENT','丧假','Bereavement Leave',6, 1, 'SYSTEM', 'SYSTEM'),
    ('LEAVE_TYPE', 'COMPENSATORY','调休','Compensatory Leave',7, 1, 'SYSTEM', 'SYSTEM');

-- 请假单编号规则（LQ + YYYYMMDD + 4位）
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('hr_leave_request', '請假單編號', '集團人事', 'LQ', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號');
