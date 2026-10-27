-- 291: 企业 Agent 平台核心域（应用/预算池/动作提案/知识 ACL/数据分级与端点批准/持久运行/评测发布）
-- 全部为新增表，不改动既有表结构；MySQL 8，禁止破坏性语句。

CREATE TABLE IF NOT EXISTS ai_application (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_key VARCHAR(64) NOT NULL COMMENT '稳定应用标识，发布后不可改',
  name VARCHAR(128) NOT NULL,
  system_code VARCHAR(32) NOT NULL DEFAULT 'common' COMMENT '所属业务域，不是租户隔离',
  owner_user_id BIGINT DEFAULT NULL COMMENT '业务负责人 sys_user.id',
  owner_name VARCHAR(64) DEFAULT NULL,
  purpose VARCHAR(512) DEFAULT NULL,
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  published_version INT NOT NULL DEFAULT 0 COMMENT '当前生产版本号，0=未发布',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_app_key (app_key),
  KEY idx_app_system (system_code, status)
) COMMENT='Agent 应用注册表';

CREATE TABLE IF NOT EXISTS ai_application_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/published/retired',
  model_key VARCHAR(128) DEFAULT NULL,
  prompt_profile_key VARCHAR(64) DEFAULT NULL,
  tool_whitelist_json TEXT COMMENT '允许的工具 key 数组；空=不允许任何业务工具',
  knowledge_systems_json VARCHAR(255) DEFAULT NULL COMMENT '允许检索的知识系统编码数组',
  budget_scope_type VARCHAR(16) DEFAULT 'USER' COMMENT 'USER/DEPT/APP',
  budget_scope_key VARCHAR(64) DEFAULT NULL,
  change_note VARCHAR(512) DEFAULT NULL,
  published_at DATETIME DEFAULT NULL,
  published_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_app_version (app_id, version_no),
  KEY idx_app_version_status (app_id, status)
) COMMENT='Agent 应用版本（不可变快照，发布后不再修改）';

CREATE TABLE IF NOT EXISTS ai_budget_pool (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scope_type VARCHAR(16) NOT NULL COMMENT 'USER/DEPT/APP',
  scope_key VARCHAR(64) NOT NULL,
  period VARCHAR(16) NOT NULL COMMENT 'YYYY-MM 或 ALL',
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  limit_amount DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '预算上限（元）',
  reserved_amount DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '已预占',
  used_amount DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '已结算',
  status TINYINT NOT NULL DEFAULT 1,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pool_scope (scope_type, scope_key, period, currency),
  KEY idx_pool_status (status)
) COMMENT='AI 预算池（原子预占，已用+已预占+本次<=上限）';

CREATE TABLE IF NOT EXISTS ai_action_proposal (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  proposal_no VARCHAR(48) NOT NULL,
  app_key VARCHAR(64) DEFAULT NULL,
  tool_key VARCHAR(64) NOT NULL,
  tool_version INT NOT NULL DEFAULT 1,
  params_json MEDIUMTEXT NOT NULL COMMENT '冻结参数原文（不含凭据）',
  params_hash CHAR(64) NOT NULL COMMENT '规范化参数 SHA-256',
  target_resource VARCHAR(255) DEFAULT NULL,
  target_version VARCHAR(64) DEFAULT NULL,
  impact_summary VARCHAR(512) DEFAULT NULL,
  requester VARCHAR(64) NOT NULL COMMENT '申请人登录账号',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/expired/executing/executed/unknown/failed/cancelled',
  approval_ref VARCHAR(128) DEFAULT NULL COMMENT 'OA 流程号或外部审批引用',
  approved_by VARCHAR(64) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  idempotency_key VARCHAR(96) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_proposal_no (proposal_no),
  UNIQUE KEY uk_proposal_idem (idempotency_key),
  KEY idx_proposal_requester (requester, status),
  KEY idx_proposal_status (status, expires_at)
) COMMENT='动作提案：冻结参数+审批绑定+一次性消费';

CREATE TABLE IF NOT EXISTS ai_action_receipt (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  proposal_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL COMMENT 'accepted/delivered/failed/unknown',
  external_ref VARCHAR(128) DEFAULT NULL,
  payload_digest CHAR(64) DEFAULT NULL,
  detail VARCHAR(512) DEFAULT NULL,
  reconciled TINYINT NOT NULL DEFAULT 0 COMMENT '1=已人工对账',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_proposal (proposal_id),
  KEY idx_receipt_status (status, reconciled)
) COMMENT='动作执行回执；外部超时先记 unknown，禁止盲目重发';

