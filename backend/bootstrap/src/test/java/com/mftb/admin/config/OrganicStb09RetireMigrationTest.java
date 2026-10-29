package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 organic:retire-stb09-v1：
 * 1) 下架的 STB_09「超時接單」只做逻辑删除、只动目标编码，同表在用规则零改动；
 * 2) 重跑幂等；未播种（无 STB_09 行）不算失败；
 * 3) 后置校验以「未删除残留行数 = 0」为准，残留（如种子被手工重跑）必须让启动暴露。
 */
class OrganicStb09RetireMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb09_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name) VALUES "
                + "(9, 'STB_09', '超時接單'), "
                + "(8, 'STB_08', '訂單取消率'), "
                + "(1, 'STB_01', '主營時段加分')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void retire() {
        ReflectionTestUtils.invokeMethod(initializer, "retireStb09Rule");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb09Retired");
    }

    private int deletedFlag(String ruleCode) {
        return jdbc.queryForObject("SELECT deleted FROM biz_organic_score_rule WHERE rule_code = ?",
                Integer.class, ruleCode);
    }

    @Test
    @DisplayName("只逻辑删除 STB_09，在用计分项零改动")
    void retiresOnlyStb09() {
        assertThrows(IllegalStateException.class, this::verify);

        retire();

        assertEquals(1, deletedFlag("STB_09"));
        assertEquals(0, deletedFlag("STB_08"));
        assertEquals(0, deletedFlag("STB_01"));
        assertEquals("system", jdbc.queryForObject(
                "SELECT updated_by FROM biz_organic_score_rule WHERE rule_code = 'STB_09'", String.class));
        verify();
    }

    @Test
    @DisplayName("重跑幂等；未播种不算失败；残留会被校验暴露")
    void rerunIsIdempotentAndResidueIsDetected() {
        retire();
        retire();

        assertEquals(1, deletedFlag("STB_09"));
        verify();

        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_09'");
        verify();

        // 种子被手工重跑会让残留复现，校验必须让启动暴露它（不记版本、下次启动重试）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, deleted) VALUES "
                + "(109, 'STB_09', '超時接單', 0)");
        assertThrows(IllegalStateException.class, this::verify);
    }
}
