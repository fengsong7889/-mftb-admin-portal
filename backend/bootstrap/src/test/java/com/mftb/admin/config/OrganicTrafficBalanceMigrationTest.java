package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证 organic:traffic-balance-v1：
 * 1) PLT_03 商家扶持整行收敛为「流量均衡」，非负梯度配置写入 traffic_balance_config，
 *    旧 region_configs / blocked_merchants 清空（旧格式与旧屏蔽名单不自动沿用）；
 * 2) PLT_04 订单过热调控逻辑删除下架（deleted=1）；
 * 3) 只在 traffic_balance_config IS NULL 时覆写，重跑幂等、不覆盖运营已配好的值；
 * 4) 后置校验能把未收敛的行与未下架的 PLT_04 暴露出来；未播种不算失败。
 */
class OrganicTrafficBalanceMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_tb_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "dimension INT, name VARCHAR(100), description VARCHAR(500), mode INT, score INT DEFAULT 0, "
                + "stat_days INT DEFAULT NULL, calc_cycle VARCHAR(20) DEFAULT NULL, calc_interval_hours DECIMAL(5,2) DEFAULT NULL, "
                + "region_configs TEXT DEFAULT NULL, blocked_merchants TEXT DEFAULT NULL, traffic_balance_config TEXT DEFAULT NULL, "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        // 种子形态：23_organic_score.sql 写入的两条旧规则（PLT_03 商家扶持 / PLT_04 订单过热调控）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, dimension, name, description, mode, score, stat_days, region_configs) VALUES "
                + "(103, 'PLT_03', 4, '商家扶持', '按區域配置商家扶持', 5, 0, 30, '{\"MACAU\":{\"statDays\":30}}'), "
                + "(104, 'PLT_04', 4, '訂單過熱調控', '按區域配置訂單過熱調控', 5, 0, NULL, '{\"MACAU\":{\"calcIntervalHours\":1}}')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateTrafficBalance");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyTrafficBalance");
    }

    private Map<String, Object> plt03() {
        return jdbc.queryForMap(
                "SELECT name, description, mode, stat_days, calc_cycle, calc_interval_hours, region_configs, "
                        + "blocked_merchants, traffic_balance_config, updated_by FROM biz_organic_score_rule WHERE rule_code = 'PLT_03'");
    }

    @Test
    void mergesPlt03AndRetiresPlt04() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> row = plt03();
        assertEquals(OrganicScoreDataInitializer.TRAFFIC_BALANCE_NAME, row.get("name"));
        assertEquals(OrganicScoreDataInitializer.TRAFFIC_BALANCE_DESCRIPTION, row.get("description"));
        assertEquals(OrganicScoreDataInitializer.MODE_TIERED, row.get("mode"));
        assertEquals(OrganicScoreDataInitializer.TRAFFIC_BALANCE_DEFAULT_STAT_DAYS, row.get("stat_days"));
        assertEquals("SCHEDULED", row.get("calc_cycle"));
        // 旧区域格式与旧屏蔽名单不自动沿用
        assertNull(row.get("region_configs"), "region_configs 未清空: " + row.get("region_configs"));
        assertNull(row.get("blocked_merchants"), "blocked_merchants 未清空: " + row.get("blocked_merchants"));
        String cfg = String.valueOf(row.get("traffic_balance_config"));
        assertTrue(cfg.contains("\"statDays\":7"), "traffic_balance_config 缺少统计口径: " + cfg);
        assertTrue(cfg.contains("\"orderTypes\":[\"DELIVERY\",\"PICKUP\"]"), "traffic_balance_config 缺少订单类型: " + cfg);
        assertTrue(cfg.contains("\"MACAU\"") && cfg.contains("\"TAIPA\""), "traffic_balance_config 缺少区域梯度: " + cfg);
        assertEquals("system", row.get("updated_by"));

        // PLT_04 逻辑删除下架
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = 'PLT_04' AND deleted = 0", Integer.class));
        verify();
    }

    @Test
    void keepsConfigAlreadySavedByAdmin() {
        // 已合并过的行（traffic_balance_config 非空）：重跑不得覆盖运营配置
        jdbc.update("UPDATE biz_organic_score_rule SET traffic_balance_config = ?, name = ? WHERE rule_code = 'PLT_03'",
                "{\"statDays\":14}", "流量均衡");

        migrate();

        assertEquals("{\"statDays\":14}", plt03().get("traffic_balance_config"));
        verify();
    }

    @Test
    void rerunIsIdempotent() {
        migrate();
        Map<String, Object> once = plt03();

        migrate();

        assertEquals(once, plt03());
        verify();
    }

    @Test
    void verifyDetectsUnmigratedRowsAndIgnoresMissingRule() {
        // 未播种环境（无 PLT_03 行）不算失败
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code IN ('PLT_03', 'PLT_04')");
        verify();

        // PLT_03 存在但未写入 traffic_balance_config：校验必须让启动暴露
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, dimension, name, mode, score, deleted) "
                + "VALUES (103, 'PLT_03', 4, '商家扶持', 5, 0, 0)");
        assertThrows(IllegalStateException.class, this::verify);
        migrate();
        assertNotNull(plt03().get("traffic_balance_config"));
    }
}
