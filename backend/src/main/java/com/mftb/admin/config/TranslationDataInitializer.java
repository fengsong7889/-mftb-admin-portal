package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 多语言翻译模块初始化器: 启动时幂等创建 sys_language / sys_translation 表并写入种子数据
 * <p>
 * 对应脚本 backend/sql/19_translation.sql;
 * 排在 DataInitializer 之后执行（依赖 sys_menu 已就绪），菜单名自动同步为翻译字段
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class TranslationDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        try {
            createTables();
            seedLanguages();
            syncMenuNames();
        } catch (Exception e) {
            log.error("多语言翻译模块初始化失败: {}", e.getMessage(), e);
        }
    }

    private void createTables() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_language ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "code VARCHAR(16) NOT NULL COMMENT '语言代码 ISO 639-1', "
                        + "native_name VARCHAR(100) NOT NULL COMMENT '母语名称', "
                        + "flag VARCHAR(16) DEFAULT '🌐' COMMENT '国旗 Emoji', "
                        + "names_json TEXT NULL COMMENT '各系统语言下的显示名 JSON', "
                        + "status INT DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_lang_code (code)"
                        + ") COMMENT='多语言配置-已注册语言表'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_translation ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "field_key VARCHAR(128) NOT NULL COMMENT '字段Key, 全局唯一', "
                        + "field_name VARCHAR(100) NOT NULL COMMENT '字段名称（业务识别用，允许重复）', "
                        + "category VARCHAR(32) DEFAULT 'biz' COMMENT '分类: common/status/action/menu/biz/ui', "
                        + "translations_json TEXT NULL COMMENT '翻译 JSON', "
                        + "source VARCHAR(16) DEFAULT 'manual' COMMENT '来源: manual/sync', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_field_key (field_key)"
                        + ") COMMENT='多语言配置-翻译字段表'");

        // 配置表已改为物理删除: 清理历史逻辑删除残留行, 避免其重新可见并占用唯一键
        jdbcTemplate.update("DELETE FROM sys_language WHERE deleted <> 0");
        jdbcTemplate.update("DELETE FROM sys_translation WHERE deleted <> 0");
    }

    /** 默认 5 语言种子（仅插入不存在的） */
    private void seedLanguages() {
        String[][] seeds = {
                {"zh-TW", "繁體中文", "🇨🇳", "{\"zh-TW\":\"繁中\",\"en\":\"Chinese\",\"ja\":\"中国語\",\"ko\":\"중국어\",\"ru\":\"Китайский\"}"},
                {"en", "English", "🇺🇸", "{\"zh-TW\":\"英文\",\"en\":\"English\",\"ja\":\"英語\",\"ko\":\"영어\",\"ru\":\"Английский\"}"},
                {"ja", "日本語", "🇯🇵", "{\"zh-TW\":\"日文\",\"en\":\"Japanese\",\"ja\":\"日本語\",\"ko\":\"일본어\",\"ru\":\"Японский\"}"},
                {"ko", "한국어", "🇰🇷", "{\"zh-TW\":\"韓文\",\"en\":\"Korean\",\"ja\":\"韓国語\",\"ko\":\"한국어\",\"ru\":\"Корейский\"}"},
                {"ru", "Русский", "🇷🇺", "{\"zh-TW\":\"俄文\",\"en\":\"Russian\",\"ja\":\"ロシア語\",\"ko\":\"러시아어\",\"ru\":\"Русский\"}"},
        };
        int created = 0;
        for (String[] s : seeds) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_language WHERE code = ? AND deleted = 0", Integer.class, s[0]);
            if (count != null && count > 0) {
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_language (code, native_name, flag, names_json, status) VALUES (?, ?, ?, ?, 1)",
                    s[0], s[1], s[2], s[3]);
            created++;
        }
        if (created > 0) {
            log.info("多语言模块: 已写入 {} 个默认语言", created);
        }
    }

    /** 菜单名自动同步为翻译字段（category=menu，从 sys_menu 的 name/name_en 生成，仅插入不存在的） */
    private void syncMenuNames() {
        int synced = jdbcTemplate.update(
                "INSERT INTO sys_translation (field_key, field_name, category, translations_json, source) "
                        + "SELECT CONCAT('menu.', m.menu_key), m.name, 'menu', "
                        + "CONCAT('{\"zh-TW\":\"', "
                        + "REPLACE(REPLACE(IFNULL(m.name, ''), '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), "
                        + "'\",\"en\":\"', "
                        + "REPLACE(REPLACE(IFNULL(m.name_en, ''), '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), "
                        + "'\"}'), 'sync' "
                        + "FROM sys_menu m "
                        + "WHERE m.deleted = 0 AND m.menu_key IS NOT NULL AND m.menu_key <> '' "
                        + "AND NOT EXISTS (SELECT 1 FROM sys_translation t WHERE t.field_key = CONCAT('menu.', m.menu_key))");
        if (synced > 0) {
            log.info("多语言模块: 已自动同步 {} 个菜单名称为翻译字段", synced);
        }
    }
}
