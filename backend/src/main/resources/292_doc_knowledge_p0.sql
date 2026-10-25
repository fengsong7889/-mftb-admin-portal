-- 292: 文档中心 P0 知识库地基（分类/标签/文件载体/主体授权/密级/统一检索）
-- 口径：
--   1) 只新增表与 nullable/带默认值列，不修改旧列语义、不删旧列；
--   2) doc_node 仍是统一目录身份，doc_native_document 仍是原生内容扩展；
--   3) 二进制文件只进对象存储，库内只存资产元数据；
--   4) 分类/标签只做导航与检索，不承载权限；权限只认空间 + ACL + 密级。
-- 执行入口：DocKnowledgeSchema（版本键 doc:knowledge-v3.0）。

CREATE TABLE IF NOT EXISTS doc_category (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    space_id    BIGINT NOT NULL COMMENT '所属空间',
    parent_id   BIGINT NOT NULL DEFAULT 0 COMMENT '父分类，0=根',
    code        VARCHAR(64) NOT NULL COMMENT '空间内稳定编码',
    name        VARCHAR(100) NOT NULL COMMENT '分类名称',
    path        VARCHAR(500) NOT NULL COMMENT '物化路径，如 /1/5/9/',
    level       TINYINT NOT NULL DEFAULT 1 COMMENT '层级 1-4',
    sort_order  INT NOT NULL DEFAULT 0 COMMENT '排序，小在前',
    doc_count   INT NOT NULL DEFAULT 0 COMMENT '文档计数（异步汇总）',
    status      TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_category_code (space_id, code),
    KEY idx_doc_category_parent (space_id, parent_id, sort_order),
    KEY idx_doc_category_path (space_id, path),
    CONSTRAINT fk_doc_category_space FOREIGN KEY (space_id) REFERENCES doc_space(id),
    CONSTRAINT ck_doc_category_level CHECK (level BETWEEN 1 AND 4),
    CONSTRAINT ck_doc_category_status CHECK (status IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC分类树（空间内导航，不承载权限）';

CREATE TABLE IF NOT EXISTS doc_tag (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    space_id    BIGINT NOT NULL DEFAULT 0 COMMENT '0=全局标签，其余为空间标签',
    name        VARCHAR(64) NOT NULL COMMENT '标签名',
    color       VARCHAR(16) NULL COMMENT '展示色',
    status      TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    created_by  BIGINT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_tag_name (space_id, name),
    KEY idx_doc_tag_space (space_id, status),
    CONSTRAINT ck_doc_tag_status CHECK (status IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC受控标签词表';

CREATE TABLE IF NOT EXISTS doc_node_tag (
    node_id BIGINT NOT NULL,
    tag_id  BIGINT NOT NULL,
    PRIMARY KEY (node_id, tag_id),
    KEY idx_doc_node_tag_tag (tag_id, node_id),
    CONSTRAINT fk_doc_node_tag_node FOREIGN KEY (node_id) REFERENCES doc_node(id),
    CONSTRAINT fk_doc_node_tag_tag FOREIGN KEY (tag_id) REFERENCES doc_tag(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC文档与标签关联';

CREATE TABLE IF NOT EXISTS doc_asset (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    space_id         BIGINT NOT NULL COMMENT '所属空间',
    sha256           CHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '内容哈希',
    storage_provider VARCHAR(16) NOT NULL DEFAULT 'local' COMMENT 'local/s3',
    bucket           VARCHAR(64) NOT NULL DEFAULT '',
    object_key       VARCHAR(500) NOT NULL COMMENT '对象键，服务端生成',
    original_name    VARCHAR(255) NOT NULL,
    mime             VARCHAR(128) NOT NULL,
    size_bytes       BIGINT NOT NULL,
    page_count       INT NULL,
    status           TINYINT NOT NULL DEFAULT 1 COMMENT '1待确认 2可用 3拒绝 4已删除',
    scan_result      VARCHAR(200) NULL COMMENT '病毒扫描结果；UNSCANNED=未扫描',
    created_by       BIGINT NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 同一内容可被不同文档各自持有资产行：对象存储按 hash 复用对象，但权限按行隔离
    KEY idx_doc_asset_hash (space_id, sha256, size_bytes),
    KEY idx_doc_asset_space (space_id, created_at),
    KEY idx_doc_asset_creator (created_by, created_at),
    CONSTRAINT fk_doc_asset_space FOREIGN KEY (space_id) REFERENCES doc_space(id),
    CONSTRAINT ck_doc_asset_size CHECK (size_bytes > 0),
    CONSTRAINT ck_doc_asset_status CHECK (status IN (1,2,3,4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC对象存储资产元数据（禁止存二进制）';

CREATE TABLE IF NOT EXISTS doc_revision_asset (
    revision_id BIGINT NOT NULL,
    asset_id    BIGINT NOT NULL,
    role        TINYINT NOT NULL DEFAULT 1 COMMENT '1原件 2预览 3封面 4附件',
    sort_order  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (revision_id, asset_id, role),
    KEY idx_doc_revision_asset_asset (asset_id),
    CONSTRAINT fk_doc_revision_asset_revision FOREIGN KEY (revision_id) REFERENCES doc_revision(id),
    CONSTRAINT fk_doc_revision_asset_asset FOREIGN KEY (asset_id) REFERENCES doc_asset(id),
    CONSTRAINT ck_doc_revision_asset_role CHECK (role IN (1,2,3,4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC修订与文件资产绑定';

CREATE TABLE IF NOT EXISTS doc_acl_entry (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id      BIGINT NOT NULL,
    subject_type VARCHAR(16) NOT NULL COMMENT 'USER/DEPT/ROLE/ALL',
    subject_id   VARCHAR(64) NOT NULL COMMENT '用户/部门/角色ID；ALL=0',
    permissions  INT NOT NULL DEFAULT 1 COMMENT '1读 3读写',
    expires_at   DATETIME NULL COMMENT '空=长期',
    created_by   BIGINT NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_acl_entry (node_id, subject_type, subject_id),
    KEY idx_doc_acl_lookup (subject_type, subject_id, node_id),
    KEY idx_doc_acl_expiry (node_id, expires_at),
    CONSTRAINT fk_doc_acl_entry_node FOREIGN KEY (node_id) REFERENCES doc_native_document(node_id),
    CONSTRAINT ck_doc_acl_entry_subject CHECK (subject_type IN ('USER','DEPT','ROLE','ALL')),
    CONSTRAINT ck_doc_acl_entry_perm CHECK (permissions IN (1,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC文档主体授权（只能收窄空间权限）';

CREATE TABLE IF NOT EXISTS doc_user_clearance (
    user_id     BIGINT PRIMARY KEY,
    max_level   TINYINT NOT NULL DEFAULT 2 COMMENT '1公开 2内部 3敏感 4机密',
    granted_by  BIGINT NOT NULL,
    granted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME NULL,
    CONSTRAINT fk_doc_clearance_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
    CONSTRAINT ck_doc_clearance_level CHECK (max_level BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC用户密级授权；未登记默认内部';

CREATE TABLE IF NOT EXISTS doc_search_index (
    node_id         BIGINT PRIMARY KEY,
    space_id        BIGINT NOT NULL,
    category_id     BIGINT NULL,
    title           VARCHAR(200) NOT NULL,
    summary         VARCHAR(1000) NOT NULL DEFAULT '',
    body_text       MEDIUMTEXT NOT NULL COMMENT 'Markdown正文或提取文本；文件型未提取时为空',
    tags            VARCHAR(500) NOT NULL DEFAULT '',
    owner_user_id   BIGINT NULL,
    content_kind    TINYINT NOT NULL DEFAULT 1 COMMENT '1Markdown 2PDF 3Office 4外链 5OpenAPI',
    confidentiality TINYINT NOT NULL DEFAULT 2 COMMENT '1公开 2内部 3敏感 4机密',
    status          TINYINT NOT NULL DEFAULT 1,
    effective_from  DATE NULL,
    index_state     TINYINT NOT NULL DEFAULT 1 COMMENT '1待索引 2就绪 3失败',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FULLTEXT KEY ft_doc_search (title,summary,body_text,tags) WITH PARSER ngram,
    KEY idx_doc_search_facet (space_id,category_id,content_kind,status),
    KEY idx_doc_search_owner (owner_user_id),
    KEY idx_doc_search_updated (updated_at),
    CONSTRAINT fk_doc_search_node FOREIGN KEY (node_id) REFERENCES doc_node(id) ON DELETE CASCADE,
    CONSTRAINT ck_doc_search_kind CHECK (content_kind BETWEEN 1 AND 5),
    CONSTRAINT ck_doc_search_conf CHECK (confidentiality BETWEEN 1 AND 4),
    CONSTRAINT ck_doc_search_state CHECK (index_state IN (1,2,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC统一检索索引（权限过滤后分页）';
