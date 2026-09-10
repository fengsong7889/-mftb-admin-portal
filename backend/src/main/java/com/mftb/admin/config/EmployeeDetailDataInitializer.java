package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 員工詳情模組資料初始化器：啟動時自動執行 116_employee_detail.sql
 * 包含 sys_user 新增列 + emp_emergency_contact 建表 + emp_position_record 建表
 */
@Slf4j
@Component
@RequiredArgsConstructor
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
                        // ALTER TABLE ADD COLUMN 可能因列已存在而報錯，忽略重複列錯誤
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
