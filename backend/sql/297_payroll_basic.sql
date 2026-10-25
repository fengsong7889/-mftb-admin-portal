-- 297_payroll_basic.sql
-- D2 第一批：薪酬基础（薪酬项目 + 薪酬标准/定调薪）
--
-- 仅作参照文档：真正执行的是启动期 PayrollSchemaInitializer
-- （版本键 hcm:payroll-schema:v1.0，已登记 catalog.json）。

CREATE TABLE IF NOT EXISTS payroll_component (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code           VARCHAR(32)  NOT NULL COMMENT '项目编码',
    name           VARCHAR(128) NOT NULL COMMENT '项目名称',
    name_en        VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    component_type VARCHAR(32)  NOT NULL COMMENT 'EARNING/DEDUCTION/EMPLOYER_COST',
    taxable        TINYINT      NOT NULL DEFAULT 0 COMMENT '1=应税 0=免税',
    currency       VARCHAR(8)   DEFAULT NULL COMMENT '币种（空=随薪酬标准）',
    status         TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '工资单展示顺序',
    remark         VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by     VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted        TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_payroll_component_code (code),
    KEY idx_payroll_component_type (component_type, status)
) COMMENT='薪酬项目';

CREATE TABLE IF NOT EXISTS payroll_salary_standard (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employment_id  BIGINT        NOT NULL COMMENT '雇佣关系ID',
    base_amount    DECIMAL(18,4) NOT NULL COMMENT '基本工资',
    currency       VARCHAR(8)    NOT NULL COMMENT '币种 CNY/HKD/MOP',
    change_type    VARCHAR(16)   NOT NULL DEFAULT 'ADJUST' COMMENT 'HIRE/ADJUST/PROMOTION/ANNUAL',
    effective_from DATE          NOT NULL COMMENT '生效起（含）',
    effective_to   DATE          DEFAULT NULL COMMENT '生效止（含，空=当前有效）',
    seq_no         INT           NOT NULL DEFAULT 1 COMMENT '同日序号',
    reason         VARCHAR(255)  DEFAULT NULL COMMENT '调薪原因',
    updated_by     VARCHAR(64)   DEFAULT NULL COMMENT '最后更新人',
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted        TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    current_employment BIGINT GENERATED ALWAYS AS (
        CASE WHEN effective_to IS NULL AND deleted = 0 THEN employment_id ELSE NULL END
    ) STORED COMMENT '当前标准唯一约束载体',
    UNIQUE KEY uk_payroll_standard_current (current_employment),
    UNIQUE KEY uk_payroll_standard_version (employment_id, effective_from, seq_no),
    KEY idx_payroll_standard_period (employment_id, effective_from, effective_to),
    CONSTRAINT fk_payroll_standard_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id),
    CONSTRAINT ck_payroll_standard_amount CHECK (base_amount >= 0),
    CONSTRAINT ck_payroll_standard_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
) COMMENT='薪酬标准（定调薪，日期生效）';
