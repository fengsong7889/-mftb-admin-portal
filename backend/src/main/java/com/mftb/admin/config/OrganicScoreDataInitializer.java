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
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 自然流量评分配置初始化器: 启动时幂等创建评分维度/规则表并写入种子数据
 * <p>
 * 执行顺序：
 * 1. 幂等添加新数据库列（ALTER TABLE ... ADD COLUMN IF NOT EXISTS）
 * 2. 执行迁移脚本（51_organic_score_code_normalization.sql）清理旧数据
 * 3. 执行种子脚本（23_organic_score.sql）INSERT IGNORE 插入新格式数据
 * 4. 执行清理脚本（52_cleanup_tmp_organic_rules.sql）清理临时编码
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrganicScoreDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "23_organic_score.sql";
    private static final String MIGRATION_SCRIPT = "51_organic_score_code_normalization.sql";
    private static final String RENAME_SCRIPT = "53_rename_sto_to_stb_plt.sql";
    private static final String CLEANUP_SCRIPT = "52_cleanup_tmp_organic_rules.sql";

    /** 需要幂等添加的列：列名 → DDL 定义 */
    private static final Map<String, String> NEW_COLUMNS = new LinkedHashMap<>();
    static {
        NEW_COLUMNS.put("prerequisites",       "VARCHAR(500) DEFAULT NULL COMMENT '前提條件'");
        NEW_COLUMNS.put("stat_days_total",     "INT DEFAULT NULL COMMENT '歷史基線天數'");
        NEW_COLUMNS.put("stat_days_recent",    "INT DEFAULT NULL COMMENT '近期對比天數'");
        NEW_COLUMNS.put("time_range_scores",   "JSON DEFAULT NULL COMMENT '分時段配送範圍分數 JSON'");
        NEW_COLUMNS.put("condition_items",     "JSON DEFAULT NULL COMMENT '條件計分項 JSON'");
        NEW_COLUMNS.put("calc_interval_hours", "DECIMAL(5,2) DEFAULT NULL COMMENT '定時監控間隔小時數'");
        NEW_COLUMNS.put("peak_time_ranges",    "JSON DEFAULT NULL COMMENT '高峰時段定義 JSON'");
        NEW_COLUMNS.put("deduction_per_order", "INT DEFAULT NULL COMMENT '每單固定扣分'");
        NEW_COLUMNS.put("decay_coefficient",   "DECIMAL(10,4) DEFAULT NULL COMMENT '衰減係數'");
        NEW_COLUMNS.put("blocked_merchants",   "JSON DEFAULT NULL COMMENT '屏蔽商家列表 JSON'");
    }

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        // Step 1: 幂等添加新列
        migrateColumns();

        // Step 2: 执行迁移脚本（清理旧数据 + 更新已有规则字段）
        try {
            executeSqlScript(MIGRATION_SCRIPT);
        } catch (Exception e) {
            log.error("自然流量评分编码规范化迁移失败：{}", e.getMessage(), e);
        }
        
        // Step 3: 执行重命名脚本（STO_ → STB_/PLT_ 前缀规范化）
        try {
            executeSqlScript(RENAME_SCRIPT);
        } catch (Exception e) {
            log.error("自然流量评分编码重命名失败：{}", e.getMessage(), e);
        }
        
        // Step 4: 执行种子脚本（INSERT IGNORE 插入新格式数据）
        try {
            executeSqlScript(INIT_SCRIPT);
        } catch (Exception e) {
            log.error("自然流量评分配置初始化失败：{}", e.getMessage(), e);
        }
        
        // Step 5: 清理临时编码
        try {
            executeSqlScript(CLEANUP_SCRIPT);
        } catch (Exception e) {
            log.error("自然流量评分临时编码清理失败：{}", e.getMessage(), e);
        }
    }

    /** 幂等添加缺失的数据库列 */
    private void migrateColumns() {
        for (Map.Entry<String, String> entry : NEW_COLUMNS.entrySet()) {
            String col = entry.getKey();
            String def = entry.getValue();
            try {
                Integer count = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_organic_score_rule' AND COLUMN_NAME = ?",
                        Integer.class, col);
                if (count != null && count == 0) {
                    jdbcTemplate.execute("ALTER TABLE `biz_organic_score_rule` ADD COLUMN `" + col + "` " + def);
                    log.info("已添加 biz_organic_score_rule.{} 列", col);
                }
            } catch (Exception e) {
                log.warn("添加列 {} 时出错: {}", col, e.getMessage());
            }
        }
    }

    /** 执行初始化脚本（去除行注释后按分号逐条执行，CREATE TABLE IF NOT EXISTS + INSERT 幂等） */
    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过自然流量评分初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            // 去除行注释（-- 开头）
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            // 按分号分割并逐条执行
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 {} 初始化自然流量评分配置表", scriptName);
        }
    }
}
