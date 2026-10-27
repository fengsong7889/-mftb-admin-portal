-- 298: 系统方案库。记录系统建设/整改生成的 MD 方案文件，供后续追溯。
-- 方案正文独立存档，不依赖生成它的仓库是否还在；source_path/hash 保留来源与版本指 纹。
CREATE TABLE IF NOT EXISTS doc_system_plan (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_key     CHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT 'source_path 的 SHA-256，稳定身份',
    file_name    VARCHAR(255) NOT NULL,
    title        VARCHAR(300) NOT NULL,
    system_name  VARCHAR(100) NOT NULL,
    system_code  VARCHAR(32) NULL,
    plan_type    VARCHAR(32) NOT NULL,
    generated_at DATETIME NOT NULL,
    source_path  VARCHAR(500) NOT NULL,
    content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    content      MEDIUMTEXT NOT NULL,
    file_size    BIGINT NOT NULL DEFAULT 0,
    status       TINYINT NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_system_plan_key (plan_key),
    KEY idx_doc_system_plan_system (system_name, generated_at),
    KEY idx_doc_system_plan_type (plan_type, generated_at),
    CONSTRAINT ck_doc_system_plan_status CHECK (status IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC系统方案文件归档';
