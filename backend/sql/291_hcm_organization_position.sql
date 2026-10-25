-- 291_hcm_organization_position.sql
-- HCM 阶段 C1 第三批：岗位实例与核定编制数
--
-- 仅作参照文档：真正执行的是启动期 HcmOrganizationSchemaInitializer
-- （版本键 hcm:org-schema:v1.2，已登记 catalog.json）。
--
-- 本期不建"编制占用"：占用必须由任职事实（Assignment）反算，Assignment 属 C2。
-- 先造一张手工维护的占用数，会让界面上的"超编"变成人填的数字而不是事实。

CREATE TABLE IF NOT EXISTS org_position (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code         VARCHAR(32)  NOT NULL COMMENT '岗位编码（稳定业务键）',
    name         VARCHAR(128) NOT NULL COMMENT '岗位名称',
    name_en      VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    unit_id      BIGINT       NOT NULL COMMENT '所属组织ID',
    job_grade_id BIGINT       NOT NULL COMMENT '职位职级ID',
    headcount    INT          NOT NULL DEFAULT 0 COMMENT '核定编制数（0=未核定）',
    status       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order   INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark       VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by   VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_org_position_code (code),
    KEY idx_org_position_unit (unit_id),
    KEY idx_org_position_grade (job_grade_id),
    CONSTRAINT fk_org_position_unit FOREIGN KEY (unit_id) REFERENCES org_unit (id),
    CONSTRAINT fk_org_position_grade FOREIGN KEY (job_grade_id) REFERENCES org_job_grade (id),
    CONSTRAINT ck_org_position_headcount CHECK (headcount >= 0)
) COMMENT='组织编制-岗位实例';
