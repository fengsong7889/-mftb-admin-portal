-- 296: P1c 接口文档中心：规格、操作清单、版本差异。
-- 口径：raw_spec 保存原始 OpenAPI；操作按 METHOD+path 稳定键；删除/变更未确认不得视为已接受。
CREATE TABLE IF NOT EXISTS doc_api_spec (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id      BIGINT NOT NULL,
    revision_id  BIGINT NOT NULL,
    system_code  VARCHAR(32) NOT NULL,
    spec_format  VARCHAR(16) NOT NULL DEFAULT 'openapi3',
    spec_version VARCHAR(32) NOT NULL,
    base_url     VARCHAR(255) NULL,
    source_type  TINYINT NOT NULL DEFAULT 1 COMMENT '1上传 2同步 3手工',
    raw_spec     MEDIUMTEXT NOT NULL,
    spec_hash    CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    synced_at    DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_api_spec_ver (node_id, spec_version),
    KEY idx_doc_api_system (system_code, created_at),
    CONSTRAINT fk_doc_api_spec_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_api_spec_revision FOREIGN KEY (revision_id) REFERENCES doc_revision(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC接口规范版本';

CREATE TABLE IF NOT EXISTS doc_api_operation (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    spec_id       BIGINT NOT NULL,
    operation_id  VARCHAR(160) NOT NULL,
    method        VARCHAR(8) NOT NULL,
    path          VARCHAR(255) NOT NULL,
    summary       VARCHAR(255) NULL,
    tag           VARCHAR(64) NULL,
    deprecated    TINYINT NOT NULL DEFAULT 0,
    schema_hash   CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    owner_user_id BIGINT NULL,
    UNIQUE KEY uk_doc_api_op (spec_id, method, path),
    KEY idx_doc_api_op_path (path),
    CONSTRAINT fk_doc_api_op_spec FOREIGN KEY (spec_id) REFERENCES doc_api_spec(id),
    CONSTRAINT fk_doc_api_op_owner FOREIGN KEY (owner_user_id) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC接口操作清单';

CREATE TABLE IF NOT EXISTS doc_api_change (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id         BIGINT NOT NULL,
    from_spec_id    BIGINT NULL,
    to_spec_id      BIGINT NOT NULL,
    change_type     TINYINT NOT NULL COMMENT '1新增 2删除 3破坏性 4弃用 5文档',
    operation_key   VARCHAR(300) NOT NULL,
    detail          VARCHAR(1000) NULL,
    acknowledged_by BIGINT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_doc_api_change_node (node_id, created_at),
    CONSTRAINT fk_doc_api_change_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_api_change_from FOREIGN KEY (from_spec_id) REFERENCES doc_api_spec(id),
    CONSTRAINT fk_doc_api_change_to FOREIGN KEY (to_spec_id) REFERENCES doc_api_spec(id),
    CONSTRAINT fk_doc_api_change_ack FOREIGN KEY (acknowledged_by) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_api_change_type CHECK (change_type IN (1,2,3,4,5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC接口版本差异';
