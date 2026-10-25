-- 298_payroll_benefit.sql
-- D2 第三批：福利参保（方案 + 人员参保）
--
-- 仅作参照文档：真正执行的是启动期 PayrollBenefitSchemaInitializer
-- （版本键 hcm:payroll-benefit-schema:v1.0，已登记 catalog.json）。

CREATE TABLE IF NOT EXISTS payroll_benefit_plan (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code           VARCHAR(32)  NOT NULL COMMENT '方案编码',
    name           VARCHAR(128) NOT NULL COMMENT '方案名称',
    name_en        VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    plan_type      VARCHAR(32)  NOT NULL COMMENT 'SOCIAL_INSURANCE/HOUSING_FUND/MEDICAL/GROUP_LIFE/OTHER',
    jurisdiction   VARCHAR(8)   NOT NULL COMMENT '法域 CN/HK/MO',
    employer_ratio DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '雇主比例 0~1',
    employee_ratio DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '雇员比例 0~1',
    min_base       DECIMAL(18,4) DEFAULT NULL COMMENT '缴费基数下限',
    max_base       DECIMAL(18,4) DEFAULT NULL COMMENT '缴费基数上限',
    currency       VARCHAR(8)   NOT NULL COMMENT '币种',
    effective_from DATE         NOT NULL COMMENT '生效起（含）',
    effective_to   DATE         DEFAULT NULL COMMENT '生效止（含）',
    status         TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    remark         VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by     VARCHAR(64)  DEFAULT NULL,
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted        TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_payroll_benefit_plan_code (code),
    KEY idx_payroll_benefit_plan_scope (jurisdiction, plan_type, status),
    CONSTRAINT ck_payroll_benefit_plan_ratio CHECK (
        employer_ratio >= 0 AND employer_ratio <= 1
        AND employee_ratio >= 0 AND employee_ratio <= 1
        AND employer_ratio + employee_ratio <= 1),
    CONSTRAINT ck_payroll_benefit_plan_base CHECK (min_base IS NULL OR min_base >= 0),
    CONSTRAINT ck_payroll_benefit_plan_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
) COMMENT='福利参保方案';

CREATE TABLE IF NOT EXISTS payroll_enrollment (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employment_id   BIGINT        NOT NULL COMMENT '雇佣关系ID',
    plan_id         BIGINT        NOT NULL COMMENT '参保方案ID',
    base_amount     DECIMAL(18,4) NOT NULL COMMENT '缴费基数',
    employee_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇员扣除额快照',
    employer_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇主承担额快照',
    currency        VARCHAR(8)    NOT NULL COMMENT '币种快照',
    effective_from  DATE          NOT NULL COMMENT '参保起（含）',
    effective_to    DATE          DEFAULT NULL COMMENT '停保止（含，空=在保）',
    seq_no          INT           NOT NULL DEFAULT 1 COMMENT '同日序号',
    stop_reason     VARCHAR(255)  DEFAULT NULL COMMENT '停保原因',
    updated_by      VARCHAR(64)   DEFAULT NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT       NOT NULL DEFAULT 0,
    active_key      VARCHAR(64) GENERATED ALWAYS AS (
        CASE WHEN effective_to IS NULL AND deleted = 0
             THEN CONCAT(employment_id, '-', plan_id) ELSE NULL END) STORED COMMENT '在保唯一约束载体',
    UNIQUE KEY uk_payroll_enrollment_active (active_key),
    UNIQUE KEY uk_payroll_enrollment_version (employment_id, plan_id, effective_from, seq_no),
    KEY idx_payroll_enrollment_period (employment_id, plan_id, effective_from, effective_to),
    CONSTRAINT fk_payroll_enrollment_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id),
    CONSTRAINT fk_payroll_enrollment_plan FOREIGN KEY (plan_id) REFERENCES payroll_benefit_plan (id),
    CONSTRAINT ck_payroll_enrollment_amount CHECK (
        base_amount >= 0 AND employee_amount >= 0 AND employer_amount >= 0),
    CONSTRAINT ck_payroll_enrollment_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
) COMMENT='人员参保记录';
