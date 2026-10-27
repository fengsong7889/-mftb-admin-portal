-- 295: P1 阅读域（阅读进度 / 收藏 / 笔记 / 书目元数据）。
-- 口径：全部按 v3 原生文档建模；权限仍由 doc_native_document + ACL/密级决定。
CREATE TABLE IF NOT EXISTS doc_reader_state (
    user_id       BIGINT NOT NULL,
    node_id       BIGINT NOT NULL,
    revision_id   BIGINT NULL,
    position_json JSON NULL COMMENT 'PDF: page/scroll, Markdown: heading/anchor',
    percent       DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '0-100',
    total_seconds INT NOT NULL DEFAULT 0,
    last_read_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, node_id),
    KEY idx_doc_reader_recent (user_id, last_read_at),
    CONSTRAINT fk_doc_reader_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_reader_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_reader_revision FOREIGN KEY (revision_id) REFERENCES doc_revision(id),
    CONSTRAINT ck_doc_reader_percent CHECK (percent BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC阅读进度（按人×文档覆盖）';

CREATE TABLE IF NOT EXISTS doc_favorite (
    user_id    BIGINT NOT NULL,
    node_id    BIGINT NOT NULL,
    folder     VARCHAR(64) NOT NULL DEFAULT '默认',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, node_id),
    KEY idx_doc_favorite_user (user_id, created_at),
    CONSTRAINT fk_doc_favorite_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_favorite_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC收藏';

CREATE TABLE IF NOT EXISTS doc_note (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    node_id     BIGINT NOT NULL,
    revision_id BIGINT NOT NULL,
    note_type   TINYINT NOT NULL DEFAULT 1 COMMENT '1划线 2批注 3书签',
    anchor_json JSON NULL,
    quote_text  VARCHAR(1000) NULL,
    content     VARCHAR(4000) NULL,
    visibility  TINYINT NOT NULL DEFAULT 1 COMMENT '1仅本人 2空间可见',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_doc_note_user (user_id, node_id, created_at),
    CONSTRAINT fk_doc_note_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT fk_doc_note_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_note_revision FOREIGN KEY (revision_id) REFERENCES doc_revision(id),
    CONSTRAINT ck_doc_note_type CHECK (note_type IN (1,2,3)),
    CONSTRAINT ck_doc_note_visibility CHECK (visibility IN (1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC阅读笔记';

CREATE TABLE IF NOT EXISTS doc_book_meta (
    node_id          BIGINT PRIMARY KEY,
    isbn             VARCHAR(32) NULL,
    author           VARCHAR(200) NULL,
    publisher        VARCHAR(200) NULL,
    publish_year     INT NULL,
    language         VARCHAR(16) NULL,
    page_count       INT NULL,
    cover_asset_id   BIGINT NULL,
    book_category_id BIGINT NULL,
    access_mode      TINYINT NOT NULL DEFAULT 1 COMMENT '1自由阅读 2限时借阅',
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doc_book_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT fk_doc_book_cover FOREIGN KEY (cover_asset_id) REFERENCES doc_asset(id) ON DELETE SET NULL,
    CONSTRAINT fk_doc_book_category FOREIGN KEY (book_category_id) REFERENCES doc_category(id) ON DELETE SET NULL,
    CONSTRAINT ck_doc_book_access CHECK (access_mode IN (1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC书目扩展（PDF/Office 书籍共用）';
