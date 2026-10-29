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
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证 organic:stb08-cancel-rate-v1：
 * 1) 旧「取消訂單 · 每取消一單按次扣分」行收斂為「訂單取消率 · 梯度加分」：
 *    mode（3→6）、name、description、condition_items 一起改，檔位用 cancel_rate_max、門檻用 cancel_min_orders；
 * 2) 舊口徑專用列 deduction_per_order 置 NULL；stat_days 只在 NULL 時補默認 30，管理員已調的天數不頂；
 * 3) 界面已配成取消率梯度的行原封不動，避免頂掉人工檔位；
 * 4) 後置校驗能把未收斂的行暴露出來，未播種不算失敗；
 * 5) 重跑幂等。
 */
class OrganicStb08CancelRateMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb08_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), mode INT, score INT DEFAULT 0, "
                + "stat_days INT DEFAULT NULL, deduction_per_order INT DEFAULT NULL, condition_items VARCHAR(2000), "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        // 种子形态：23_organic_score.sql 写入的旧口径行（mode=3 規則減分、每單扣 80、無 condition_items）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, mode, score, stat_days, deduction_per_order) VALUES "
                + "(8, 'STB_08', '" + OrganicScoreDataInitializer.STB08_LEGACY_NAME + "', "
                + "'" + OrganicScoreDataInitializer.STB08_LEGACY_DESCRIPTION + "', 3, 0, 7, 80)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb08CancelRate");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb08CancelRate");
    }

    private Map<String, Object> stb08() {
        return jdbc.queryForMap(
                "SELECT name, description, mode, stat_days, deduction_per_order, condition_items, updated_by "
                        + "FROM biz_organic_score_rule WHERE rule_code = 'STB_08'");
    }

    @Test
    @DisplayName("旧按次计罚行收敛为取消率梯度：mode/名称/说明/档位一起改，每单扣分列清空")
    void rewritesLegacyRowToCancelRateGradient() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> row = stb08();
        assertEquals(OrganicScoreDataInitializer.STB08_NEW_NAME, row.get("name"));
        assertEquals(OrganicScoreDataInitializer.STB08_NEW_DESCRIPTION, row.get("description"));
        assertEquals(OrganicScoreDataInitializer.MODE_CONDITIONAL, row.get("mode"));
        // 旧口径专用列必须清空：留着会被读成「本项还在按次扣分」
        assertNull(row.get("deduction_per_order"), "deduction_per_order 未清空: " + row.get("deduction_per_order"));
        // 管理员已调过的统计窗口（7 天）保留，只在 NULL 时补默认 30
        assertEquals(7, row.get("stat_days"));
        String items = String.valueOf(row.get("condition_items"));
        assertTrue(items.startsWith("[{\"condition\":\"cancel_rate_max\",\"rate\":1,\"score\":30},"), items);
        assertTrue(items.endsWith("{\"condition\":\"cancel_min_orders\",\"minOrders\":30,\"score\":0}]"), items);
        assertEquals("system", row.get("updated_by"));
        verify();
    }

    @Test
    @DisplayName("统计天数为空时补默认 30，界面已配成新梯度的行不被覆写")
    void fillsDefaultStatDaysAndKeepsAdminTunedGradient() {
        jdbc.update("UPDATE biz_organic_score_rule SET stat_days = NULL, name = ?, description = ?, condition_items = ? "
                        + "WHERE rule_code = 'STB_08'",
                "我的取消率", "我自己寫的說明",
                "[{\"condition\":\"cancel_rate_max\",\"rate\":2,\"score\":88},"
                        + "{\"condition\":\"cancel_min_orders\",\"minOrders\":50,\"score\":0}]");

        migrate();

        Map<String, Object> row = stb08();
        assertEquals(OrganicScoreDataInitializer.STB08_DEFAULT_STAT_DAYS, row.get("stat_days"));
        assertEquals("我的取消率", row.get("name"));
        assertEquals("我自己寫的說明", row.get("description"));
        assertEquals("[{\"condition\":\"cancel_rate_max\",\"rate\":2,\"score\":88},"
                + "{\"condition\":\"cancel_min_orders\",\"minOrders\":50,\"score\":0}]", row.get("condition_items"));
        verify();
    }

    @Test
    @DisplayName("重跑幂等：二次迁移不改变已收敛的行")
    void rerunIsIdempotent() {
        migrate();
        Map<String, Object> once = stb08();

        migrate();

        assertEquals(once, stb08());
        verify();
    }

    @Test
    @DisplayName("后置校验能暴露未收敛的行，未播种环境不算失败")
    void verifyDetectsUnmigratedRowAndIgnoresMissingRule() {
        assertThrows(IllegalStateException.class, this::verify);

        // 名称已改但仍是按次扣分口径（mode=3、每單扣分還在）：不算就绪
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, mode = 3, deduction_per_order = 80 WHERE rule_code = 'STB_08'",
                OrganicScoreDataInitializer.STB08_NEW_NAME);
        assertThrows(IllegalStateException.class, this::verify);

        // 口径已改但档位混有旧标记：不算就绪
        jdbc.update("UPDATE biz_organic_score_rule SET mode = 6, deduction_per_order = NULL, condition_items = ? "
                        + "WHERE rule_code = 'STB_08'",
                "[{\"condition\":\"per_cancel_deduction\",\"score\":80}]");
        assertThrows(IllegalStateException.class, this::verify);

        migrate();
        verify();

        // 未播种的环境（没有 STB_08 行）不算失败
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_08'");
        verify();
    }
}
