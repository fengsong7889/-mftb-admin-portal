-- 238: RDM 第四批灰度、迁移审计、既有通知出站去重，版本 rdm:schema:v3.3。
-- 由初始化器在数据库命名锁内逐项检查DDL。仅GLOBAL配置种子，无业务数据自动迁移。
CREATE TABLE IF NOT EXISTS rdm_flow_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'GLOBAL或PROJECT:数字ID',
    project_id BIGINT DEFAULT NULL,
    v3_write_enabled TINYINT NOT NULL DEFAULT 0,
    v3_release_enabled TINYINT NOT NULL DEFAULT 0,
    global_write_paused TINYINT NOT NULL DEFAULT 0,
    global_release_paused TINYINT NOT NULL DEFAULT 0,
    product_verification_days INT NOT NULL DEFAULT 1,
    business_verification_days INT NOT NULL DEFAULT 5,
    version INT NOT NULL DEFAULT 0,
    updated_by BIGINT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_flow_scope (scope_key),
    KEY idx_rdm_flow_project (project_id),
    CONSTRAINT fk_rdm_flow_project FOREIGN KEY (project_id) REFERENCES rdm_project(id),
    CONSTRAINT ck_rdm_flow_scope CHECK ((scope_key = 'GLOBAL' AND project_id IS NULL) OR (project_id IS NOT NULL AND project_id > 0 AND scope_key = CONCAT('PROJECT:', project_id))),
    CONSTRAINT ck_rdm_flow_flags CHECK (v3_write_enabled IN (0,1) AND v3_release_enabled IN (0,1) AND global_write_paused IN (0,1) AND global_release_paused IN (0,1) AND (scope_key = 'GLOBAL' OR (global_write_paused = 0 AND global_release_paused = 0))),
    CONSTRAINT ck_rdm_flow_days CHECK (product_verification_days > 0 AND business_verification_days > 0 AND version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM显式项目灰度，读审计不受写熔断影响';

CREATE TABLE IF NOT EXISTS rdm_migration_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    requested_by BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'previewed',
    preview_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    preview_summary_json JSON NOT NULL,
    chunk_size INT NOT NULL DEFAULT 20,
    confirmed_by BIGINT DEFAULT NULL,
    confirmed_at DATETIME DEFAULT NULL,
    paused_at DATETIME DEFAULT NULL,
    pause_reason TEXT,
    version INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_migration_request (requested_by, request_id),
    KEY idx_rdm_migration_status (status, created_at),
    CONSTRAINT ck_rdm_migration_batch_status CHECK (status IN ('previewed','confirmed','running','paused','completed','failed','rolled_back')),
    CONSTRAINT ck_rdm_migration_chunk CHECK (chunk_size BETWEEN 1 AND 100 AND version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM人工确认的小批迁移计划';

CREATE TABLE IF NOT EXISTS rdm_migration_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    req_id BIGINT NOT NULL,
    target_project_id BIGINT DEFAULT NULL,
    source_flow_version INT NOT NULL,
    source_version INT NOT NULL,
    preview_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    before_snapshot_json JSON NOT NULL COMMENT '原范围、任务归属、整改来源和版本摘要',
    after_snapshot_json JSON DEFAULT NULL COMMENT '执行后关联及版本摘要，不伪造证据',
    fact_baseline_json JSON NOT NULL COMMENT '执行前已有事实ID集合与摘要，回滚须重读差异',
    executed_fact_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'previewed',
    active_req_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('confirmed','running','completed','blocked') THEN req_id ELSE NULL END) STORED,
    confirmed_by BIGINT DEFAULT NULL,
    confirmed_at DATETIME DEFAULT NULL,
    executed_by BIGINT DEFAULT NULL,
    executed_at DATETIME DEFAULT NULL,
    rolled_back_by BIGINT DEFAULT NULL,
    rolled_back_at DATETIME DEFAULT NULL,
    result_json JSON DEFAULT NULL,
    blocking_reason TEXT,
    version INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rdm_migration_batch_req (batch_id, req_id),
    UNIQUE KEY uk_rdm_migration_active_req (active_req_id),
    CONSTRAINT fk_rdm_migration_item_batch FOREIGN KEY (batch_id) REFERENCES rdm_migration_batch(id),
    CONSTRAINT fk_rdm_migration_item_req FOREIGN KEY (req_id) REFERENCES rdm_requirement(id),
    CONSTRAINT fk_rdm_migration_item_project FOREIGN KEY (target_project_id) REFERENCES rdm_project(id),
    CONSTRAINT ck_rdm_migration_source CHECK (source_flow_version IN (1,2) AND source_version >= 0 AND version >= 0),
    CONSTRAINT ck_rdm_migration_item_status CHECK (status IN ('previewed','confirmed','running','completed','failed','blocked','rolled_back'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM逐项预览确认执行与保守回退';

CREATE TABLE IF NOT EXISTS rdm_migration_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    item_id BIGINT DEFAULT NULL,
    action VARCHAR(16) NOT NULL COMMENT 'preview/confirm/execute/pause/resume/rollback/reconcile',
    result VARCHAR(16) NOT NULL COMMENT 'success/failed/blocked',
    operator_user_id BIGINT NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    before_version INT NOT NULL,
    after_version INT NOT NULL,
    before_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    after_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    result_json JSON NOT NULL,
    reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rdm_migration_audit_batch (batch_id, created_at),
    CONSTRAINT fk_rdm_migration_audit_batch FOREIGN KEY (batch_id) REFERENCES rdm_migration_batch(id),
    CONSTRAINT fk_rdm_migration_audit_item FOREIGN KEY (item_id) REFERENCES rdm_migration_item(id),
    CONSTRAINT ck_rdm_migration_audit_action CHECK (action IN ('preview','confirm','execute','pause','resume','rollback','reconcile')),
    CONSTRAINT ck_rdm_migration_audit_result CHECK (result IN ('success','failed','blocked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可覆盖的迁移结果审计';

ALTER TABLE rdm_notify_log ADD COLUMN object_type VARCHAR(32) DEFAULT NULL;
ALTER TABLE rdm_notify_log ADD COLUMN object_id BIGINT DEFAULT NULL;
ALTER TABLE rdm_notify_log ADD COLUMN event_version VARCHAR(64) DEFAULT NULL COMMENT 'VERSION:并发版本或DATE:yyyy-MM-dd';
ALTER TABLE rdm_notify_log ADD COLUMN receiver_user_id BIGINT DEFAULT NULL;
ALTER TABLE rdm_notify_log ADD COLUMN dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL COMMENT '新事件规范化摘要，旧行NULL不回填';
ALTER TABLE rdm_notify_log ADD UNIQUE KEY uk_rdm_notify_dedupe (dedupe_key);
ALTER TABLE rdm_notify_log ADD CONSTRAINT ck_rdm_notify_dedupe CHECK (dedupe_key IS NULL OR (CHAR_LENGTH(dedupe_key) = 64 AND object_type IS NOT NULL AND CHAR_LENGTH(object_type) > 0 AND object_id IS NOT NULL AND object_id > 0 AND event_version IS NOT NULL AND CHAR_LENGTH(event_version) > 0 AND receiver_user_id IS NOT NULL AND receiver_user_id > 0));

INSERT INTO rdm_flow_config (scope_key, project_id, v3_write_enabled, v3_release_enabled)
VALUES ('GLOBAL', NULL, 0, 0)
ON DUPLICATE KEY UPDATE scope_key = VALUES(scope_key);
