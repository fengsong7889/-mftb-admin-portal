-- 299_payroll_rule.sql
-- D3 第一批：薪酬规则底座（规则集 + 个税级距 + 方案城市维度）
--
-- 仅作参照文档：真正执行的是启动期
--   PayrollRuleSchemaInitializer（hcm:payroll-rule-schema:v1.0）
--   PayrollBenefitSchemaInitializer（hcm:payroll-benefit-schema:v1.1，加 city_code）
--
-- 刻意不插入任何默认税率或社保参数：内地基数按统筹区每年公布，
-- 内置默认值会在某些城市算出错数；缺配置时试算直接拒绝。

CREATE TABLE IF NOT EXISTS payroll_rule_set (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code            VARCHAR(64)  NOT NULL COMMENT '规则集编码',
    name            VARCHAR(128) NOT NULL COMMENT '名称',
    jurisdiction    VARCHAR(8)   NOT NULL COMMENT '法域 CN/HK/MO',
    city_code       VARCHAR(16)  NOT NULL COMMENT '统筹区/城市代码',
    city_name       VARCHAR(64)  DEFAULT NULL COMMENT '城市名称',
    currency        VARCHAR(8)   NOT NULL COMMENT '币种',
    basic_deduction DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '个税基本减除费用（月）',
    effective_from  DATE         NOT NULL COMMENT '生效起（含）',
    effective_to    DATE         DEFAULT NULL COMMENT '生效止（含）',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    version_label   VARCHAR(64)  DEFAULT NULL COMMENT '版本说明',
    remark          VARCHAR(255) DEFAULT NULL,
    updated_by      VARCHAR(64)  DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_payroll_rule_set_code (code),
    KEY idx_payroll_rule_set_city (city_code, effective_from, effective_to, status),
    CONSTRAINT ck_payroll_rule_set_period CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_payroll_rule_set_deduction CHECK (basic_deduction >= 0)
) COMMENT='薪酬规则集（城市×期间）';

CREATE TABLE IF NOT EXISTS payroll_tax_bracket (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    rule_set_id     BIGINT        NOT NULL COMMENT '规则集ID',
    level_no        INT           NOT NULL COMMENT '级次',
    lower_bound     DECIMAL(18,4) NOT NULL COMMENT '下限（含）',
    upper_bound     DECIMAL(18,4) DEFAULT NULL COMMENT '上限（不含，空=无上限）',
    rate            DECIMAL(6,4)  NOT NULL COMMENT '税率 0~1',
    quick_deduction DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '速算扣除数',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    deleted         TINYINT       NOT NULL DEFAULT 0,
    UNIQUE KEY uk_payroll_tax_bracket_level (rule_set_id, level_no),
    CONSTRAINT fk_payroll_tax_bracket_rule FOREIGN KEY (rule_set_id) REFERENCES payroll_rule_set (id),
    CONSTRAINT ck_payroll_tax_bracket_rate CHECK (rate >= 0 AND rate <= 1),
    CONSTRAINT ck_payroll_tax_bracket_range CHECK (upper_bound IS NULL OR upper_bound > lower_bound)
) COMMENT='个税级距';

ALTER TABLE payroll_benefit_plan
    ADD COLUMN city_code VARCHAR(16) DEFAULT NULL COMMENT '统筹区/城市代码（内地如 4403，港澳填 HK / MO）' AFTER jurisdiction,
    ADD KEY idx_payroll_benefit_plan_city (city_code);
