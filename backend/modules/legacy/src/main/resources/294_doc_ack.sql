-- 294: 制度签收（P1a）。
-- 口径：
--   1) 签收只针对当前 effective_revision_id，不签草稿/历史版本；
--   2) 范围主体是 DEPT/ROLE/ALL，不逐个员工生成目标行；
--   3) 回执按 (node,revision,user) 唯一，重复点击幂等；
--   4) subject_id 为部门/角色 ID；ALL 固定 0。
CREATE TABLE IF NOT EXISTS doc_ack_target (
    node_id      BIGINT NOT NULL,
    revision_id  BIGINT NOT NULL,
    subject_type VARCHAR(16) NOT NULL COMMENT 'DEPT/ROLE/ALL',
    subject_id   VARCHAR(64) NOT NULL COMMENT '部门/角色ID；ALL=0',
    due_at       DATE NULL COMMENT '要求完成日期，空=不限',
    created_by   BIGINT NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_id, revision_id, subject_type, subject_id),
    KEY idx_doc_ack_target_subject (subject_type, subject_id),
    CONSTRAINT fk_doc_ack_target_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_ack_target_revision FOREIGN KEY (node_id, revision_id) REFERENCES doc_revision(node_id, id),
    CONSTRAINT fk_doc_ack_target_creator FOREIGN KEY (created_by) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_ack_target_type CHECK (subject_type IN ('DEPT','ROLE','ALL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC制度签收范围';

CREATE TABLE IF NOT EXISTS doc_ack_receipt (
    node_id         BIGINT NOT NULL,
    revision_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_ip       VARCHAR(64) NULL,
    user_agent      VARCHAR(255) NULL,
    PRIMARY KEY (node_id, revision_id, user_id),
    KEY idx_doc_ack_receipt_user (user_id, acknowledged_at),
    CONSTRAINT fk_doc_ack_receipt_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_ack_receipt_revision FOREIGN KEY (node_id, revision_id) REFERENCES doc_revision(node_id, id),
    CONSTRAINT fk_doc_ack_receipt_user FOREIGN KEY (user_id) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC制度签收回执';
