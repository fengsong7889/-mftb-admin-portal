package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractRegistry;
import com.mftb.admin.config.migration.ContractSpec;
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
 * V0 §八 V0-6 通知送达状态：ai_delivery_log 表建表 + 契约登记。
 * <p>使用 {@link SchemaVersionTracker#applyOnce(String, Runnable, Runnable)} 双阶校验，
 * 表未建成功不记录版本；同时通过 {@link ContractRegistry#deliveryLogContract()} 每次启动自愈。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(21)
public class AiDeliveryLogInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:delivery-log:v1.0";
    private static final String SCRIPT = "191_ai_delivery_log.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        ClassPathResource resource = new ClassPathResource(SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到迁移脚本: " + SCRIPT);
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
        } catch (Exception e) {
            throw new IllegalStateException("执行迁移脚本失败 " + SCRIPT + ": " + e.getMessage(), e);
        }
        // 通过 ContractRegistry 提供启动自愈能力：注册到启动期校验列表
        ContractRegistry.registerDeliveryLog();
        log.info("ai_delivery_log 迁移完成");
    }

    private void verifyMigration() {
        ContractSpec spec = ContractRegistry.deliveryLogContract();
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, spec.table());
        if (count == null || count == 0) {
            throw new IllegalStateException("ai_delivery_log 表未就绪");
        }
    }
}
