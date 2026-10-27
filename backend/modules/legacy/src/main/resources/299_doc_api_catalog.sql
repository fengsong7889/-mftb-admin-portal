-- 299: 全系统接口清单（代码扫描 + 后续可被 OpenAPI 补充）。
-- 只记录方法/路径/处理类/入参类型/返回类型，不保存请求内容或密钥。
CREATE TABLE IF NOT EXISTS doc_api_catalog (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    system_code     VARCHAR(32) NOT NULL,
    system_name     VARCHAR(100) NOT NULL,
    method          VARCHAR(8) NOT NULL,
    path            VARCHAR(500) NOT NULL,
    handler         VARCHAR(255) NOT NULL,
    request_schema  MEDIUMTEXT NULL COMMENT '参数/请求体类型 JSON 数组',
    response_schema MEDIUMTEXT NULL COMMENT '返回类型签名',
    source          VARCHAR(16) NOT NULL DEFAULT 'code' COMMENT 'code/openapi/manual',
    synced_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doc_api_catalog (system_code, method, path),
    KEY idx_doc_api_catalog_system (system_code, path),
    KEY idx_doc_api_catalog_source (source, synced_at),
    CONSTRAINT ck_doc_api_catalog_method CHECK (method IN ('GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC全系统接口清单';
