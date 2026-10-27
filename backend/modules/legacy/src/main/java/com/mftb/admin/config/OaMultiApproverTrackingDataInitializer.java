package com.mftb.admin.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 128: OA多人审批审批记录追踪
 * 为 biz_oa_approval_task 新增 approved_by / approved_times 字段
 */
@Slf4j
@Component
@Order(128)
public class OaMultiApproverTrackingDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "128_oa_multi_approver_tracking.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    public OaMultiApproverTrackingDataInitializer(JdbcTemplate jdbcTemplate,
                                                   SchemaVersionTracker versionTracker) {
        this.jdbcTemplate = jdbcTemplate;
        this.versionTracker = versionTracker;
    }

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("oa_multi_approver:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + INIT_SCRIPT, e);
                }
            });
        } catch (Exception e) {
            log.error("OA多人审批追踪迁移失敗: {}", e.getMessage(), e);
        }
    }

    private void executeSqlScript(String scriptName) throws IOException {
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
                    jdbcTemplate.execute(trimmed);
                }
            }
        }
    }
}
