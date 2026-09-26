-- 201: P1 員工自助 · 證明開具（一次性参考文档；实际执行与幂等由 HrCertificateSchemaInitializer 负责）
--      版本键: hr:certificate-schema:v1.0（建表/种子） + hr:certificate-menu:v1.0（菜单/授权）
--      状态机与请假一致: draft -> pending -> (rejected | cancelled) / approved -> completed
--      审批通过只代表"同意开具"，纸质证明由人事线下出具，编号登记待 HR 开具台账迭代补充

CREATE TABLE IF NOT EXISTS hr_certificate_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '证明申请单编号(ZM+YYYYMMDD+4位序号)',
    user_id BIGINT NOT NULL COMMENT '申请人 sys_user.id',
    emp_name VARCHAR(64) NOT NULL COMMENT '申请人姓名快照',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '申请人工号快照',
    dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    cert_type VARCHAR(32) NOT NULL COMMENT '证明类型(HR字典 CERT_TYPE code)',
    purpose VARCHAR(200) NOT NULL COMMENT '证明用途',
    recipient VARCHAR(200) DEFAULT NULL COMMENT '证明抬头(致XX单位)',
    language VARCHAR(8) NOT NULL DEFAULT 'ZH' COMMENT '语种: ZH/EN/BOTH',
    copies INT NOT NULL DEFAULT 1 COMMENT '需要份数',
    expect_date DATE DEFAULT NULL COMMENT '期望取得日期',
    remark VARCHAR(500) DEFAULT NULL COMMENT '补充说明(申请人填写)',
    status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed',
    flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联OA流程编号',
    result_remark VARCHAR(500) DEFAULT NULL COMMENT '办理结果(审批通过后写入领取指引)',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_certificate_req_no (req_no),
    KEY idx_certificate_user (user_id, status),
    KEY idx_certificate_flow (flow_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR证明开具申请单';

-- 证明类型字典
INSERT IGNORE INTO sys_hr_dict (dict_type, code, name, name_en, sort_order, status, created_by, updated_by) VALUES
    ('CERT_TYPE', 'EMPLOYMENT', '在職證明', 'Employment Certificate', 1, 1, 'SYSTEM', 'SYSTEM'),
    ('CERT_TYPE', 'INCOME', '收入證明', 'Income Certificate', 2, 1, 'SYSTEM', 'SYSTEM'),
    ('CERT_TYPE', 'RESIGNATION', '離職證明', 'Separation Certificate', 3, 1, 'SYSTEM', 'SYSTEM'),
    ('CERT_TYPE', 'OTHER', '其他證明', 'Other Certificate', 4, 1, 'SYSTEM', 'SYSTEM');

-- 申请单编号规则
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('hr_certificate_request', '證明申請單編號', '集團人事', 'ZM', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

-- OA 流程定义（默认走 oa_general 节点链，可在「流程配置」单独编排）
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES ('hr_certificate', '證明開具', 'hr', 'FileProtectOutlined',
        '員工自助申請在職/收入等證明，審批通過後由人事線下開具', 'oa_general', 16, 1);

-- 菜单：ess-center(員工自助) 下新增 ess-certificate(證明開具)，system_code 沿用父域
-- 授权：admin 全量；employee_self_service 可自助申请与撤回本人单据
