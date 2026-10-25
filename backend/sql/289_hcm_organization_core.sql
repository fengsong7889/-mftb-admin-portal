-- 289_hcm_organization_core.sql
-- HCM 階段 C1 第一批：組織編制主數據（法人主體 / 管理組織）
--
-- 仅作参照文档：真正执行的是启动期 HcmOrganizationSchemaInitializer
-- （版本键 hcm:org-schema:v1.0 / hcm:org-legal-backfill:v1.0，已登记 catalog.json）。
-- 两边结构必须保持一致，改这里也要改 Initializer 并补契约用例。

CREATE TABLE IF NOT EXISTS org_legal_entity (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code               VARCHAR(32)  NOT NULL COMMENT '法人编码（稳定业务键）',
    name               VARCHAR(128) NOT NULL COMMENT '法人全称',
    name_en            VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    jurisdiction       VARCHAR(8)   NOT NULL DEFAULT 'CN' COMMENT '法域 CN/HK/MO',
    registration_no    VARCHAR(64)  DEFAULT NULL COMMENT '登记证照号',
    registered_address VARCHAR(255) DEFAULT NULL COMMENT '注册地址',
    verify_status      TINYINT      NOT NULL DEFAULT 0 COMMENT '核实状态 0=待核实 1=已核实',
    status             TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order         INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark             VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by         VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted            TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_org_legal_code (code),
    KEY idx_org_legal_status (status, jurisdiction)
) COMMENT='组织编制-法人主体';

CREATE TABLE IF NOT EXISTS org_unit (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code            VARCHAR(32)  NOT NULL COMMENT '组织编码（稳定业务键）',
    name            VARCHAR(128) NOT NULL COMMENT '组织名称',
    name_en         VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    parent_id       BIGINT       DEFAULT NULL COMMENT '上级组织ID（顶级为 NULL）',
    legal_entity_id BIGINT       NOT NULL COMMENT '所属法人ID',
    unit_type       VARCHAR(32)  NOT NULL DEFAULT 'DEPARTMENT' COMMENT 'COMPANY/DEPARTMENT/BUSINESS_UNIT',
    leader_name     VARCHAR(64)  DEFAULT NULL COMMENT '负责人姓名（人员主档就绪前）',
    path            VARCHAR(255) DEFAULT NULL COMMENT '物化祖先路径 /1/5/9',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order      INT          NOT NULL DEFAULT 0 COMMENT '同级排序',
    remark          VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by      VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted         TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_org_unit_code (code),
    KEY idx_org_unit_parent (parent_id),
    KEY idx_org_unit_legal (legal_entity_id),
    KEY idx_org_unit_path (path),
    CONSTRAINT fk_org_unit_legal FOREIGN KEY (legal_entity_id) REFERENCES org_legal_entity (id)
) COMMENT='组织编制-管理组织';

-- 旧字典法人回填：一律标记待核实，不冒充法定事实
INSERT IGNORE INTO org_legal_entity
    (code, name, name_en, jurisdiction, verify_status, status, sort_order, remark, updated_by)
SELECT CONCAT('LEGACY-', d.code), d.name, d.name_en, 'CN', 0, 1, d.sort_order,
       '由人事字典 EMPLOYER_COMPANY 回填，待核实法域与登记证照', 'system-backfill'
FROM sys_hr_dict d
WHERE d.dict_type = 'EMPLOYER_COMPANY' AND d.deleted = 0;
