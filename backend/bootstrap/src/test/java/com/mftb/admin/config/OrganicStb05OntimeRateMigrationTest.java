package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证 organic:stb05-ontime-rate-v1：
 * 1) 旧均值口径（over_avg_deduction）整行被覆写为出餐準時率梯度，旧档位不残留；
 * 2) 名称收敛为「出餐準時率」、stat_days_total 空值补 7、updated_by 记 system；
 * 3) 后置校验能把未收敛的行暴露出来（不记版本、下次启动重试），无该行不算失败；
 * 4) 重跑幂等。
 */
class OrganicStb05OntimeRateMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb05_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), condition_items VARCHAR(2000), "
                + "stat_days_total INT DEFAULT NULL, updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, condition_items, stat_days_total) VALUES "
                + "(5, 'STB_05', '出餐速度', '統計過去N天（不含當天）出餐均值，當天出餐時間超過均值即扣分', "
                + "'[{\"condition\":\"over_avg_deduction\",\"score\":30}]', NULL), "
                + "(1, 'STB_01', '主營時段加分', '必须不受影响', NULL, NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb05OntimeRate");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb05OntimeRate");
    }

    private String conditionItems() {
        return jdbc.queryForObject(
                "SELECT condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_05'", String.class);
    }

    @Test
    void rewritesWholeRowToOntimeRateBands() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        assertEquals("出餐準時率", jdbc.queryForObject(
                "SELECT name FROM biz_organic_score_rule WHERE rule_code = 'STB_05'", String.class));
        assertEquals(7, jdbc.queryForObject(
                "SELECT stat_days_total FROM biz_organic_score_rule WHERE rule_code = 'STB_05'", Integer.class));
        assertEquals("system", jdbc.queryForObject(
                "SELECT updated_by FROM biz_organic_score_rule WHERE rule_code = 'STB_05'", String.class));
        String items = conditionItems();
        // 旧档位被删除，整表换成准时率梯度（降序、率越高分越多）
        assertFalse(items.contains("over_avg_deduction"), "旧均值档位未清除: " + items);
        assertTrue(items.startsWith("[{\"condition\":\"ontime_rate\",\"rate\":100,\"score\":60},"), items);
        assertTrue(items.endsWith("{\"condition\":\"ontime_rate\",\"rate\":70,\"score\":10}]"), items);
        // 同表其它计分项零改动，避免误改在用规则
        assertEquals("主營時段加分", jdbc.queryForObject(
                "SELECT name FROM biz_organic_score_rule WHERE rule_code = 'STB_01'", String.class));
        verify();
    }

    @Test
    void rerunIsIdempotent() {
        migrate();
        String once = conditionItems();
        migrate();

        assertEquals(once, conditionItems());
        verify();
    }

    @Test
    void verifyDetectsUnmigratedRowAndIgnoresMissingRule() {
        // 行未收敛时校验必须让启动暴露（不记版本、下次启动重试）
        assertThrows(IllegalStateException.class, this::verify);

        jdbc.update("UPDATE biz_organic_score_rule SET name = '出餐準時率', "
                + "condition_items = '[{\"condition\":\"over_avg_deduction\",\"score\":30}]' WHERE rule_code = 'STB_05'");
        assertThrows(IllegalStateException.class, this::verify);

        // 未播种的环境（没有 STB_05 行）不算失败
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_05'");
        verify();
    }
}
