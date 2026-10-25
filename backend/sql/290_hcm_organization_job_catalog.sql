-- 290_hcm_organization_job_catalog.sql
-- HCM 阶段 C1 第二批：职位体系（职务族 / 职位职级）
--
-- 仅作参照文档：真正执行的是启动期 HcmOrganizationSchemaInitializer
-- （版本键 hcm:org-schema:v1.1，已登记 catalog.json）。
-- 两边结构必须保持一致，改这里也要改 Initializer。

CREATE TABLE IF NOT EXISTS org_job_family (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code       VARCHAR(32)  NOT NULL COMMENT '职务族编码（稳定业务键）',
    name       VARCHAR(128) NOT NULL COMMENT '职务族名称',
    name_en    VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    status     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark     VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted    TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_org_job_family_code (code),
    KEY idx_org_job_family_status (status)
) COMMENT='组织编制-职务族';

CREATE TABLE IF NOT EXISTS org_job_grade (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code           VARCHAR(32)  NOT NULL COMMENT '职位编码（稳定业务键）',
    name           VARCHAR(128) NOT NULL COMMENT '职位名称',
    name_en        VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    job_family_id  BIGINT       NOT NULL COMMENT '所属职务族ID',
    grade_level    INT          NOT NULL DEFAULT 1 COMMENT '职级序号（同族内越大越高）',
    status         TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark         VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by     VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted        TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_org_job_grade_code (code),
    KEY idx_org_job_grade_family (job_family_id, grade_level),
    CONSTRAINT fk_org_job_grade_family FOREIGN KEY (job_family_id) REFERENCES org_job_family (id)
) COMMENT='组织编制-职位职级';
