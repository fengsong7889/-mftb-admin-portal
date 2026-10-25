package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 福利參保建表（D2 第三批）。
 * <p>
 * 「同一雇佣在同一方案只允许一段在保」由生成列 active_key + 唯一键兜住：
 * 服务层的区间校验在并发下会同时通过，只有数据库能保证不出现两份在保记录。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(27)
public class PayrollBenefitSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:payroll-benefit-schema:v1.0";

    /** v1.1：方案加統籌區/城市維度——內地社保基數按城市公布，方案不帶城市就無法正確匹配 */
    static final String VERSION_KEY_CITY = "hcm:payroll-benefit-schema:v1.1";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
                migrate();
            }
            if (!versionTracker.applyOnce(VERSION_KEY_CITY, this::migrateCity, this::verifyCity)) {
                migrateCity();
            }
        } catch (Exception e) {
            log.error("福利參保建表失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_benefit_plan ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '方案編碼', "
                        + "name VARCHAR(128) NOT NULL COMMENT '方案名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "plan_type VARCHAR(32) NOT NULL COMMENT 'SOCIAL_INSURANCE/HOUSING_FUND/MEDICAL/GROUP_LIFE/OTHER', "
                        + "jurisdiction VARCHAR(8) NOT NULL COMMENT '法域 CN/HK/MO', "
                        + "employer_ratio DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '雇主比例 0~1', "
                        + "employee_ratio DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '雇員比例 0~1', "
                        + "min_base DECIMAL(18,4) DEFAULT NULL COMMENT '繳費基數下限', "
                        + "max_base DECIMAL(18,4) DEFAULT NULL COMMENT '繳費基數上限', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種', "
                        + "effective_from DATE NOT NULL COMMENT '生效起（含）', "
                        + "effective_to DATE DEFAULT NULL COMMENT '生效止（含）', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        + "UNIQUE KEY uk_payroll_benefit_plan_code (code), "
                        + "KEY idx_payroll_benefit_plan_scope (jurisdiction, plan_type, status), "
                        + "CONSTRAINT ck_payroll_benefit_plan_ratio CHECK (employer_ratio >= 0 AND employer_ratio <= 1 "
                        + "AND employee_ratio >= 0 AND employee_ratio <= 1 "
                        + "AND employer_ratio + employee_ratio <= 1), "
                        + "CONSTRAINT ck_payroll_benefit_plan_base CHECK (min_base IS NULL OR min_base >= 0), "
                        + "CONSTRAINT ck_payroll_benefit_plan_period CHECK (effective_to IS NULL OR effective_to >= effective_from)"
                        + ") COMMENT='福利參保方案'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_enrollment ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "employment_id BIGINT NOT NULL COMMENT '雇傭關係ID', "
                        + "plan_id BIGINT NOT NULL COMMENT '參保方案ID', "
                        + "base_amount DECIMAL(18,4) NOT NULL COMMENT '繳費基數', "
                        + "employee_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇員扣除額快照', "
                        + "employer_amount DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '雇主承擔額快照', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種快照', "
                        + "effective_from DATE NOT NULL COMMENT '參保起（含）', "
                        + "effective_to DATE DEFAULT NULL COMMENT '停保止（含，空=在保）', "
                        + "seq_no INT NOT NULL DEFAULT 1 COMMENT '同日序號', "
                        + "stop_reason VARCHAR(255) DEFAULT NULL COMMENT '停保原因', "
                        + "updated_by VARCHAR(64) DEFAULT NULL, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        // 只对「在保」行取 key，唯一键只约束这一类；其余行为 NULL 不参与
                        + "active_key VARCHAR(64) GENERATED ALWAYS AS ("
                        + "CASE WHEN effective_to IS NULL AND deleted = 0 "
                        + "THEN CONCAT(employment_id, '-', plan_id) ELSE NULL END) STORED "
                        + "COMMENT '在保唯一約束載體', "
                        + "UNIQUE KEY uk_payroll_enrollment_active (active_key), "
                        + "UNIQUE KEY uk_payroll_enrollment_version (employment_id, plan_id, effective_from, seq_no), "
                        + "KEY idx_payroll_enrollment_period (employment_id, plan_id, effective_from, effective_to), "
                        + "CONSTRAINT fk_payroll_enrollment_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id), "
                        + "CONSTRAINT fk_payroll_enrollment_plan FOREIGN KEY (plan_id) REFERENCES payroll_benefit_plan (id), "
                        + "CONSTRAINT ck_payroll_enrollment_amount CHECK (base_amount >= 0 AND employee_amount >= 0 AND employer_amount >= 0), "
                        + "CONSTRAINT ck_payroll_enrollment_period CHECK (effective_to IS NULL OR effective_to >= effective_from)"
                        + ") COMMENT='人員參保記錄'");
    }

    private void migrateCity() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                        + "AND TABLE_NAME = 'payroll_benefit_plan' AND COLUMN_NAME = 'city_code'",
                Integer.class);
        if (exists == null || exists == 0) {
            jdbcTemplate.execute("ALTER TABLE payroll_benefit_plan ADD COLUMN city_code VARCHAR(16) DEFAULT NULL "
                    + "COMMENT '統籌區/城市代碼（內地如 4403，港澳填 HK / MO）' AFTER jurisdiction");
            jdbcTemplate.execute("ALTER TABLE payroll_benefit_plan ADD KEY idx_payroll_benefit_plan_city (city_code)");
        }
    }

    private void verifyCity() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                        + "AND TABLE_NAME = 'payroll_benefit_plan' AND COLUMN_NAME = 'city_code'",
                Integer.class);
        if (exists == null || exists == 0) {
            throw new IllegalStateException("payroll_benefit_plan.city_code 列未就緒");
        }
    }

    private void verify() {
        for (String table : new String[]{"payroll_benefit_plan", "payroll_enrollment"}) {
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
