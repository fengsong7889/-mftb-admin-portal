package com.mftb.admin.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.MachineTranslateRequest;
import com.mftb.admin.service.TranslationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 多语言翻译模块初始化器: 启动时幂等创建 sys_language / sys_translation 表并写入种子数据
 * <p>
 * 对应脚本 backend/sql/19_translation.sql;
 * 排在 DataInitializer 之后执行（依赖 sys_menu 已就绪），菜单名自动同步为翻译字段。
 * <p>
 * 启动时自动从 classpath:i18n/zh-TW.json 读取前端全量 i18n 键值，
 * 幂等同步到 sys_translation 表，确保翻译字段覆盖整个系统，并对新增字段自动触发机翻。
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class TranslationDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final TranslationService translationService;
    private final ObjectMapper objectMapper;

    @Override
    public void run(String... args) {
        try {
            createTables();
            seedLanguages();
            syncMenuNames();
            List<Long> newIds = syncI18nKeys();
            if (!newIds.isEmpty()) {
                // 后台异步触发机翻，避免阻塞启动
                List<Long> idsToTranslate = new ArrayList<>(newIds);
                Thread thread = new Thread(() -> {
                    try {
                        MachineTranslateRequest req = new MachineTranslateRequest();
                        req.setIds(idsToTranslate);
                        int filled = translationService.machineTranslate(req);
                        log.info("多语言模块: 新增字段自动机翻完成，填充 {} 条翻译", filled);
                    } catch (Exception e) {
                        log.warn("多语言模块: 自动机翻失败（可稍后手动执行）: {}", e.getMessage());
                    }
                }, "i18n-auto-translate");
                thread.setDaemon(true);
                thread.start();
            }
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

    /**
     * 从 classpath:i18n/zh-TW.json 读取前端全量 i18n 键值，幂等同步到 sys_translation 表。
     * 返回本次新增的翻译记录 ID 列表（用于后续自动机翻）。
     */
    private List<Long> syncI18nKeys() {
        List<Long> newIds = new ArrayList<>();
        try {
            ClassPathResource resource = new ClassPathResource("i18n/zh-TW.json");
            if (!resource.exists()) {
                log.warn("多语言模块: classpath:i18n/zh-TW.json 不存在，跳过 i18n 字段同步");
                return newIds;
            }

            // 读取并展平 JSON
            Map<String, String> flatMap = new LinkedHashMap<>();
            try (InputStream is = resource.getInputStream()) {
                String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
                flattenMap("", root, flatMap);
            }

            if (flatMap.isEmpty()) {
                return newIds;
            }

            // 一次性查询已有 field_key，避免逐条检查
            Set<String> existingKeys = new HashSet<>(
                    jdbcTemplate.queryForList(
                            "SELECT field_key FROM sys_translation", String.class));

            // 批量插入不存在的字段
            int batchCount = 0;
            for (Map.Entry<String, String> entry : flatMap.entrySet()) {
                String fieldKey = entry.getKey();
                if (existingKeys.contains(fieldKey)) continue;

                String fieldName = truncate(entry.getValue(), 100);
                String category = truncate(fieldKey.contains(".") ? fieldKey.substring(0, fieldKey.indexOf('.')) : "biz", 32);
                String translationsJson = buildZhTwJson(entry.getValue());

                jdbcTemplate.update(
                        "INSERT INTO sys_translation (field_key, field_name, category, translations_json, source) "
                                + "VALUES (?, ?, ?, ?, 'sync')",
                        fieldKey, fieldName, category, translationsJson);
                batchCount++;
            }

            if (batchCount > 0) {
                log.info("多语言模块: 已从 i18n/zh-TW.json 同步 {} 个新字段到翻译表（总计 {} 个键）", batchCount, flatMap.size());

                // 查询新增记录的 ID
                newIds = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_translation WHERE source = 'sync' AND field_key NOT IN (SELECT field_key FROM sys_translation WHERE source != 'sync' OR source IS NULL)",
                        Long.class);
                // 更精确：取最近插入的 ID
                if (newIds.isEmpty()) {
                    newIds = jdbcTemplate.queryForList(
                            "SELECT id FROM sys_translation WHERE source = 'sync' ORDER BY id DESC LIMIT " + batchCount,
                            Long.class);
                }
            }
        } catch (Exception e) {
            log.warn("多语言模块: i18n 字段同步失败: {}", e.getMessage());
        }
        return newIds;
    }

    /** 递归展平嵌套 Map 为点分隔键 */
    @SuppressWarnings("unchecked")
    private void flattenMap(String prefix, Map<String, Object> map, Map<String, String> result) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map) {
                flattenMap(key, (Map<String, Object>) value, result);
            } else if (value != null) {
                result.put(key, value.toString());
            }
        }
    }

    /** 构建只含 zh-TW 的翻译 JSON */
    private String buildZhTwJson(String value) {
        String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"");
        return "{\"zh-TW\":\"" + escaped + "\"}";
    }

    /** 截断字符串至指定长度 */
    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }
}
