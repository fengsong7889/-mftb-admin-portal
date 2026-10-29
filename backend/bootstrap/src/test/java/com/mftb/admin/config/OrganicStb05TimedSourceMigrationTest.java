package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 organic:stb05-timed-source-v1：
 * 1) 评分说明从两个已知内置值（种子原文、organic:stb05-ontime-rate-v1 写回的文案）收敛为定时任务口径；
 * 2) stat_days_total / stat_days_recent 置 NULL（统计窗口交给业务系统，界面已移除该配置）；
 * 3) 档位 condition_items 与管理员自定义说明不动；
 * 4) 后置校验能暴露未收敛的行，未播种不算失败；重跑幂等。
 */
class OrganicStb05TimedSourceMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb05_timed_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), stat_days_total INT DEFAULT NULL, "
                + "stat_days_recent INT DEFAULT NULL, condition_items VARCHAR(2000), "
                + "updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, stat_days_total, stat_days_recent, condition_items) VALUES "
                + "(5, 'STB_05', '出餐準時率', '" + OrganicScoreDataInitializer.STB05_LEGACY_DESCRIPTIONS.get(1) + "', 7, 3, "
                + "'[{\"condition\":\"ontime_rate\",\"rate\":100,\"score\":60}]'), "
                // 另一环境的行仍带种子原文说明，两个旧值都要收敛
                + "(15, 'STB_05', '出餐準時率', '" + OrganicScoreDataInitializer.STB05_LEGACY_DESCRIPTIONS.get(0) + "', NULL, NULL, NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb05TimedSource");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb05TimedSource");
    }

    private Map<String, Object> row(long id) {
        return jdbc.queryForMap(
                "SELECT description, stat_days_total, stat_days_recent, condition_items FROM biz_organic_score_rule WHERE id = ?", id);
    }

    @Test
    @DisplayName("两个已知内置说明都收敛为定时任务口径，统计窗口列清空，档位不动")
    void syncsBuiltinDescriptionsAndClearsStatWindow() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> tuned = row(5L);
        assertEquals(OrganicScoreDataInitializer.STB05_TIMED_DESCRIPTION, tuned.get("description"));
        assertNull(tuned.get("stat_days_total"), "stat_days_total 未清空: " + tuned.get("stat_days_total"));
        assertNull(tuned.get("stat_days_recent"), "stat_days_recent 未清空: " + tuned.get("stat_days_recent"));
        // 档位由上一个迁移负责，本步不得改写
        assertEquals("[{\"condition\":\"ontime_rate\",\"rate\":100,\"score\":60}]", tuned.get("condition_items"));
        assertEquals(OrganicScoreDataInitializer.STB05_TIMED_DESCRIPTION, row(15L).get("description"));
        verify();
    }

    @Test
    @DisplayName("管理员自定义说明不被顶掉，但窗口列仍清空")
    void keepsAdminCustomDescription() {
        jdbc.update("UPDATE biz_organic_score_rule SET description = ? WHERE id = 5", "我自己寫的說明");

        migrate();

        assertEquals("我自己寫的說明", row(5L).get("description"));
        verify();
    }

    @Test
    @DisplayName("重跑幂等 + 未播种环境不算失败")
    void rerunIsIdempotentAndIgnoresMissingRule() {
        migrate();
        Map<String, Object> once = row(5L);

        migrate();

        assertEquals(once, row(5L));
        verify();

        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_05'");
        verify();
    }

    @Test
    @DisplayName("窗口列残留时校验必须让启动暴露")
    void verifyDetectsLeftoverStatWindow() {
        migrate();
        jdbc.update("UPDATE biz_organic_score_rule SET stat_days_total = 7 WHERE id = 5");

        assertThrows(IllegalStateException.class, this::verify);
    }
}
