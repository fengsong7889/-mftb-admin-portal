package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 薪酬規則建表（D3 第一批）：規則集 + 個稅級距。
 * <p>
 * 這裡只落"能配置規則"的容器，不種任何默認費率：內地社保基數按統籌區每年公布，
 * 任何內置默認值都會在某個城市算錯，因此首啟後必須由業務錄入才能試算。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(28)
public class PayrollRuleSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:payroll-rule-schema:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("薪酬規則建表失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_rule_set ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(64) NOT NULL COMMENT '規則集編碼', "
                        + "name VARCHAR(128) NOT NULL COMMENT '名稱', "
                        + "jurisdiction VARCHAR(8) NOT NULL COMMENT '法域 CN/HK/MO', "
                        + "city_code VARCHAR(16) NOT NULL COMMENT '統籌區/城市代碼', "
                        + "city_name VARCHAR(64) DEFAULT NULL COMMENT '城市名稱', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種', "
                        + "basic_deduction DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '個稅基本減除費用（月）', "
                        + "effective_from DATE NOT NULL COMMENT '生效起（含）', "
                        + "effective_to DATE DEFAULT NULL COMMENT '生效止（含）', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "version_label VARCHAR(64) DEFAULT NULL COMMENT '版本說明', "
                        + "remark VARCHAR(255) DEFAULT NULL, "
                        + "updated_by VARCHAR(64) DEFAULT NULL, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        + "UNIQUE KEY uk_payroll_rule_set_code (code), "
                        + "KEY idx_payroll_rule_set_city (city_code, effective_from, effective_to, status), "
                        + "CONSTRAINT ck_payroll_rule_set_period CHECK (effective_to IS NULL OR effective_to >= effective_from), "
                        + "CONSTRAINT ck_payroll_rule_set_deduction CHECK (basic_deduction >= 0)"
                        + ") COMMENT='薪酬規則集（城市×期間）'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_tax_bracket ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "rule_set_id BIGINT NOT NULL COMMENT '規則集ID', "
                        + "level_no INT NOT NULL COMMENT '級次', "
                        + "lower_bound DECIMAL(18,4) NOT NULL COMMENT '下限（含）', "
                        + "upper_bound DECIMAL(18,4) DEFAULT NULL COMMENT '上限（不含，空=無上限）', "
                        + "rate DECIMAL(6,4) NOT NULL COMMENT '稅率 0~1', "
                        + "quick_deduction DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '速算扣除數', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "deleted TINYINT NOT NULL DEFAULT 0, "
                        + "UNIQUE KEY uk_payroll_tax_bracket_level (rule_set_id, level_no), "
                        + "CONSTRAINT fk_payroll_tax_bracket_rule FOREIGN KEY (rule_set_id) REFERENCES payroll_rule_set (id), "
                        + "CONSTRAINT ck_payroll_tax_bracket_rate CHECK (rate >= 0 AND rate <= 1), "
                        + "CONSTRAINT ck_payroll_tax_bracket_range CHECK (upper_bound IS NULL OR upper_bound > lower_bound)"
                        + ") COMMENT='個稅級距'");
    }

    private void verify() {
        for (String table : new String[]{"payroll_rule_set", "payroll_tax_bracket"}) {
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
