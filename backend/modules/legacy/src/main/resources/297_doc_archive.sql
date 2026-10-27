-- 297: P1d 档案与销毁：保管期限、冻结、销毁申请/审批/清册。
CREATE TABLE IF NOT EXISTS doc_archive_meta (
    node_id         BIGINT PRIMARY KEY,
    archive_no      VARCHAR(64) NOT NULL,
    fonds_code      VARCHAR(32) NOT NULL COMMENT '全宗=空间编码',
    series_code     VARCHAR(32) NULL,
    security_level  TINYINT NOT NULL DEFAULT 2,
    retention_years SMALLINT NOT NULL DEFAULT 10,
    retention_start DATE NOT NULL,
    disposal_state  TINYINT NOT NULL DEFAULT 0 COMMENT '0正常 1待鉴定 2已批准 3已销毁',
    legal_hold      TINYINT NOT NULL DEFAULT 0,
    archived_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_by     BIGINT NOT NULL,
    UNIQUE KEY uk_doc_archive_no (archive_no),
    KEY idx_doc_archive_retention (retention_start, retention_years),
    CONSTRAINT fk_doc_archive_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_archive_user FOREIGN KEY (archived_by) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_archive_disposal CHECK (disposal_state IN (0,1,2,3)),
    CONSTRAINT ck_doc_archive_hold CHECK (legal_hold IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC档案元数据';

CREATE TABLE IF NOT EXISTS doc_disposal_request (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id        BIGINT NOT NULL,
    reason         VARCHAR(500) NOT NULL,
    requested_by   BIGINT NOT NULL,
    approved_by    BIGINT NULL,
    status         TINYINT NOT NULL DEFAULT 1 COMMENT '1待审批 2通过 3驳回 4已销毁',
    certificate_no VARCHAR(64) NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at     DATETIME NULL,
    destroyed_at   DATETIME NULL,
    KEY idx_doc_disposal_status (status, created_at),
    KEY idx_doc_disposal_node (node_id, created_at),
    CONSTRAINT fk_doc_disposal_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_disposal_requester FOREIGN KEY (requested_by) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_disposal_approver FOREIGN KEY (approved_by) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_disposal_status CHECK (status IN (1,2,3,4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC销毁申请与审批';
