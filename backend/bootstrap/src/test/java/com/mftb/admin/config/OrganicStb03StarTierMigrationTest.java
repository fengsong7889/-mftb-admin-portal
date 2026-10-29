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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证 organic:stb03-star-tier-v1：
 * 1) 旧「評價得分 · 逐檔固定/動態加減分」行收斂為「店鋪綜合分 · 星級梯度加分」，
 *    condition_items 換成 condition='star_tier' + star 下界 + score 的默認梯度；
 * 2) stat_days 被清空（本項不再統計期間）；
 * 3) 界面已配成 star_tier 的檔位與管理員自定義的名称/說明原封不動，避免頂掉人工配置；
 * 4) 后置校驗能把未收斂的行暴露出來（不記版本、下次啟動重試），未播種不算失敗；
 * 5) 重跑幂等。
 */
class OrganicStb03StarTierMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb03_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), mode INT DEFAULT 6, score INT DEFAULT 0, "
                + "stat_days INT DEFAULT NULL, condition_items VARCHAR(2000), "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        // 种子形态：23_organic_score.sql 写入的旧口径行（逐檔 fixed_bonus / fixed_deduction，無 star 下界）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, mode, score, stat_days, condition_items) VALUES "
                + "(3, 'STB_03', '" + OrganicScoreDataInitializer.STB03_LEGACY_NAME + "', "
                + "'" + OrganicScoreDataInitializer.STB03_LEGACY_DESCRIPTION + "', 6, 0, 30, "
                + "'[{\"condition\":\"fixed_bonus\",\"score\":50},{\"condition\":\"fixed_deduction\",\"score\":20}]'), "
                + "(4, 'STB_04', '店鋪標籤', '不得被本遷移動到', 1, 10, NULL, NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb03StarTier");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb03StarTier");
    }

    private Map<String, Object> stb03() {
        return jdbc.queryForMap(
                "SELECT name, description, stat_days, condition_items, updated_by FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_03'");
    }

    @Test
    @DisplayName("旧逐档加减分行整行收敛为星级梯度，并清空统计天数")
    void rewritesLegacyRowToStarTierGradient() {
        // 未迁移时校验必须失败（启动暴露，不记版本）
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> row = stb03();
        assertEquals(OrganicScoreDataInitializer.STB03_NEW_NAME, row.get("name"));
        assertEquals(OrganicScoreDataInitializer.STB03_NEW_DESCRIPTION, row.get("description"));
        assertNull(row.get("stat_days"), "stat_days 未清空: " + row.get("stat_days"));
        String items = String.valueOf(row.get("condition_items"));
        assertTrue(items.startsWith("[{\"condition\":\"star_tier\",\"star\":5.0,\"score\":50},"), items);
        assertTrue(items.endsWith("{\"condition\":\"star_tier\",\"star\":3.0,\"score\":5}]"), items);
        assertEquals("system", row.get("updated_by"));
        // 同表其它计分项零改动，避免误改在用规则
        assertEquals("店鋪標籤", jdbc.queryForObject(
                "SELECT name FROM biz_organic_score_rule WHERE rule_code = 'STB_04'", String.class));
        verify();
    }

    @Test
    @DisplayName("界面已配成 star_tier 的档位与自定义文案不被覆写")
    void keepsAdminTunedGradientAndCustomText() {
        // 第一阶段界面已把梯度改成两档并自定义了名称/说明
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, description = ?, condition_items = ? "
                        + "WHERE rule_code = 'STB_03'",
                "我的綜合分", "我自己寫的說明",
                "[{\"condition\":\"star_tier\",\"star\":4.5,\"score\":99}]");

        migrate();

        Map<String, Object> row = stb03();
        assertEquals("我的綜合分", row.get("name"));
        assertEquals("我自己寫的說明", row.get("description"));
        assertEquals("[{\"condition\":\"star_tier\",\"star\":4.5,\"score\":99}]", row.get("condition_items"));
        verify();
    }

    @Test
    @DisplayName("重跑幂等：二次迁移不改变已收敛的行")
    void rerunIsIdempotent() {
        migrate();
        Map<String, Object> once = stb03();

        migrate();

        assertEquals(once, stb03());
        verify();
    }

    @Test
    @DisplayName("后置校验能暴露未收敛的行，未播种环境不算失败")
    void verifyDetectsUnmigratedRowAndIgnoresMissingRule() {
        assertThrows(IllegalStateException.class, this::verify);

        // 名称已改但档位仍是旧逐档口径：不算就绪
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, description = ?, condition_items = ?, stat_days = NULL "
                        + "WHERE rule_code = 'STB_03'",
                OrganicScoreDataInitializer.STB03_NEW_NAME, OrganicScoreDataInitializer.STB03_NEW_DESCRIPTION,
                "[{\"condition\":\"fixed_bonus\",\"score\":50}]");
        assertThrows(IllegalStateException.class, this::verify);

        // 档位已收敛但统计天数残留：不算就绪
        jdbc.update("UPDATE biz_organic_score_rule SET condition_items = ?, stat_days = 30 WHERE rule_code = 'STB_03'",
                "[{\"condition\":\"star_tier\",\"star\":5,\"score\":50}]");
        assertThrows(IllegalStateException.class, this::verify);

        migrate();
        verify();

        // 未播种的环境（没有 STB_03 行）不算失败
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_03'");
        verify();
    }
}
