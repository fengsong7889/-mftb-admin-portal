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

/**
 * 隔离内存库验证 organic:stb07-meal-time-v1：
 * 1) 旧「出餐超時·按次計罰」口径整行收敛为「出餐時長·固定加分」，mode 3→1、score 补默认、
 *    开关播种进既有 prerequisites 列，旧口径专用列 stat_days / deduction_per_order 清空；
 * 2) 管理员自定义过的名称/说明/分值/开关不被保底顶掉；
 * 3) 后置校验能把未收敛的行暴露出来（不记版本、下次启动重试），无该行不算失败；重跑幂等。
 */
class OrganicStb07MealTimeMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb07_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), mode INT, score INT, "
                + "prerequisites VARCHAR(500), stat_days INT, deduction_per_order INT, "
                + "updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, mode, score, "
                + "prerequisites, stat_days, deduction_per_order) VALUES "
                + "(7, 'STB_07', '" + OrganicScoreDataInitializer.STB07_LEGACY_NAME + "', "
                + "'" + OrganicScoreDataInitializer.STB07_LEGACY_DESCRIPTION + "', 3, 0, NULL, 7, 70), "
                + "(1, 'STB_01', '主營時段加分', '必须不受影响', 1, 20, NULL, NULL, NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb07MealTime");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb07MealTime");
    }

    private Map<String, Object> stb07() {
        return jdbc.queryForMap("SELECT name, description, mode, score, prerequisites, stat_days, "
                + "deduction_per_order FROM biz_organic_score_rule WHERE id = 7");
    }

    @Test
    @DisplayName("旧按次计罚整行收敛为出餐时长固定加分，开关播种进 prerequisites")
    void convertsLegacyDeductionRowToFixedBonus() {
        assertThrows(IllegalStateException.class, this::verify);

        migrate();

        Map<String, Object> row = stb07();
        assertEquals(OrganicScoreDataInitializer.STB07_NEW_NAME, row.get("name"));
        assertEquals(OrganicScoreDataInitializer.STB07_NEW_DESCRIPTION, row.get("description"));
        assertEquals(OrganicScoreDataInitializer.MODE_RULE_BONUS, row.get("mode"));
        assertEquals(OrganicScoreDataInitializer.STB07_DEFAULT_SCORE, row.get("score"));
        // 开关不新增列：值落在既有 prerequisites 列，且必须与前端常量一致才不会被界面读成未开启
        assertEquals(OrganicScoreDataInitializer.STB07_AUTO_CORRECT_PREREQUISITE, row.get("prerequisites"));
        // 旧口径专用列必须清空，留着会被读成「本项还在按 N 天统计、每单扣分」
        assertEquals(null, row.get("stat_days"));
        assertEquals(null, row.get("deduction_per_order"));
        verify();
    }

    @Test
    @DisplayName("同表其他计分项零改动")
    void keepsOtherRulesUntouched() {
        migrate();

        Map<String, Object> stb01 = jdbc.queryForMap(
                "SELECT name, mode, score, prerequisites FROM biz_organic_score_rule WHERE id = 1");
        assertEquals("主營時段加分", stb01.get("name"));
        assertEquals(1, stb01.get("mode"));
        assertEquals(20, stb01.get("score"));
        assertEquals(null, stb01.get("prerequisites"));
    }

    @Test
    @DisplayName("管理员自定义的名称/说明/分值/开关不被顶掉")
    void keepsAdminCustomizedValues() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '自訂名稱', description = '我自己寫的說明', "
                + "score = 88, prerequisites = '系統校驗出餐時長' WHERE id = 7");

        migrate();

        Map<String, Object> row = stb07();
        assertEquals("自訂名稱", row.get("name"));
        assertEquals("我自己寫的說明", row.get("description"));
        // score 已配置（>0）就不补默认值
        assertEquals(88, row.get("score"));
        // 开关已有值时不重新播种，否则运营关掉的开关会被保底打开
        assertEquals("系統校驗出餐時長", row.get("prerequisites"));
        // 方式与旧口径列仍必须收敛，否则界面口径与库里不一致
        assertEquals(OrganicScoreDataInitializer.MODE_RULE_BONUS, row.get("mode"));
        assertEquals(null, row.get("stat_days"));
        assertEquals(null, row.get("deduction_per_order"));
        verify();
    }

    @Test
    @DisplayName("重跑幂等；未播种不算失败；残留旧口径会被校验暴露")
    void rerunIsIdempotentAndResidueIsDetected() {
        migrate();
        Map<String, Object> once = stb07();

        migrate();

        assertEquals(once, stb07());
        verify();

        // 未播种（无 STB_07 行）不算失败，由前端默认口径兜底
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE id = 7");
        verify();

        // 种子被手工重跑会让旧口径复现，校验必须让启动暴露它
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, mode, score, "
                + "prerequisites, stat_days, deduction_per_order) VALUES "
                + "(7, 'STB_07', '" + OrganicScoreDataInitializer.STB07_LEGACY_NAME + "', "
                + "'" + OrganicScoreDataInitializer.STB07_LEGACY_DESCRIPTION + "', 3, 0, NULL, 7, 70)");
        assertThrows(IllegalStateException.class, this::verify);
    }
}
