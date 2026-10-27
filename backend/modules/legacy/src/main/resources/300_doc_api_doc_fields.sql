-- 300: 接口文档化字段。代码扫描只负责草稿，人工补齐场景/示例/错误码后发布。
ALTER TABLE doc_api_catalog
    ADD COLUMN api_name VARCHAR(200) NULL COMMENT '对外接口名称',
    ADD COLUMN description VARCHAR(1000) NULL COMMENT '接口说明',
    ADD COLUMN scenario VARCHAR(2000) NULL COMMENT '使用场景/前置条件',
    ADD COLUMN auth_type VARCHAR(32) NOT NULL DEFAULT 'JWT' COMMENT '鉴权方式',
    ADD COLUMN auth_scope VARCHAR(500) NULL COMMENT '所需权限/scope',
    ADD COLUMN visibility TINYINT NOT NULL DEFAULT 1 COMMENT '1内部 2合作方 3公开',
    ADD COLUMN doc_status TINYINT NOT NULL DEFAULT 1 COMMENT '1草稿 2已发布 3已弃用',
    ADD COLUMN owner_user_id BIGINT NULL COMMENT '接口负责人',
    ADD COLUMN version VARCHAR(32) NOT NULL DEFAULT 'v1' COMMENT '接口版本',
    ADD COLUMN base_url VARCHAR(255) NULL COMMENT '调用基地址',
    ADD COLUMN request_example MEDIUMTEXT NULL COMMENT '请求示例',
    ADD COLUMN response_example MEDIUMTEXT NULL COMMENT '响应示例',
    ADD COLUMN error_codes MEDIUMTEXT NULL COMMENT '错误码说明',
    ADD COLUMN changelog MEDIUMTEXT NULL COMMENT '变更记录',
    ADD COLUMN active TINYINT NOT NULL DEFAULT 1 COMMENT '代码扫描是否仍存在';
