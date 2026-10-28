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
 * 隔离内存库验证 COM_04 計分項更名迁移：只收敛仍为旧内置名称/旧内置说明的行、
 * 管理员自定义值不动、其他计分项不受影响、后置校验以旧值残留为准、重跑幂等。
 */
class OrganicCom04RenameMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_com04_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(255), updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        // 待更名的内置项 + 同前缀的其他内置项（必须不受影响）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description) VALUES "
                + "(4, 'COM_04', '新客立減', '商家參與新客立減活動加分'), "
                + "(3, 'COM_03', '進店領券', '商家設置進店領券加分')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void rename() {
        ReflectionTestUtils.invokeMethod(initializer, "renameCom04Rule");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyCom04Renamed");
    }

    private String columnOf(String ruleCode, String column) {
        return jdbc.queryForObject(
                "SELECT " + column + " FROM biz_organic_score_rule WHERE rule_code = ?", String.class, ruleCode);
    }

    @Test
    void renamesOnlyCom04AndSyncsLegacyDescription() {
        assertThrows(IllegalStateException.class, this::verify);

        rename();

        assertEquals("門店新客券", columnOf("COM_04", "name"));
        assertEquals("商家參與門店新客券活動加分", columnOf("COM_04", "description"));
        assertEquals("system", columnOf("COM_04", "updated_by"));
        // 同前缀的其他内置项零改动
        assertEquals("進店領券", columnOf("COM_03", "name"));
        assertEquals("商家設置進店領券加分", columnOf("COM_03", "description"));
        verify();
    }

    @Test
    void keepsAdminCustomizedNameAndDescription() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '管理員自訂名稱', description = '管理員自訂說明' "
                + "WHERE rule_code = 'COM_04'");

        rename();

        assertEquals("管理員自訂名稱", columnOf("COM_04", "name"));
        assertEquals("管理員自訂說明", columnOf("COM_04", "description"));
        // 旧值已不存在即视为就绪：自定义值不该阻塞版本记录，否则每次启动都重试
        verify();
    }

    @Test
    void rerunIsIdempotentAndNeverRevertsNewValues() {
        rename();
        rename();

        assertEquals("門店新客券", columnOf("COM_04", "name"));
        assertEquals("商家參與門店新客券活動加分", columnOf("COM_04", "description"));
        verify();
    }

    @Test
    void verifyFailsWhenLegacyNameOrDescriptionReappears() {
        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET name = '新客立減' WHERE rule_code = 'COM_04'");
        assertThrows(IllegalStateException.class, this::verify);

        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET description = '商家參與新客立減活動加分' WHERE rule_code = 'COM_04'");
        assertThrows(IllegalStateException.class, this::verify);
    }
}
