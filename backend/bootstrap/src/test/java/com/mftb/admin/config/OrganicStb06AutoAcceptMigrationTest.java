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

/**
 * 隔离内存库验证 organic:stb06-auto-accept-v1：
 * 1) 旧「拒絕接單 · 按次計罰」口径整行收敛为「自動接單 · 固定加分」，mode/score/名称/说明一起改写；
 * 2) 旧口径专用列 stat_days / deduction_per_order 被清空，避免看库时误读为仍在按次扣分；
 * 3) score 只在未配置（=0）时补默认 50，管理员已调过的分值不被顶掉；
 * 4) 后置校验能把未收敛的行暴露出来（不记版本、下次启动重试），无该行不算失败；
 * 5) 重跑幂等。
 */
class OrganicStb06AutoAcceptMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb06_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), mode INT, score INT DEFAULT 0, "
                + "stat_days INT DEFAULT NULL, deduction_per_order INT DEFAULT NULL, "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        // 种子形态：23_organic_score.sql 写入的旧口径行（mode=3 規則減分、score=0、扣分住在 deduction_per_order）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, mode, score, stat_days, deduction_per_order) VALUES "
                + "(6, 'STB_06', '" + OrganicScoreDataInitializer.STB06_LEGACY_NAME + "', "
                + "'統計天數內（含當天），每拒絕一單固定扣分，即時生效', 3, 0, 7, 80), "
                + "(7, 'STB_07', '出餐超時', '按次計罰，不得被本遷移改動', 3, 0, 7, 70)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb06AutoAccept");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb06AutoAccept");
    }

    private Map<String, Object> stb06() {
        return jdbc.queryForMap(
                "SELECT name, description, mode, score, stat_days, deduction_per_order, updated_by "
                        + "FROM biz_organic_score_rule WHERE rule_code = 'STB_06'");
    }

    @Test
    void rewritesWholeRowToAutoAcceptBonus() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> row = stb06();
        assertEquals(OrganicScoreDataInitializer.STB06_NEW_NAME, row.get("name"));
        assertEquals(OrganicScoreDataInitializer.STB06_NEW_DESCRIPTION, row.get("description"));
        assertEquals(OrganicScoreDataInitializer.MODE_RULE_BONUS, row.get("mode"));
        // 旧界面从不写 score（恒为 0），因此迁移补默认 50 分
        assertEquals(OrganicScoreDataInitializer.STB06_DEFAULT_SCORE, row.get("score"));
        // 旧口径配置列必须清空：留着会被读成「本项还在按次扣分」
        assertNull(row.get("stat_days"), "stat_days 未清空: " + row.get("stat_days"));
        assertNull(row.get("deduction_per_order"), "deduction_per_order 未清空: " + row.get("deduction_per_order"));
        assertEquals("system", row.get("updated_by"));
        // 同表其它按次计罚项零改动，避免误改在用规则
        assertEquals("出餐超時", jdbc.queryForObject(
                "SELECT name FROM biz_organic_score_rule WHERE rule_code = 'STB_07'", String.class));
        assertEquals(70, jdbc.queryForObject(
                "SELECT deduction_per_order FROM biz_organic_score_rule WHERE rule_code = 'STB_07'", Integer.class));
        verify();
    }

    @Test
    void keepsScoreAlreadyTunedByAdmin() {
        // 第一阶段界面已把分值调成 30 并写库：迁移只改口径，不得顶掉人工配置
        jdbc.update("UPDATE biz_organic_score_rule SET score = 30 WHERE rule_code = 'STB_06'");

        migrate();

        assertEquals(30, stb06().get("score"));
        verify();
    }

    @Test
    void rerunIsIdempotent() {
        migrate();
        Map<String, Object> once = stb06();

        migrate();

        assertEquals(once, stb06());
        verify();
    }

    @Test
    void verifyDetectsUnmigratedRowAndIgnoresMissingRule() {
        // 行未收敛时校验必须让启动暴露（不记版本、下次启动重试）
        assertThrows(IllegalStateException.class, this::verify);

        // 名称已改但仍是按次扣分口径：不算就绪
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, mode = 3, score = 0, stat_days = 7, "
                + "deduction_per_order = 80 WHERE rule_code = 'STB_06'", OrganicScoreDataInitializer.STB06_NEW_NAME);
        assertThrows(IllegalStateException.class, this::verify);

        migrate();
        assertNotNull(stb06().get("mode"));

        // 未播种的环境（没有 STB_06 行）不算失败
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_06'");
        verify();
    }
}
