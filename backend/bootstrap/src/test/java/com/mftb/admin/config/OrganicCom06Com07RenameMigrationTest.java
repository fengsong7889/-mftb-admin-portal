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
 * 隔离内存库验证 COM_06 / COM_07 計分項更名迁移：
 * 只收敛仍为旧内置名称/旧内置说明的行、兼容带与不带「-按金額」后缀的旧名、
 * 管理员自定义值不动、其他计分项不受影响、后置校验以旧值残留为准、重跑幂等。
 */
class OrganicCom06Com07RenameMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_com06_com07_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(255), updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description) VALUES "
                + "(6, 'COM_06', '會員紅包-按金額', '商家設置會員紅包加分'), "
                + "(7, 'COM_07', '閃蜂官方神券-按金額', '商家設置閃蜂官方神券加分'), "
                + "(5, 'COM_05', '收藏送券', '商家設置收藏送券加分')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void rename() {
        ReflectionTestUtils.invokeMethod(initializer, "renameCom06Com07Rules");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyCom06Com07Renamed");
    }

    private String columnOf(String ruleCode, String column) {
        return jdbc.queryForObject(
                "SELECT " + column + " FROM biz_organic_score_rule WHERE rule_code = ?", String.class, ruleCode);
    }

    @Test
    void renamesBothAndSyncsLegacyDescriptions() {
        assertThrows(IllegalStateException.class, this::verify);

        rename();

        assertEquals("平台會員紅包", columnOf("COM_06", "name"));
        assertEquals("商家設置平台會員紅包加分", columnOf("COM_06", "description"));
        assertEquals("平台官方神券", columnOf("COM_07", "name"));
        assertEquals("商家設置平台官方神券加分", columnOf("COM_07", "description"));
        assertEquals("system", columnOf("COM_07", "updated_by"));
        // 其他内置项零改动
        assertEquals("收藏送券", columnOf("COM_05", "name"));
        assertEquals("商家設置收藏送券加分", columnOf("COM_05", "description"));
        verify();
    }

    @Test
    void renamesLegacyDisplayNamesWithoutSuffix() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '會員紅包' WHERE rule_code = 'COM_06'");
        jdbc.update("UPDATE biz_organic_score_rule SET name = '閃蜂官方神券' WHERE rule_code = 'COM_07'");

        rename();

        assertEquals("平台會員紅包", columnOf("COM_06", "name"));
        assertEquals("平台官方神券", columnOf("COM_07", "name"));
        verify();
    }

    @Test
    void keepsAdminCustomizedNamesAndDescriptions() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '管理員自訂紅包', description = '管理員自訂說明' "
                + "WHERE rule_code = 'COM_06'");
        jdbc.update("UPDATE biz_organic_score_rule SET name = '管理員自訂神券', description = '管理員自訂說明' "
                + "WHERE rule_code = 'COM_07'");

        rename();

        assertEquals("管理員自訂紅包", columnOf("COM_06", "name"));
        assertEquals("管理員自訂神券", columnOf("COM_07", "name"));
        assertEquals("管理員自訂說明", columnOf("COM_06", "description"));
        // 旧值已不存在即视为就绪：自定义值不该阻塞版本记录，否则每次启动都重试
        verify();
    }

    @Test
    void rerunIsIdempotentAndNeverRevertsNewValues() {
        rename();
        rename();

        assertEquals("平台會員紅包", columnOf("COM_06", "name"));
        assertEquals("平台官方神券", columnOf("COM_07", "name"));
        verify();
    }

    @Test
    void verifyFailsWhenLegacyNameOrDescriptionReappears() {
        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET name = '會員紅包-按金額' WHERE rule_code = 'COM_06'");
        assertThrows(IllegalStateException.class, this::verify);

        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET description = '商家設置閃蜂官方神券加分' WHERE rule_code = 'COM_07'");
        assertThrows(IllegalStateException.class, this::verify);
    }
}