CREATE TABLE IF NOT EXISTS ai_knowledge_acl (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_id BIGINT NOT NULL,
  subject_type VARCHAR(16) NOT NULL COMMENT 'USER/DEPT/ROLE/ROLE_CODE',
  subject_id VARCHAR(64) NOT NULL,
  permission VARCHAR(16) NOT NULL DEFAULT 'read',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_acl_subject (doc_id, subject_type, subject_id, permission),
  KEY idx_acl_subject_lookup (subject_type, subject_id, permission)
) COMMENT='知识文档收窄 ACL；无匹配行=不可检索（fail-closed）';

CREATE TABLE IF NOT EXISTS ai_data_class_policy (
  system_code VARCHAR(32) PRIMARY KEY,
  data_class VARCHAR(16) NOT NULL COMMENT 'PUBLIC/INTERNAL/SENSITIVE/RESTRICTED',
  note VARCHAR(255) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='业务系统数据分级；未登记=UNCLASSIFIED，禁止外发';

CREATE TABLE IF NOT EXISTS ai_endpoint_approval (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  model_key VARCHAR(128) NOT NULL,
  max_data_class VARCHAR(16) NOT NULL COMMENT '该端点允许接收的最高数据等级',
  residency VARCHAR(16) NOT NULL DEFAULT 'external' COMMENT 'external/private',
  status TINYINT NOT NULL DEFAULT 1,
  approved_by VARCHAR(64) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  note VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_endpoint_model (model_key)
) COMMENT='模型端点数据准入批准；private 标签本身不等于批准';

CREATE TABLE IF NOT EXISTS ai_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_no VARCHAR(48) NOT NULL,
  app_key VARCHAR(64) DEFAULT NULL,
  app_version INT DEFAULT NULL,
  requester VARCHAR(64) NOT NULL,
  system_code VARCHAR(32) NOT NULL DEFAULT 'common',
  conversation_pk BIGINT DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'queued/running/waiting_approval/succeeded/failed/cancelled/unknown',
  idempotency_key VARCHAR(96) NOT NULL,
  input_json MEDIUMTEXT DEFAULT NULL,
  result_json MEDIUMTEXT DEFAULT NULL,
  error_kind VARCHAR(64) DEFAULT NULL,
  cancel_requested TINYINT NOT NULL DEFAULT 0,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_run_no (run_no),
  UNIQUE KEY uk_run_idem (idempotency_key),
  KEY idx_run_status (status, created_at)
) COMMENT='持久化运行；浏览器关闭后仍可恢复查看';

CREATE TABLE IF NOT EXISTS ai_run_step (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_id BIGINT NOT NULL,
  step_no INT NOT NULL,
  step_type VARCHAR(32) NOT NULL COMMENT 'MODEL/TOOL/APPROVAL/NOTICE',
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  tool_key VARCHAR(64) DEFAULT NULL,
  proposal_id BIGINT DEFAULT NULL,
  detail VARCHAR(512) DEFAULT NULL,
  elapsed_ms BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_run_step (run_id, step_no),
  KEY idx_step_status (run_id, status)
) COMMENT='运行步骤检查点';

CREATE TABLE IF NOT EXISTS ai_eval_case (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dataset_key VARCHAR(64) NOT NULL,
  case_no VARCHAR(32) NOT NULL,
  system_code VARCHAR(32) NOT NULL DEFAULT 'common',
  actor VARCHAR(64) DEFAULT NULL COMMENT '固定测试身份',
  input_text TEXT NOT NULL,
  expect_json TEXT COMMENT '确定性断言：工具、拒绝、引用等',
  must_pass TINYINT NOT NULL DEFAULT 1 COMMENT '1=安全类零容忍',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eval_case (dataset_key, case_no)
) COMMENT='评测用例（固定输入与确定性期望）';

CREATE TABLE IF NOT EXISTS ai_eval_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dataset_key VARCHAR(64) NOT NULL,
  app_key VARCHAR(64) DEFAULT NULL,
  app_version INT DEFAULT NULL,
  total INT NOT NULL DEFAULT 0,
  passed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  detail_json MEDIUMTEXT DEFAULT NULL,
  started_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eval_run_dataset (dataset_key, created_at)
) COMMENT='评测执行记录（不替代真实业务验收）';

CREATE TABLE IF NOT EXISTS ai_release_snapshot (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_key VARCHAR(64) NOT NULL,
  app_version INT NOT NULL,
  snapshot_json MEDIUMTEXT NOT NULL COMMENT '应用、Prompt、工具、知识、策略冻结快照',
  released_by VARCHAR(64) DEFAULT NULL,
  released_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rolled_back_at DATETIME DEFAULT NULL,
  note VARCHAR(512) DEFAULT NULL,
  UNIQUE KEY uk_release (app_key, app_version)
) COMMENT='不可变发布快照，支持回滚与追溯';
