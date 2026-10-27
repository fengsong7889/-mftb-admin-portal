package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 核算批次与工资单建表（D3 第三批）。
 * <p>
 * 工资单金额是结果快照而不是视图计算：一览表里必须能原样重放当时的口径。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(29)
public class PayrollRunSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:payroll-run-schema:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("核算批次建表失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_run ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "period VARCHAR(7) NOT NULL COMMENT '工資月 YYYY-MM', "
                        + "city_code VARCHAR(16) NOT NULL COMMENT '統籌區/城市代碼', "
                        + "rule_set_id BIGINT DEFAULT NULL COMMENT '使用規則集', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/CALCULATED/LOCKED', "
                        + "calculated_at DATETIME DEFAULT NULL COMMENT '試算完成時間', "
                        + "locked_at DATETIME DEFAULT NULL COMMENT '鎖定時間', "
                        + "warnings VARCHAR(1000) DEFAULT NULL COMMENT '試算提示', "
                        + "remark VARCHAR(255) DEFAULT NULL, "
                        + "updated_by VARCHAR(64) DEFAULT NULL, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        + "KEY idx_payroll_run_period (period, city_code, status), "
                        + "CONSTRAINT ck_payroll_run_status CHECK (status IN ('DRAFT','CALCULATED','LOCKED'))"
                        + ") COMMENT='核算批次'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_payslip ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "run_id BIGINT NOT NULL COMMENT '批次ID', "
                        + "employment_id BIGINT NOT NULL COMMENT '雇傭關係ID', "
                        + "person_id BIGINT DEFAULT NULL COMMENT '人員ID（冗餘便於列表）', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種', "
                        + "gross_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '應發合計', "
                        + "deduction_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '扣除合計（個人社保+個稅）', "
                        + "employer_cost_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇主成本合計', "
                        + "net_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '實發', "
                        + "taxable_base DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '應納稅所得額', "
                        + "tax_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '個稅', "
                        + "rule_set_id BIGINT DEFAULT NULL COMMENT '規則集快照', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'CALCULATED' COMMENT 'CALCULATED/LOCKED', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        + "UNIQUE KEY uk_payroll_payslip_employment (run_id, employment_id), "
                        + "CONSTRAINT fk_payroll_payslip_run FOREIGN KEY (run_id) REFERENCES payroll_run (id), "
                        + "CONSTRAINT fk_payroll_payslip_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id), "
                        + "CONSTRAINT ck_payroll_payslip_amount CHECK (gross_amount >= 0 AND deduction_amount >= 0 "
                        + "AND employer_cost_amount >= 0 AND tax_amount >= 0)"
                        + ") COMMENT='工資單'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_payslip_item ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "payslip_id BIGINT NOT NULL COMMENT '工資單ID', "
                        + "item_type VARCHAR(32) NOT NULL COMMENT 'BASE_SALARY/SOCIAL_EMPLOYEE/SOCIAL_EMPLOYER/TAX', "
                        + "component_id BIGINT DEFAULT NULL COMMENT '薪酬項目ID', "
                        + "plan_id BIGINT DEFAULT NULL COMMENT '參保方案ID', "
                        + "item_name VARCHAR(128) NOT NULL COMMENT '名稱快照', "
                        + "amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '金額', "
                        + "taxable TINYINT NOT NULL DEFAULT 0 COMMENT '是否應稅', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '展示順序', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "KEY idx_payroll_payslip_item (payslip_id, sort_order), "
                        + "CONSTRAINT fk_payroll_payslip_item_slip FOREIGN KEY (payslip_id) REFERENCES payroll_payslip (id), "
                        + "CONSTRAINT ck_payroll_payslip_item_amount CHECK (amount >= 0)"
                        + ") COMMENT='工資單明細'");
    }

    private void verify() {
        for (String table : new String[]{"payroll_run", "payroll_payslip", "payroll_payslip_item"}) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就緒");
            }
        }
    }
}
