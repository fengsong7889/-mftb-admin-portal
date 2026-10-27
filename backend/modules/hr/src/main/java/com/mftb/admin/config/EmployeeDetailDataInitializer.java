package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 员工详情模组资料初始化器：启动时自动执行 116_employee_detail.sql
 * 包含 sys_user 新增列 + emp_emergency_contact 建表 + emp_position_record 建表
 * <p>
 * 必须早于 {@link DataInitializer}（@Order(5)）：后者启动期会 `sysUserMapper.selectOne(...)`
 * 拉取完整实体（包括 gender/mobile/email），若本迁移未先执行会报 `Unknown column`。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(4)
public class EmployeeDetailDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "116_employee_detail.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("employee_detail:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + INIT_SCRIPT, e);
                }
            });
        } catch (Exception e) {
            log.error("員工詳情模組建表/補列失敗: {}", e.getMessage(), e);
        }
        // 員工詳情: sys_user 補 gender/mobile/email 三列（此前前端提交但後端未持久化）
        try {
            versionTracker.applyOnce("employee:contact-fields-v1",
                    this::addEmployeeContactColumns, this::verifyEmployeeContactColumns);
        } catch (Exception e) {
            log.error("員工詳情聯絡欄位補列失敗: {}", e.getMessage(), e);
        }
        // P1-B: 員工合同台賬表 emp_contract
        try {
            versionTracker.applyOnce("employee:contract-schema-v1",
                    this::createContractTable, this::verifyContractTable);
        } catch (Exception e) {
            log.error("員工合同台賬建表失敗: {}", e.getMessage(), e);
        }
    }

    /** P1-B: 建 emp_contract 表（幂等） */
    private void createContractTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS emp_contract ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "user_id BIGINT NOT NULL COMMENT '關聯 sys_user.id', "
                        + "contract_no VARCHAR(64) NOT NULL COMMENT '合同編號', "
                        + "contract_type VARCHAR(32) DEFAULT NULL COMMENT '合同類型', "
                        + "company VARCHAR(128) DEFAULT NULL COMMENT '簽約主體名稱', "
                        + "start_date DATE DEFAULT NULL COMMENT '合同開始日期', "
                        + "end_date DATE DEFAULT NULL COMMENT '合同結束日期', "
                        + "sign_date DATE DEFAULT NULL COMMENT '簽訂日期', "
                        + "status VARCHAR(16) DEFAULT NULL COMMENT '狀態: 生效中/已終止/已過期', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "INDEX idx_contract_user (user_id)"
                        + ") COMMENT='員工合同台賬'");
    }

    /** P1-B: 後置校驗 emp_contract 表就緒 */
    private void verifyContractTable() {
        if (!tableExists("emp_contract")) {
            throw new IllegalStateException("emp_contract 表未就緒");
        }
    }

    private boolean tableExists(String table) {
        Integer c = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return c != null && c > 0;
    }

    /** 補列: sys_user.gender/mobile/email（失敗抛出，不吞異常） */
    private void addEmployeeContactColumns() {
        addColumnIfAbsent("sys_user", "gender",
                "ALTER TABLE sys_user ADD COLUMN gender VARCHAR(10) DEFAULT NULL COMMENT '性別'");
        addColumnIfAbsent("sys_user", "mobile",
                "ALTER TABLE sys_user ADD COLUMN mobile VARCHAR(32) DEFAULT NULL COMMENT '手機號'");
        addColumnIfAbsent("sys_user", "email",
                "ALTER TABLE sys_user ADD COLUMN email VARCHAR(128) DEFAULT NULL COMMENT '郵箱'");
    }

    /** 後置校驗: 三列確實就緒，否則抛出（不記版本，下次重試） */
    private void verifyEmployeeContactColumns() {
        for (String col : new String[] {"gender", "mobile", "email"}) {
            if (!columnExists("sys_user", col)) {
                throw new IllegalStateException("sys_user 列未就緒: " + col);
            }
        }
    }

    private void addColumnIfAbsent(String table, String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自動遷移欄位 {}.{}", table, column);
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳過初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    try {
                        jdbcTemplate.execute(trimmed);
                    } catch (Exception ex) {
                        // ALTER TABLE ADD COLUMN 可能因列已存在而报错，忽略重复列错误
                        String msg = ex.getMessage();
                        Throwable cause = ex.getCause();
                        String causeMsg = cause != null ? cause.getMessage() : "";
                        if ((msg != null && msg.contains("Duplicate column"))
                                || (causeMsg != null && causeMsg.contains("Duplicate column"))) {
                            log.debug("列已存在，跳過: {}", ex.getMessage());
                        } else {
                            throw ex;
                        }
                    }
                }
            }
            log.info("已執行 {} — 員工詳情模組表結構就緒", scriptName);
        }
    }
}
