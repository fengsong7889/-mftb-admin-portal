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
 * 员工模型权控模块数据初始化器：启动时自动建立 ai_emp_pos_auth_strategy / ai_emp_role_auth 表
 * （职位授权策略 + 自定义角色授权，原前端 localStorage mock 落库）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmpAuthDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "96_emp_pos_role_auth.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("emp_auth:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("读取初始化脚本失败: " + INIT_SCRIPT, e);
                }
            });
        } catch (Exception e) {
            log.error("员工模型权控建表失败: {}", e.getMessage(), e);
        }
    }

    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过初始化", scriptName);
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
            log.info("已执行 {} — 员工模型权控表建立完成", scriptName);
        }
    }
}
