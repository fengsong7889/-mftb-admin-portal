package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 COM_10 計分項更名迁移：只收敛仍为旧内置名的行、管理员自定义名不动、
 * 其他计分项不受影响、后置校验以旧值残留为准、重跑幂等。
 */
class OrganicCom10RenameMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_com10_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        // 待更名的内置项 + 同前缀的已下架项（必须不受影响）+ 名称已被管理员改过的内置项
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name) VALUES "
                + "(10, 'COM_10', '購買廣告-金字招牌'), "
                + "(9, 'COM_09', '購買廣告-點金廣告'), "
                + "(6, 'COM_06', '平台會員紅包')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void rename() {
        ReflectionTestUtils.invokeMethod(initializer, "renameCom10Rule");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyCom10Renamed");
    }

    private String nameOf(String ruleCode) {
        return jdbc.queryForObject(
                "SELECT name FROM biz_organic_score_rule WHERE rule_code = ?", String.class, ruleCode);
    }

    @Test
    void renamesOnlyCom10AndAuditsUpdater() {
        assertThrows(IllegalStateException.class, this::verify);

        rename();

        assertEquals("金字招牌(廣告)", nameOf("COM_10"));
        assertEquals("system", jdbc.queryForObject(
                "SELECT updated_by FROM biz_organic_score_rule WHERE rule_code = 'COM_10'", String.class));
        // 同前缀的已下架项与其他内置项零改动
        assertEquals("購買廣告-點金廣告", nameOf("COM_09"));
        assertEquals("平台會員紅包", nameOf("COM_06"));
        verify();
    }

    @Test
    void keepsAdminCustomizedName() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '金字招牌廣告加分' WHERE rule_code = 'COM_10'");

        rename();

        assertEquals("金字招牌廣告加分", nameOf("COM_10"));
        // 旧值已不存在即视为就绪：自定义名不该阻塞版本记录，否则每次启动都重试
        verify();
    }

    @Test
    void rerunIsIdempotentAndNeverRevertsNewName() {
        rename();
        rename();

        assertEquals("金字招牌(廣告)", nameOf("COM_10"));
        verify();
    }

    @Test
    void verifyFailsWhenLegacyNameReappears() {
        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET name = '購買廣告-金字招牌' WHERE rule_code = 'COM_10'");

        assertThrows(IllegalStateException.class, this::verify);
    }
}
