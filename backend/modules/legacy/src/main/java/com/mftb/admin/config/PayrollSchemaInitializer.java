package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 薪酬基础建表（D2 第一批）：薪酬项目 + 薪酬标准（定调薪，日期生效）。
 * <p>
 * 本批只落结构与校验，不接核算（D3）：先把"项目口径"与"每段雇佣的工资标准"立住，
 * 否则 D3 的试算没有可信输入。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26)
public class PayrollSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY_SCHEMA = "hcm:payroll-schema:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY_SCHEMA, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("薪酬基础建表失败: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_component ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '項目編碼', "
                        + "name VARCHAR(128) NOT NULL COMMENT '項目名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "component_type VARCHAR(32) NOT NULL COMMENT 'EARNING/DEDUCTION/EMPLOYER_COST', "
                        + "taxable TINYINT NOT NULL DEFAULT 0 COMMENT '1=應稅 0=免稅', "
                        + "currency VARCHAR(8) DEFAULT NULL COMMENT '幣種（空=隨薪酬標準）', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '工資單展示順序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_payroll_component_code (code), "
                        + "KEY idx_payroll_component_type (component_type, status)"
                        + ") COMMENT='薪酬項目'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS payroll_salary_standard ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "employment_id BIGINT NOT NULL COMMENT '雇傭關係ID', "
                        + "base_amount DECIMAL(18,4) NOT NULL COMMENT '基本工資', "
                        + "currency VARCHAR(8) NOT NULL COMMENT '幣種 CNY/HKD/MOP', "
                        + "change_type VARCHAR(16) NOT NULL DEFAULT 'ADJUST' COMMENT 'HIRE/ADJUST/PROMOTION/ANNUAL', "
                        + "effective_from DATE NOT NULL COMMENT '生效起（含）', "
                        + "effective_to DATE DEFAULT NULL COMMENT '生效止（含，空=當前有效）', "
                        + "seq_no INT NOT NULL DEFAULT 1 COMMENT '同日序號', "
                        + "reason VARCHAR(255) DEFAULT NULL COMMENT '調薪原因', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        // 生成列只对"当前有效的薪酬标准"取 employment_id，唯一键只约束这一类行：
                        // 并发两次定薪时服务层区间校验会同时通过，必须由数据库兜住
                        + "current_employment BIGINT GENERATED ALWAYS AS ("
                        + "CASE WHEN effective_to IS NULL AND deleted = 0 THEN employment_id ELSE NULL END) STORED "
                        + "COMMENT '當前標準唯一約束載體', "
                        + "UNIQUE KEY uk_payroll_standard_current (current_employment), "
                        + "UNIQUE KEY uk_payroll_standard_version (employment_id, effective_from, seq_no), "
                        + "KEY idx_payroll_standard_period (employment_id, effective_from, effective_to), "
                        + "CONSTRAINT fk_payroll_standard_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id), "
                        + "CONSTRAINT ck_payroll_standard_amount CHECK (base_amount >= 0), "
                        + "CONSTRAINT ck_payroll_standard_period CHECK (effective_to IS NULL OR effective_to >= effective_from)"
                        + ") COMMENT='薪酬標準（定調薪，日期生效）'");
    }

    private void verify() {
        for (String table : new String[]{"payroll_component", "payroll_salary_standard"}) {
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
