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
 * 系统活动表初始化器: 启动时幂等创建 biz_activity 表并写入种子活动数据
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ActivityDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "64_activity_module.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        // 版本化执行: 已执行过则重启时直接跳过 (启动提速); 脚本内容变更后递增版本号即可重跑;
        // 失败时异常外抛, 版本不记录, 下次启动重试
        try {
            versionTracker.applyOnce("activity:64_activity_module:v1", () -> {
                try {
                    init();
                } catch (Exception e) {
                    throw new IllegalStateException("活动表初始化失败", e);
                }
            });
        } catch (Exception e) {
            log.error("系统活动表初始化失败：{}", e.getMessage(), e);
        }
    }

    private void init() throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(INIT_SCRIPT);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过活动表初始化", INIT_SCRIPT);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            // 去除行注释（-- 开头）
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            // 按分号分割并逐条执行（CREATE TABLE IF NOT EXISTS + WHERE NOT EXISTS 幂等）
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 {} 初始化系统活动表", INIT_SCRIPT);
        }
    }
}
