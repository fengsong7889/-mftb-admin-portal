-- 293: 文档密级授权审计（P0 补口）。
-- doc_user_clearance 只保留当前生效值；本表追加记录每次授予/调整/撤销。
-- 不建在 doc_audit_event：后者 space_id NOT NULL，而密级授权是全局主体属性，不属于单一空间。
CREATE TABLE IF NOT EXISTS doc_clearance_audit (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL COMMENT '被授权人',
    old_level    TINYINT NOT NULL COMMENT '变更前密级 1-4',
    new_level    TINYINT NOT NULL COMMENT '变更后密级 1-4',
    granted_by   BIGINT NOT NULL COMMENT '操作人',
    expires_at   DATETIME NULL COMMENT '本次授权到期时间，空=长期',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_doc_clearance_audit_user (user_id, id),
    CONSTRAINT fk_doc_clearance_audit_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_clearance_audit_operator FOREIGN KEY (granted_by) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_clearance_audit_level CHECK (old_level BETWEEN 1 AND 4 AND new_level BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC密级授权变更审计';
