-- 290: 原生方案核心。doc_node 保留稳定身份，扩展表避免改变腾讯索引语义。
-- 执行入口为 DocSchemaMigrationInitializer；不自动搬运、发布或删除历史方案。
CREATE TABLE IF NOT EXISTS doc_space_access (
    space_id BIGINT PRIMARY KEY COMMENT '原生空间ID',
    owner_user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doc_access_space FOREIGN KEY (space_id) REFERENCES doc_space(id),
    CONSTRAINT fk_doc_access_owner FOREIGN KEY (owner_user_id) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC原生空间配置';

CREATE TABLE IF NOT EXISTS doc_space_member (
    space_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    permissions INT NOT NULL DEFAULT 1 COMMENT '位集:读取1 编辑2 确认4 管理8',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (space_id,user_id),
    KEY idx_doc_member_user (user_id,space_id),
    CONSTRAINT fk_doc_member_space FOREIGN KEY (space_id) REFERENCES doc_space_access(space_id),
    CONSTRAINT fk_doc_member_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_member_permissions CHECK (permissions IN (1,3,5,7,15))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC空间成员';

CREATE TABLE IF NOT EXISTS doc_native_document (
    node_id BIGINT PRIMARY KEY,
    document_no VARCHAR(40) NOT NULL,
    space_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    source_key VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    draft_revision_id BIGINT NULL,
    effective_revision_id BIGINT NULL,
    adopted_revision_id BIGINT NULL,
    version INT NOT NULL DEFAULT 1,
    lifecycle INT NOT NULL DEFAULT 1 COMMENT '1有效 2归档 3废弃',
    execution_status INT NOT NULL DEFAULT 1 COMMENT '1未开始 2执行中 3暂停 4完成',
    restricted TINYINT NOT NULL DEFAULT 0,
    deleted_at DATETIME NULL,
    deleted_by BIGINT NULL,
    deletion_reason VARCHAR(200) NULL,
    review_due_at DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_native_no (document_no),
    UNIQUE KEY uk_doc_native_source (created_by_user_id,source_key),
    KEY idx_doc_native_space (space_id,deleted_at,updated_at),
    CONSTRAINT fk_doc_native_node FOREIGN KEY (node_id) REFERENCES doc_node(id),
    CONSTRAINT fk_doc_native_space FOREIGN KEY (space_id) REFERENCES doc_space_access(space_id),
    CONSTRAINT fk_doc_native_owner FOREIGN KEY (owner_user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_native_creator FOREIGN KEY (created_by_user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_native_state CHECK (lifecycle IN (1,2,3) AND execution_status IN (1,2,3,4) AND version>0 AND restricted IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC原生文档身份扩展';

CREATE TABLE IF NOT EXISTS doc_revision (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id BIGINT NOT NULL,
    revision_no INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(1000) NOT NULL DEFAULT '',
    markdown LONGTEXT NOT NULL,
    tags_json JSON NOT NULL,
    system_code VARCHAR(32) NOT NULL DEFAULT '',
    menu_key VARCHAR(100) NOT NULL DEFAULT '',
    original_filename VARCHAR(255) NOT NULL DEFAULT '',
    content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    change_reason VARCHAR(200) NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_revision_number (node_id,revision_no),
    UNIQUE KEY uk_doc_revision_owner (node_id,id),
    FULLTEXT KEY ft_doc_revision_content (title,summary,markdown) WITH PARSER ngram,
    CONSTRAINT fk_doc_revision_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_revision_creator FOREIGN KEY (created_by_user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_revision_number CHECK (revision_no>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC不可变原文修订';

CREATE TABLE IF NOT EXISTS doc_document_acl (
    node_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    permissions INT NOT NULL DEFAULT 1,
    PRIMARY KEY (node_id,user_id),
    CONSTRAINT fk_doc_acl_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_acl_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_acl_permissions CHECK (permissions IN (1,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC文件收窄授权及草稿协作者';

CREATE TABLE IF NOT EXISTS doc_confirmation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id BIGINT NOT NULL,
    revision_id BIGINT NOT NULL,
    reviewer_user_id BIGINT NOT NULL,
    status INT NOT NULL DEFAULT 1 COMMENT '1待确认 2通过 3退回 4撤回',
    note VARCHAR(200) NOT NULL DEFAULT '',
    submitted_by BIGINT NOT NULL,
    decided_by BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    KEY idx_doc_confirmation_pending (node_id,status),
    CONSTRAINT fk_doc_confirmation_revision FOREIGN KEY (node_id,revision_id) REFERENCES doc_revision(node_id,id),
    CONSTRAINT fk_doc_confirmation_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_confirmation_status CHECK (status IN (1,2,3,4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC精确版本确认';

CREATE TABLE IF NOT EXISTS doc_handoff (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id BIGINT NOT NULL,
    revision_id BIGINT NOT NULL,
    sender_user_id BIGINT NOT NULL,
    recipient_user_id BIGINT NOT NULL,
    completed_text VARCHAR(2000) NOT NULL,
    remaining_text VARCHAR(2000) NOT NULL,
    risk_text VARCHAR(2000) NOT NULL DEFAULT '',
    status INT NOT NULL DEFAULT 1 COMMENT '1待接收 2已接收',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME NULL,
    KEY idx_doc_handoff_pending (node_id,status),
    CONSTRAINT fk_doc_handoff_revision FOREIGN KEY (node_id,revision_id) REFERENCES doc_revision(node_id,id),
    CONSTRAINT fk_doc_handoff_sender FOREIGN KEY (sender_user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_handoff_recipient FOREIGN KEY (recipient_user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_handoff_status CHECK (status IN (1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC版本交接';

CREATE TABLE IF NOT EXISTS doc_audit_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id BIGINT NULL,
    space_id BIGINT NOT NULL,
    actor_user_id BIGINT NOT NULL,
    action VARCHAR(64) NOT NULL,
    revision_id BIGINT NULL,
    detail VARCHAR(500) NOT NULL DEFAULT '',
    request_key VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_doc_audit_node (node_id,id),
    CONSTRAINT fk_doc_audit_space FOREIGN KEY (space_id) REFERENCES doc_space_access(space_id),
    CONSTRAINT fk_doc_audit_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC追加式关键操作审计';

CREATE TABLE IF NOT EXISTS doc_ingest_request (
    actor_user_id BIGINT NOT NULL,
    request_key VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    request_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    node_id BIGINT NULL,
    response_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_user_id,request_key),
    CONSTRAINT fk_doc_receipt_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC事务幂等回执';

CREATE TABLE IF NOT EXISTS doc_integration_grant (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    space_id BIGINT NOT NULL,
    name VARCHAR(64) NOT NULL,
    token_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    rate_window DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_count INT NOT NULL DEFAULT 0,
    can_write TINYINT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_grant_hash (token_hash),
    KEY idx_doc_grant_owner (owner_user_id,revoked_at),
    CONSTRAINT fk_doc_grant_owner FOREIGN KEY (owner_user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_grant_space FOREIGN KEY (space_id) REFERENCES doc_space_access(space_id),
    CONSTRAINT ck_doc_grant_write CHECK (can_write IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC可撤销集成授权，禁止存明文令牌';
