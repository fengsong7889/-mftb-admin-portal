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
 * 广告推广模块数据初始化器: 启动时自动创建 biz_ad_* 表并写入种子数据
 * <p>
 * 对应脚本 backend/sql/09_ad_promotion.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdPromotionDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        try {
            ClassPathResource resource = new ClassPathResource("09_ad_promotion.sql");
            if (!resource.exists()) {
                log.warn("未找到 09_ad_promotion.sql，跳过广告推广表初始化");
                return;
            }
            try (InputStream is = resource.getInputStream()) {
                String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
                // 先去除行注释（-- 开头），避免分号分割后注释与下一条语句粘连
                String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
                // 按分号分割并逐条执行（忽略空语句）
                for (String stmt : noComment.split(";")) {
                    String trimmed = stmt.trim();
                    if (!trimmed.isEmpty()) {
                        jdbcTemplate.execute(trimmed);
                    }
                }
                log.info("已执行 09_ad_promotion.sql 初始化广告推广表");
            }
        } catch (Exception e) {
            log.error("广告推广表初始化失败: {}", e.getMessage(), e);
        }
    }
}
