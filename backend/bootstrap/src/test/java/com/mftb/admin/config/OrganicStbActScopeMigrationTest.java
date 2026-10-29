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
 * 隔离内存库验证 organic:stb-act-scope-v1：
 * 1) 兩個已知內置說明（种子原文、早期界面写回的「暂以算法库对接」文案）都收敛为「仅正常进行中的活动计分」口径；
 * 2) 管理员自定义说明不命中旧值、不被顶掉；名称与 activity_items 结构不变；
 * 3) 后置校验以「旧内置说明残留数必须为 0」为准，未播种不算失败；重跑幂等。
 */
class OrganicStbActScopeMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stbact_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), activity_items VARCHAR(2000), "
                + "updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, activity_items) VALUES "
                + "(12, 'STB_ACT', '活動加分', '" + OrganicScoreDataInitializer.STB_ACT_LEGACY_DESCRIPTIONS.get(0) + "', "
                + "'[{\"activityId\":\"SFWD20260812000\",\"score\":20}]'), "
                + "(112, 'STB_ACT', '活動加分', '" + OrganicScoreDataInitializer.STB_ACT_LEGACY_DESCRIPTIONS.get(1) + "', NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStbActScope");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStbActScope");
    }

    private String description(long id) {
        return jdbc.queryForObject("SELECT description FROM biz_organic_score_rule WHERE id = ?", String.class, id);
    }

    @Test
    @DisplayName("两个内置说明都收敛为「仅进行中活动计分」口径，配置结构不变")
    void syncsBothBuiltinDescriptions() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        assertEquals(OrganicScoreDataInitializer.STB_ACT_NEW_DESCRIPTION, description(12L));
        assertEquals(OrganicScoreDataInitializer.STB_ACT_NEW_DESCRIPTION, description(112L));
        // activity_items 结构不动：本步只同步说明
        assertEquals("[{\"activityId\":\"SFWD20260812000\",\"score\":20}]", jdbc.queryForObject(
                "SELECT activity_items FROM biz_organic_score_rule WHERE id = 12", String.class));
        verify();
    }

    @Test
    @DisplayName("自定义说明不命中旧值，不被顶掉")
    void keepsAdminCustomDescription() {
        jdbc.update("UPDATE biz_organic_score_rule SET description = ? WHERE id = 12", "我自己寫的說明");

        migrate();

        assertEquals("我自己寫的說明", description(12L));
        assertEquals(OrganicScoreDataInitializer.STB_ACT_NEW_DESCRIPTION, description(112L));
        verify();
    }

    @Test
    @DisplayName("重跑幂等 + 未播种环境不算失败")
    void rerunIsIdempotentAndIgnoresMissingRule() {
        migrate();
        String once = description(12L);

        migrate();

        assertEquals(once, description(12L));
        verify();

        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_ACT'");
        verify();
    }
}
