-- 300_payroll_run.sql
-- D3 第三批：核算批次 + 工资单 + 工资单明细
--
-- 仅作参照文档：真正执行的是启动期 PayrollRunSchemaInitializer
-- （版本键 hcm:payroll-run-schema:v1.0，已登记 catalog.json）。

CREATE TABLE IF NOT EXISTS payroll_run (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    period       VARCHAR(7)  NOT NULL COMMENT '工资月 YYYY-MM',
    city_code    VARCHAR(16) NOT NULL COMMENT '统筹区/城市代码',
    rule_set_id  BIGINT      DEFAULT NULL COMMENT '使用规则集',
    currency     VARCHAR(8)  NOT NULL COMMENT '币种',
    status       VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/CALCULATED/LOCKED',
    calculated_at DATETIME   DEFAULT NULL COMMENT '试算完成时间',
    locked_at    DATETIME    DEFAULT NULL COMMENT '锁定时间',
    warnings     VARCHAR(1000) DEFAULT NULL COMMENT '试算提示',
    remark       VARCHAR(255) DEFAULT NULL,
    updated_by   VARCHAR(64) DEFAULT NULL,
    created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted      TINYINT     NOT NULL DEFAULT 0,
    KEY idx_payroll_run_period (period, city_code, status),
    CONSTRAINT ck_payroll_run_status CHECK (status IN ('DRAFT','CALCULATED','LOCKED'))
) COMMENT='核算批次';

CREATE TABLE IF NOT EXISTS payroll_payslip (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    run_id              BIGINT        NOT NULL COMMENT '批次ID',
    employment_id       BIGINT        NOT NULL COMMENT '雇佣关系ID',
    person_id           BIGINT        DEFAULT NULL COMMENT '人员ID（冗余便于列表）',
    currency            VARCHAR(8)    NOT NULL COMMENT '币种',
    gross_amount        DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '应发合计',
    deduction_amount    DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '扣除合计（个人社保+个税）',
    employer_cost_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇主成本合计',
    net_amount          DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '实发',
    taxable_base        DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '应纳税所得额',
    tax_amount          DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '个税',
    rule_set_id         BIGINT        DEFAULT NULL COMMENT '规则集快照',
    status              VARCHAR(16)   NOT NULL DEFAULT 'CALCULATED' COMMENT 'CALCULATED/LOCKED',
    created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted             TINYINT       NOT NULL DEFAULT 0,
    UNIQUE KEY uk_payroll_payslip_employment (run_id, employment_id),
    CONSTRAINT fk_payroll_payslip_run FOREIGN KEY (run_id) REFERENCES payroll_run (id),
    CONSTRAINT fk_payroll_payslip_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id),
    CONSTRAINT ck_payroll_payslip_amount CHECK (gross_amount >= 0 AND deduction_amount >= 0
        AND employer_cost_amount >= 0 AND tax_amount >= 0)
) COMMENT='工资单';

CREATE TABLE IF NOT EXISTS payroll_payslip_item (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    payslip_id  BIGINT        NOT NULL COMMENT '工资单ID',
    item_type   VARCHAR(32)   NOT NULL COMMENT 'BASE_SALARY/SOCIAL_EMPLOYEE/SOCIAL_EMPLOYER/TAX',
    component_id BIGINT       DEFAULT NULL COMMENT '薪酬项目ID',
    plan_id     BIGINT        DEFAULT NULL COMMENT '参保方案ID',
    item_name   VARCHAR(128)  NOT NULL COMMENT '名称快照',
    amount      DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '金额',
    taxable     TINYINT       NOT NULL DEFAULT 0 COMMENT '是否应税',
    sort_order  INT           NOT NULL DEFAULT 0 COMMENT '展示顺序',
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    KEY idx_payroll_payslip_item (payslip_id, sort_order),
    CONSTRAINT fk_payroll_payslip_item_slip FOREIGN KEY (payslip_id) REFERENCES payroll_payslip (id),
    CONSTRAINT ck_payroll_payslip_item_amount CHECK (amount >= 0)
) COMMENT='工资单明细';
