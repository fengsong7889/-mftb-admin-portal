-- ============================================================
-- 108_oa_process.sql
-- OA中心：流程中心 + 流程事项 建表 & 种子数据
-- ============================================================

-- 1. 流程定义表（流程中心展示的流程类型）
CREATE TABLE IF NOT EXISTS biz_oa_process (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    process_code  VARCHAR(32)  NOT NULL COMMENT '流程编码(如 oa_leave)',
    process_name  VARCHAR(64)  NOT NULL COMMENT '流程名称',
    category      VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT '分类: office/finance/hr/general',
    icon          VARCHAR(64)  DEFAULT NULL COMMENT '图标标识',
    description   VARCHAR(200) DEFAULT NULL COMMENT '流程说明',
    workflow_type VARCHAR(32)  DEFAULT NULL COMMENT '关联 biz_workflow_config.flow_type',
    form_schema   TEXT         DEFAULT NULL COMMENT '表单字段定义JSON',
    sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序',
    status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_oa_process_code (process_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程定义表';

-- 2. 流程实例表
CREATE TABLE IF NOT EXISTS biz_oa_request (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    flow_no           VARCHAR(32)  NOT NULL COMMENT '流程编号',
    process_code      VARCHAR(32)  NOT NULL COMMENT '关联流程定义编码',
    title             VARCHAR(200) NOT NULL COMMENT '流程标题',
    form_data         TEXT         DEFAULT NULL COMMENT '表单数据JSON',
    applicant         VARCHAR(64)  NOT NULL COMMENT '申请人',
    flow_status       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled',
    current_node_name VARCHAR(64)  DEFAULT NULL COMMENT '当前待审节点名称',
    reject_reason     VARCHAR(500) DEFAULT NULL COMMENT '驳回理由',
    apply_time        DATETIME     DEFAULT NULL COMMENT '申请时间',
    complete_time     DATETIME     DEFAULT NULL COMMENT '完成时间',
    cancel_time       DATETIME     DEFAULT NULL COMMENT '撤销时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_oa_request_flow_no (flow_no),
    KEY idx_oa_request_applicant (applicant),
    KEY idx_oa_request_status (flow_status),
    KEY idx_oa_request_process (process_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程实例表';

-- 3. 审批任务表（每个审批节点一条记录）
CREATE TABLE IF NOT EXISTS biz_oa_approval_task (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    request_id     BIGINT       NOT NULL COMMENT '关联流程实例ID',
    node_name      VARCHAR(64)  NOT NULL COMMENT '审批节点名称',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '节点顺序',
    approval_rule  VARCHAR(16)  NOT NULL DEFAULT 'any' COMMENT 'any=或签 / all=会签',
    approver       VARCHAR(64)  DEFAULT NULL COMMENT '审批人',
    task_status    VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
    approve_time   DATETIME     DEFAULT NULL COMMENT '审批时间',
    comment        VARCHAR(500) DEFAULT NULL COMMENT '审批意见',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_oa_task_request (request_id),
    KEY idx_oa_task_approver (approver),
    KEY idx_oa_task_status (task_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA审批任务表';

-- 4. 种子数据：OA流程定义
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES
    ('oa_leave',    '請假申請',   'hr',      'CalendarOutlined',    '員工請假申請流程',         'oa_general', 1, 1),
    ('oa_reimburse','報銷申請',   'finance', 'DollarOutlined',      '費用報銷申請流程',         'oa_general', 2, 1),
    ('oa_purchase', '採購申請',   'finance', 'ShoppingCartOutlined', '辦公物資採購申請流程',     'oa_general', 3, 1),
    ('oa_seal',     '用章申請',   'office',  'AuditOutlined',       '公章使用申請流程',         'oa_general', 4, 1),
    ('oa_general',  '通用審批',   'general', 'FormOutlined',        '通用審批流程，適用於一般事項', 'oa_general', 5, 1);

-- 5. 流程配置：OA通用审批流程（如果不存在则插入）
INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description)
VALUES ('oa_general', 'OA通用審批', 1, 'OA中心通用審批流程，默認一級審批');

-- 6. 编号规则：OA流程编号
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, prefix, date_format, seq_length, seq_start, status, description)
VALUES ('oa_request', 'OA', 'YYYYMMDD', 4, 1, 1, 'OA流程編號');

-- 7. 补充 oa-requests 菜单权限（admin 角色）
INSERT INTO sys_role_menu (role_id, menu_id, actions)
SELECT
    r.id,
    m.id,
    '["view","create","edit"]'
FROM sys_role r
CROSS JOIN sys_menu m
WHERE r.role_key = 'admin' AND r.deleted = 0
  AND m.menu_key = 'oa-requests' AND m.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );

-- 验证
SELECT process_code, process_name, category, status FROM biz_oa_process ORDER BY sort_order;
