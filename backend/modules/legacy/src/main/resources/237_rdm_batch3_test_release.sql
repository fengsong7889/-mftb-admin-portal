-- 237: RDM 第三批共享事实与原子请求基础，版本 rdm:schema:v3.2。
-- 仅由 RdmSchemaMigrationInitializer 在数据库命名锁内执行。
-- ALTER 逐项查询 information_schema 后执行，脚本不供直接整份重复运行。
-- 不回填历史测试、验收、批准或已解决事实。JSON 列继续由 Java String 承载。
CREATE TABLE IF NOT EXISTS rdm_test_round (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    round_no INT NOT NULL,
    scope_snapshot_json JSON NOT NULL COMMENT '交付项+scopeVersion+PRD+标准快照',
    build_mapping_json JSON NOT NULL COMMENT '交付项+系统+构建映射',
    test_env VARCHAR(32) NOT NULL,
    case_snapshot_json JSON NOT NULL COMMENT '交付项+稳定caseId+标题+mandatory冻结集合',
    executor_user_ids_json JSON NOT NULL,
    frozen_at DATETIME NOT NULL,
    frozen_by BIGINT NOT NULL COMMENT '认证SysUser.id',
    evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_test_round (batch_id, round_no),
    CONSTRAINT fk_rdm_round_batch FOREIGN KEY (batch_id) REFERENCES rdm_test_batch(id),
    CONSTRAINT ck_rdm_round_no CHECK (round_no > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可变测试轮次';

CREATE TABLE IF NOT EXISTS rdm_release_approval (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    release_batch_id BIGINT NOT NULL,
    application_version INT NOT NULL COMMENT '申请时批次并发版本，非范围版本',
    action VARCHAR(16) NOT NULL COMMENT 'apply/decide',
    decision VARCHAR(16) DEFAULT NULL,
    snapshot_json JSON NOT NULL,
    evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason TEXT NOT NULL,
    operator_user_id BIGINT NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_release_approval (release_batch_id, application_version, action),
    CONSTRAINT fk_rdm_approval_batch FOREIGN KEY (release_batch_id) REFERENCES rdm_release_batch(id),
    CONSTRAINT ck_rdm_approval_action CHECK (action IN ('apply','decide')),
    CONSTRAINT ck_rdm_approval_decision CHECK ((action = 'apply' AND decision IS NULL) OR (action = 'decide' AND decision IS NOT NULL AND decision IN ('approved','rejected')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式发布申请裁决事实';

CREATE TABLE IF NOT EXISTS rdm_release_attempt (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    release_batch_id BIGINT NOT NULL,
    deployment_id BIGINT NOT NULL COMMENT '复用逐系统部署清单',
    attempt_no INT NOT NULL,
    action VARCHAR(16) NOT NULL COMMENT 'deploy/verify/open/rollback',
    result VARCHAR(32) NOT NULL,
    build_id VARCHAR(100) NOT NULL,
    test_env VARCHAR(32) NOT NULL,
    approval_id BIGINT NOT NULL,
    scope_snapshot_json JSON NOT NULL,
    evidence_json JSON NOT NULL,
    evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason TEXT,
    operator_user_id BIGINT NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    occurred_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_release_attempt (deployment_id, action, attempt_no),
    KEY idx_rdm_attempt_batch (release_batch_id, created_at),
    CONSTRAINT fk_rdm_attempt_batch FOREIGN KEY (release_batch_id) REFERENCES rdm_release_batch(id),
    CONSTRAINT fk_rdm_attempt_deployment FOREIGN KEY (deployment_id) REFERENCES rdm_release_deployment(id),
    CONSTRAINT fk_rdm_attempt_approval FOREIGN KEY (approval_id) REFERENCES rdm_release_approval(id),
    CONSTRAINT ck_rdm_attempt_no CHECK (attempt_no > 0),
    CONSTRAINT ck_rdm_attempt_action CHECK (action IN ('deploy','verify','open','rollback'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式部署验证开放回滚事实';

CREATE TABLE IF NOT EXISTS rdm_release_exemption (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    release_batch_id BIGINT NOT NULL,
    application_version INT NOT NULL,
    applicant_user_id BIGINT NOT NULL,
    reason TEXT NOT NULL,
    risk TEXT NOT NULL,
    missing_acceptance_json JSON NOT NULL,
    scope_snapshot_json JSON NOT NULL,
    build_mapping_json JSON NOT NULL,
    rollback_plan TEXT NOT NULL,
    supplementary_plan_json JSON NOT NULL COMMENT '交付项+产品补验人+冻结截止时间+日历版本',
    evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_exemption_application (release_batch_id, application_version),
    CONSTRAINT fk_rdm_exemption_batch FOREIGN KEY (release_batch_id) REFERENCES rdm_release_batch(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可变紧急产品豁免申请';

CREATE TABLE IF NOT EXISTS rdm_release_exemption_decision (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    exemption_id BIGINT NOT NULL,
    decision_type VARCHAR(16) NOT NULL COMMENT 'product_risk/release',
    decision VARCHAR(16) NOT NULL,
    reason TEXT NOT NULL,
    signer_user_id BIGINT NOT NULL,
    evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_exemption_decision (exemption_id, decision_type),
    CONSTRAINT fk_rdm_exemption_decision FOREIGN KEY (exemption_id) REFERENCES rdm_release_exemption(id),
    CONSTRAINT ck_rdm_exemption_decision_type CHECK (decision_type IN ('product_risk','release')),
    CONSTRAINT ck_rdm_exemption_decision CHECK (decision IN ('approved','rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式产品风险确认和独立发布审批';

CREATE TABLE IF NOT EXISTS rdm_supplementary_verification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    release_batch_id BIGINT NOT NULL,
    delivery_item_id BIGINT NOT NULL,
    scope_version INT NOT NULL,
    build_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
    verification_type VARCHAR(16) NOT NULL COMMENT 'product/business',
    exemption_id BIGINT DEFAULT NULL,
    verifier_user_id BIGINT NOT NULL,
    verifier_user_name VARCHAR(64) DEFAULT NULL,
    deadline DATETIME NOT NULL COMMENT '申请时用工作日历冻结，不动态顺延',
    calendar_version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    result VARCHAR(16) DEFAULT NULL,
    acceptance_record_id BIGINT DEFAULT NULL,
    evidence_json JSON DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    completed_by BIGINT DEFAULT NULL,
    escalated TINYINT NOT NULL DEFAULT 0,
    escalated_at DATETIME DEFAULT NULL,
    escalation_level INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 0,
    created_by BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_supplementary_scope (release_batch_id, delivery_item_id, scope_version, build_id, verification_type),
    KEY idx_rdm_supplementary_due (status, deadline),
    CONSTRAINT fk_rdm_supplementary_batch FOREIGN KEY (release_batch_id) REFERENCES rdm_release_batch(id),
    CONSTRAINT fk_rdm_supplementary_item FOREIGN KEY (delivery_item_id) REFERENCES rdm_delivery_item(id),
    CONSTRAINT fk_rdm_supplementary_exemption FOREIGN KEY (exemption_id) REFERENCES rdm_release_exemption(id),
    CONSTRAINT fk_rdm_supplementary_acceptance FOREIGN KEY (acceptance_record_id) REFERENCES rdm_acceptance_record(id),
    CONSTRAINT ck_rdm_supplementary_type CHECK (verification_type IN ('product','business')),
    CONSTRAINT ck_rdm_supplementary_status CHECK (status IN ('pending','completed','overdue','failed')),
    CONSTRAINT ck_rdm_supplementary_version CHECK (scope_version > 0 AND version >= 0),
    CONSTRAINT ck_rdm_supplementary_completion CHECK (status NOT IN ('completed','failed') OR (completed_at IS NOT NULL AND completed_by IS NOT NULL AND acceptance_record_id IS NOT NULL AND evidence_json IS NOT NULL AND result IS NOT NULL AND ((status = 'completed' AND result = 'pass') OR (status = 'failed' AND result = 'fail'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM补验任务，补验签字引用验收事实';

CREATE TABLE IF NOT EXISTS rdm_issue_followup (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    issue_id BIGINT NOT NULL,
    defer_id BIGINT NOT NULL,
    follow_up_req_id BIGINT NOT NULL,
    source_req_id BIGINT NOT NULL,
    source_delivery_item_id BIGINT NOT NULL,
    scope_version INT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    target_version VARCHAR(100) NOT NULL,
    due_at DATE NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    active_issue_id BIGINT GENERATED ALWAYS AS (CASE WHEN active = 1 THEN issue_id ELSE NULL END) STORED,
    supersedes_id BIGINT DEFAULT NULL,
    reason TEXT NOT NULL,
    created_by BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at DATETIME DEFAULT NULL,
    deactivated_by BIGINT DEFAULT NULL,
    version INT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_rdm_followup_active_issue (active_issue_id),
    KEY idx_rdm_followup_req (follow_up_req_id),
    CONSTRAINT fk_rdm_followup_issue FOREIGN KEY (issue_id) REFERENCES rdm_issue(id),
    CONSTRAINT fk_rdm_followup_defer FOREIGN KEY (defer_id) REFERENCES rdm_issue_defer(id),
    CONSTRAINT fk_rdm_followup_req FOREIGN KEY (follow_up_req_id) REFERENCES rdm_requirement(id),
    CONSTRAINT fk_rdm_followup_source_req FOREIGN KEY (source_req_id) REFERENCES rdm_requirement(id),
    CONSTRAINT fk_rdm_followup_source_item FOREIGN KEY (source_delivery_item_id) REFERENCES rdm_delivery_item(id),
    CONSTRAINT ck_rdm_followup_active CHECK (active IN (0,1)),
    CONSTRAINT ck_rdm_followup_version CHECK (scope_version > 0 AND version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM承接历史，仅当前关联可失效，不删除';

CREATE TABLE IF NOT EXISTS rdm_issue_resolution (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    issue_id BIGINT NOT NULL,
    followup_id BIGINT NOT NULL,
    delivery_item_id BIGINT NOT NULL,
    scope_version INT NOT NULL,
    build_id VARCHAR(100) NOT NULL,
    repair_evidence_json JSON NOT NULL,
    test_round_id BIGINT NOT NULL,
    test_execution_ids_json JSON NOT NULL,
    product_acceptance_id BIGINT NOT NULL,
    business_acceptance_id BIGINT DEFAULT NULL,
    conclusion VARCHAR(16) NOT NULL,
    reason TEXT NOT NULL,
    signer_user_id BIGINT NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rdm_resolution_issue (issue_id, created_at),
    CONSTRAINT fk_rdm_resolution_issue FOREIGN KEY (issue_id) REFERENCES rdm_issue(id),
    CONSTRAINT fk_rdm_resolution_followup FOREIGN KEY (followup_id) REFERENCES rdm_issue_followup(id),
    CONSTRAINT fk_rdm_resolution_item FOREIGN KEY (delivery_item_id) REFERENCES rdm_delivery_item(id),
    CONSTRAINT fk_rdm_resolution_round FOREIGN KEY (test_round_id) REFERENCES rdm_test_round(id),
    CONSTRAINT fk_rdm_resolution_product FOREIGN KEY (product_acceptance_id) REFERENCES rdm_acceptance_record(id),
    CONSTRAINT fk_rdm_resolution_business FOREIGN KEY (business_acceptance_id) REFERENCES rdm_acceptance_record(id),
    CONSTRAINT ck_rdm_resolution_conclusion CHECK (conclusion IN ('pass','fail'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式修复复测验收闭环证据';

ALTER TABLE rdm_test_batch ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '并发版本，不是轮次或范围版本';
ALTER TABLE rdm_test_batch ADD COLUMN case_snapshot_json JSON DEFAULT NULL COMMENT '待接收用例草稿，已冻结事实以rdm_test_round为准';
ALTER TABLE rdm_test_batch ADD COLUMN build_mapping_json JSON DEFAULT NULL COMMENT '待接收交付项系统构建映射';
ALTER TABLE rdm_test_execution ADD COLUMN case_id VARCHAR(100) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '稳定用例ID，旧记录不回填';
ALTER TABLE rdm_test_execution ADD COLUMN test_round_id BIGINT DEFAULT NULL COMMENT '不可变轮次事实ID';
ALTER TABLE rdm_test_execution ADD COLUMN scope_version INT DEFAULT NULL;
ALTER TABLE rdm_test_execution ADD COLUMN evidence_json JSON DEFAULT NULL;
ALTER TABLE rdm_test_execution ADD COLUMN request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
ALTER TABLE rdm_test_execution ADD KEY idx_rdm_execution_case (batch_id, round_no, delivery_item_id, case_id);
ALTER TABLE rdm_test_execution ADD CONSTRAINT fk_rdm_execution_round FOREIGN KEY (test_round_id) REFERENCES rdm_test_round(id);
ALTER TABLE rdm_release_batch ADD COLUMN version INT NOT NULL DEFAULT 0;
ALTER TABLE rdm_release_batch ADD COLUMN application_version INT DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN application_snapshot_json JSON DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN approval_snapshot_json JSON DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN submitted_at DATETIME DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN approval_evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
ALTER TABLE rdm_release_batch ADD COLUMN approval_expires_at DATETIME DEFAULT NULL;
ALTER TABLE rdm_issue ADD COLUMN version INT NOT NULL DEFAULT 0;
ALTER TABLE rdm_issue_defer ADD COLUMN version INT NOT NULL DEFAULT 0;
ALTER TABLE rdm_issue_defer ADD COLUMN scope_version INT DEFAULT NULL;
ALTER TABLE rdm_issue_defer ADD COLUMN scope_change_id BIGINT DEFAULT NULL COMMENT '必要范围变更批准引用';
ALTER TABLE rdm_issue_defer ADD COLUMN effective_at DATETIME DEFAULT NULL;
ALTER TABLE rdm_issue_defer ADD COLUMN escalated_at DATETIME DEFAULT NULL;
ALTER TABLE rdm_issue_defer ADD COLUMN escalation_level INT NOT NULL DEFAULT 0;
ALTER TABLE rdm_idempotent_log ADD COLUMN user_id BIGINT DEFAULT NULL COMMENT '认证用户，旧日志不回放';
ALTER TABLE rdm_idempotent_log ADD COLUMN resource_key VARCHAR(160) COLLATE utf8mb4_bin DEFAULT NULL;
ALTER TABLE rdm_idempotent_log ADD COLUMN client_request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
ALTER TABLE rdm_idempotent_log ADD COLUMN request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
ALTER TABLE rdm_idempotent_log ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'legacy' COMMENT 'legacy/processing/completed';
ALTER TABLE rdm_idempotent_log ADD COLUMN completed_at DATETIME DEFAULT NULL;
ALTER TABLE rdm_idempotent_log ADD CONSTRAINT ck_rdm_idempotent_binding CHECK (status = 'legacy' OR (status IN ('processing','completed') AND user_id IS NOT NULL AND user_id > 0 AND resource_key IS NOT NULL AND client_request_id IS NOT NULL AND request_hash IS NOT NULL));
