package com.mftb.admin.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 通知底座建表脚本结构锁。
 *
 * <p>与会议域同一取舍：脚本是 MySQL 方言（表选项 {@code COMMENT=}、{@code ON DUPLICATE KEY}、
 * 外键），H2 即使开 MySQL 模式也不能等价执行，真跑一遍只会得到「看起来测过了」的假绿。
 * 这里锁的是幂等性与表集合这些真正决定「生产能不能起来」的事实，方言执行由启动期
 * {@code verifySchema}（查 information_schema）在真实库上把关。
 */
class NotificationSchemaScriptTest {

    private static final String SCRIPT = NotificationSchemaMigrationInitializer.SCHEMA_SCRIPT;

    private static final List<String> TABLES = NotificationSchemaMigrationInitializer.TABLES;

    private String classpathScript() {
        try (var in = new ClassPathResource(SCRIPT).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Test
    @DisplayName("两张表都必须由脚本建出，缺一张会议域就起不来")
    void createsBothNotificationTables() {
        String sql = classpathScript();
        for (String table : TABLES) {
            assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS " + table + " ("),
                    "缺少建表语句: " + table + "（生产缺这张表会让 230 会议建表脚本直接抛 Table doesn't exist）");
        }
    }

    @Test
    @DisplayName("全部写入都是幂等的，部分套用过的环境可以安全重跑")
    void everySeedStatementIsIdempotent() {
        String sql = classpathScript().replaceAll("(?m)^\\s*--.*$", "").replaceAll("\\s+", " ");
        // 旧钉钉配置搬迁与场景种子都必须带守卫，否则重跑会插出重复行或覆盖管理员改过的路由
        assertTrue(sql.contains("WHERE (c.app_key <> '' OR c.app_secret <> ''"),
                "旧配置搬迁缺少「有凭据才搬」守卫，会把空应用插进生产");
        assertTrue(sql.contains("AND NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'notification_apps_migrated')"),
                "旧配置搬迁缺少一次性守卫键，重跑会重复搬");
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario WHERE scenario_key = 'asset_claim_sign')"),
                "资产领用签署场景缺少存在性守卫");
        assertTrue(sql.contains("ON DUPLICATE KEY UPDATE config_key = VALUES(config_key)"),
                "守卫键写入必须撞键时保持原值，否则重跑会把标记写坏");
    }

    @Test
    @DisplayName("脚本不含破坏性语句")
    void keepsNoDestructiveStatements() {
        String executable = classpathScript().replaceAll("(?m)^\\s*--.*$", "");
        for (String banned : List.of("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM")) {
            assertFalse(executable.toUpperCase().contains(banned), "可执行语句里出现了破坏性操作: " + banned);
        }
    }

    @Test
    @DisplayName("backend/sql 参考副本与 classpath 真值逐字一致")
    void referenceCopyMatchesClasspathSource() throws IOException {
        // 双份漂移是「一份执行、一份给 DBA 看」的布局最容易出的问题：改了副本没改真值，
        // 或反过来，手工执行的结构与启动期不一致。
        String copy = Files.readString(Path.of("sql", SCRIPT));
        assertEquals(classpathScript(), copy, SCRIPT + " 的参考副本与 classpath 真值不一致");
    }
}
