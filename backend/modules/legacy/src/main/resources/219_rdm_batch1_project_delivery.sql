-- 219: 產研交付（RDM）Batch 1 — 項目交付與質量管理
--      版本键: rdm:schema:v3.0（10 张新表）
--      方言：MySQL 8.x，全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，可重复执行（幂等）。
--      ALTER TABLE 新增列由 RdmSchemaMigrationInitializer 逐列条件添加。

-- ── 1. 项目主表 ──
CREATE TABLE IF NOT EXISTS rdm_project (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    project_no VARCHAR(32) NOT NULL COMMENT '项目编号',
    name VARCHAR(200) NOT NULL COMMENT '项目名称',
    objective TEXT COMMENT '项目目标',
    pm_user_id BIGINT COMMENT '项目经理用户ID',
    pm_user_name VARCHAR(64) COMMENT '项目经理姓名',
    product_owner_user_id BIGINT COMMENT '产品负责人用户ID',
    product_owner_user_name VARCHAR(64) COMMENT '产品负责人姓名',
    plan_start_date DATE COMMENT '计划开始日期',
    plan_end_date DATE COMMENT '计划结束日期',
    default_acceptance_path VARCHAR(10) NOT NULL DEFAULT 'A' COMMENT '默认验收路径(A=先验收后上线,B=先上线后验收)',
    status VARCHAR(32) NOT NULL DEFAULT 'preparing' COMMENT '状态:preparing/in_progress/partial_delivered/all_delivered/closed',
    paused_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '暂停标记',
    risk_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '风险标记',
    overdue_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逾期标记',
    scope_summary_json JSON COMMENT '范围摘要JSON',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_project_no (project_no),
    KEY idx_pm_user (pm_user_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM项目';

-- ── 2. 项目成员 ──
CREATE TABLE IF NOT EXISTS rdm_project_member (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '项目ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    emp_no VARCHAR(32) COMMENT '工号',
    user_name VARCHAR(64) COMMENT '姓名',
    role_code VARCHAR(32) NOT NULL COMMENT '角色:pm/product/dev_lead/dev/qa/designer/pmo',
    join_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    leave_time DATETIME COMMENT '离开时间',
    KEY idx_project (project_id),
    KEY idx_user (user_id),
    UNIQUE KEY uk_project_user_role (project_id, user_id, role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM项目成员';

-- ── 3. 交付项 ──
CREATE TABLE IF NOT EXISTS rdm_delivery_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    item_no VARCHAR(32) NOT NULL COMMENT '交付项编号',
    req_id BIGINT NOT NULL COMMENT '关联需求ID',
    project_id BIGINT COMMENT '关联项目ID',
    title VARCHAR(200) NOT NULL COMMENT '交付项标题',
    scope_desc TEXT COMMENT '范围描述',
    acceptance_criteria TEXT COMMENT '验收标准',
    scope_version INT NOT NULL DEFAULT 1 COMMENT '范围版本号',
    prd_snapshot_id BIGINT COMMENT 'PRD快照ID',
    coordinator_user_id BIGINT COMMENT '协调人用户ID',
    coordinator_user_name VARCHAR(64) COMMENT '协调人姓名',
    product_acceptor_user_id BIGINT COMMENT '产品验收人ID',
    product_acceptor_user_name VARCHAR(64) COMMENT '产品验收人姓名',
    biz_acceptor_user_id BIGINT COMMENT '业务验收人ID',
    biz_acceptor_user_name VARCHAR(64) COMMENT '业务验收人姓名',
    acceptance_path VARCHAR(10) NOT NULL DEFAULT 'A' COMMENT '验收路径A/B',
    plan_start_date DATE COMMENT '计划开始',
    plan_end_date DATE COMMENT '计划结束',
    status VARCHAR(32) NOT NULL DEFAULT 'preparing' COMMENT '状态:preparing/developing/testing/pending_acceptance/pending_release/released_pending/done',
    blocked_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '阻塞标记',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_item_no (item_no),
    KEY idx_req (req_id),
    KEY idx_project (project_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM交付项';

-- ── 4. 提测批次 ──
CREATE TABLE IF NOT EXISTS rdm_test_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    batch_no VARCHAR(32) NOT NULL COMMENT '提测批次号',
    req_id BIGINT COMMENT '关联需求ID',
    delivery_item_ids_json JSON COMMENT '交付项ID列表',
    scope_snapshot_json JSON COMMENT '范围快照',
    build_ids_json JSON COMMENT '构建标识列表',
    test_env VARCHAR(32) NOT NULL DEFAULT 'uat' COMMENT '测试环境',
    test_lead_user_id BIGINT COMMENT '测试负责人ID',
    test_lead_user_name VARCHAR(64) COMMENT '测试负责人姓名',
    executor_user_ids_json JSON COMMENT '执行人ID列表',
    plan_end_time DATETIME COMMENT '计划结束时间',
    status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态:pending/accepted/returned/executing/passed/failed',
    round_no INT NOT NULL DEFAULT 1 COMMENT '轮次',
    returned_reason TEXT COMMENT '退回原因',
    applicant_user_id BIGINT COMMENT '申请人ID',
    applicant_user_name VARCHAR(64) COMMENT '申请人姓名',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_batch_no (batch_no),
    KEY idx_req (req_id),
    KEY idx_test_lead (test_lead_user_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM提测批次';

-- ── 5. 测试执行记录 ──
CREATE TABLE IF NOT EXISTS rdm_test_execution (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    batch_id BIGINT NOT NULL COMMENT '批次ID',
    delivery_item_id BIGINT COMMENT '交付项ID',
    case_title VARCHAR(300) COMMENT '用例标题',
    executor_user_id BIGINT NOT NULL COMMENT '执行人ID',
    executor_user_name VARCHAR(64) COMMENT '执行人姓名',
    build_id VARCHAR(100) COMMENT '构建标识',
    test_env VARCHAR(32) COMMENT '测试环境',
    result VARCHAR(16) NOT NULL COMMENT '结果:pass/fail/blocked/skip',
    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
    remark TEXT COMMENT '备注',
    round_no INT NOT NULL DEFAULT 1 COMMENT '轮次',
    KEY idx_batch (batch_id),
    KEY idx_delivery_item (delivery_item_id),
    KEY idx_executor (executor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM测试执行记录';

-- ── 6. 问题 ──
CREATE TABLE IF NOT EXISTS rdm_issue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    issue_no VARCHAR(32) NOT NULL COMMENT '问题编号',
    source_type VARCHAR(32) NOT NULL COMMENT '来源:test/product_acceptance/biz_acceptance',
    source_id BIGINT COMMENT '来源记录ID',
    req_id BIGINT COMMENT '需求ID',
    delivery_item_id BIGINT COMMENT '交付项ID',
    scope_version INT COMMENT '范围版本',
    build_id VARCHAR(100) COMMENT '构建标识',
    title VARCHAR(300) NOT NULL COMMENT '问题标题',
    description TEXT COMMENT '问题描述',
    impact TEXT COMMENT '影响描述',
    severity VARCHAR(16) NOT NULL DEFAULT 'minor' COMMENT '严重程度:critical/major/minor/trivial',
    owner_user_id BIGINT COMMENT '负责人ID',
    owner_user_name VARCHAR(64) COMMENT '负责人姓名',
    status VARCHAR(32) NOT NULL DEFAULT 'open' COMMENT '状态:open/processing/pending_verify/resolved/deferred',
    reporter_user_id BIGINT COMMENT '报告人ID',
    reporter_user_name VARCHAR(64) COMMENT '报告人姓名',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_issue_no (issue_no),
    KEY idx_req (req_id),
    KEY idx_delivery_item (delivery_item_id),
    KEY idx_owner (owner_user_id),
    KEY idx_status (status),
    KEY idx_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM问题';

-- ── 7. 问题延期决定 ──
CREATE TABLE IF NOT EXISTS rdm_issue_defer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    issue_id BIGINT NOT NULL COMMENT '问题ID',
    reason TEXT NOT NULL COMMENT '延期原因',
    impact_desc TEXT COMMENT '影响描述',
    mitigation TEXT COMMENT '临时措施',
    target_version VARCHAR(100) NOT NULL COMMENT '目标版本',
    owner_user_id BIGINT COMMENT '后续责任人ID',
    owner_user_name VARCHAR(64) COMMENT '后续责任人姓名',
    due_at DATE NOT NULL COMMENT '截止日期',
    product_decision VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '产品决定:pending/approved/rejected',
    product_decide_user_id BIGINT COMMENT '产品决定人ID',
    product_decide_user_name VARCHAR(64) COMMENT '产品决定人姓名',
    product_decide_time DATETIME COMMENT '产品决定时间',
    product_decide_reason TEXT COMMENT '产品决定理由',
    biz_decision VARCHAR(16) NOT NULL DEFAULT 'not_required' COMMENT '业务决定:pending/approved/rejected/not_required',
    biz_decide_user_id BIGINT COMMENT '业务决定人ID',
    biz_decide_user_name VARCHAR(64) COMMENT '业务决定人姓名',
    biz_decide_time DATETIME COMMENT '业务决定时间',
    biz_decide_reason TEXT COMMENT '业务决定理由',
    follow_up_req_id BIGINT COMMENT '承接需求ID',
    follow_up_req_no VARCHAR(32) COMMENT '承接需求编号',
    status VARCHAR(32) NOT NULL DEFAULT 'pending_product' COMMENT '状态:pending_product/pending_biz/pending_bind/effective/rejected',
    applicant_user_id BIGINT COMMENT '申请人ID',
    applicant_user_name VARCHAR(64) COMMENT '申请人姓名',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_issue (issue_id),
    KEY idx_status (status),
    KEY idx_follow_up (follow_up_req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM问题延期决定';

-- ── 8. 发布批次 ──
CREATE TABLE IF NOT EXISTS rdm_release_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    batch_no VARCHAR(32) NOT NULL COMMENT '发布批次号',
    version_tag VARCHAR(100) NOT NULL COMMENT '版本标识',
    req_id BIGINT COMMENT '关联需求ID(主需求)',
    project_id BIGINT COMMENT '关联项目ID',
    scope_snapshot_json JSON COMMENT '范围快照',
    release_owner_user_id BIGINT COMMENT '发布负责人ID',
    release_owner_user_name VARCHAR(64) COMMENT '发布负责人姓名',
    plan_time DATETIME COMMENT '计划发布时间',
    status VARCHAR(32) NOT NULL DEFAULT 'planning' COMMENT '状态:planning/checking/approved/deploying/verifying/released/rolled_back/cancelled',
    approval_user_id BIGINT COMMENT '审批人ID',
    approval_user_name VARCHAR(64) COMMENT '审批人姓名',
    approval_time DATETIME COMMENT '审批时间',
    applicant_user_id BIGINT COMMENT '申请人ID',
    applicant_user_name VARCHAR(64) COMMENT '申请人姓名',
    rollback_reason TEXT COMMENT '回滚原因',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_batch_no (batch_no),
    KEY idx_project (project_id),
    KEY idx_status (status),
    KEY idx_release_owner (release_owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM发布批次';

-- ── 9. 发布部署记录 ──
CREATE TABLE IF NOT EXISTS rdm_release_deployment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    release_batch_id BIGINT NOT NULL COMMENT '发布批次ID',
    system_code VARCHAR(64) NOT NULL COMMENT '系统编码',
    system_name VARCHAR(128) COMMENT '系统名称',
    build_id VARCHAR(100) COMMENT '构建标识',
    deploy_order INT NOT NULL DEFAULT 1 COMMENT '部署顺序',
    deploy_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '部署状态:pending/deploying/success/failed/rolled_back',
    deploy_time DATETIME COMMENT '部署时间',
    verify_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '验证状态:pending/passed/failed',
    verify_time DATETIME COMMENT '验证时间',
    open_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '开放状态:pending/opened/not_opened',
    open_time DATETIME COMMENT '开放时间',
    rollback_reason TEXT COMMENT '回滚原因',
    attempt_no INT NOT NULL DEFAULT 1 COMMENT '尝试次数',
    operator_user_id BIGINT COMMENT '操作人ID',
    operator_user_name VARCHAR(64) COMMENT '操作人姓名',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_release_batch (release_batch_id),
    KEY idx_system (system_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM发布部署记录';

-- ── 10. 验收记录(交付项级) ──
CREATE TABLE IF NOT EXISTS rdm_acceptance_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    record_no VARCHAR(32) NOT NULL COMMENT '验收记录编号',
    delivery_item_id BIGINT NOT NULL COMMENT '交付项ID',
    req_id BIGINT COMMENT '需求ID',
    acceptance_type VARCHAR(16) NOT NULL COMMENT '验收类型:product/business',
    stage VARCHAR(16) NOT NULL DEFAULT 'pre_release' COMMENT '时点:pre_release/post_release',
    scope_version INT COMMENT '范围版本',
    build_id VARCHAR(100) COMMENT '构建标识',
    test_env VARCHAR(32) COMMENT '测试环境',
    conclusion VARCHAR(16) NOT NULL COMMENT '结论:pass/fail/conditional',
    score TINYINT COMMENT '业务评分1-5',
    opinion TEXT COMMENT '验收意见',
    signer_user_id BIGINT NOT NULL COMMENT '签署人ID',
    signer_user_name VARCHAR(64) NOT NULL COMMENT '签署人姓名',
    round_no INT NOT NULL DEFAULT 1 COMMENT '轮次',
    conditions_json JSON COMMENT '附条件通过的条件',
    evidence_json JSON COMMENT '验收证据',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_record_no (record_no),
    KEY idx_delivery_item (delivery_item_id),
    KEY idx_req (req_id),
    KEY idx_type_stage (acceptance_type, stage),
    KEY idx_signer (signer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM验收记录(交付项级)';

-- ── 编号规则种子（ON DUPLICATE KEY UPDATE 避免 prefix/rule_key 唯一键冲突导致静默跳过） ──
INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_project', '項目編號', '產研交付', 'PJ', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();

INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_delivery_item', '交付項編號', '產研交付', 'JF', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();

INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_test_batch', '提測批次號', '產研交付', 'TC', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();

INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_issue', '問題編號', '產研交付', 'WT', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();

INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_release_batch', '發布批次號', '產研交付', 'FB', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();

INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('rdm_acceptance_record', '驗收記錄編號', '產研交付', 'YS', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_key = VALUES(rule_key), rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), status = 1, updated_at = NOW();
