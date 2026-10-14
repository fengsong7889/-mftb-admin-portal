package com.mftb.admin.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证两项自然流量迁移：
 * 1) organic:retire-rules-v1 —— 下架计分项只做逻辑删除、只动目标编码、可回滚、重跑幂等，
 *    后置校验以「未删除残留行数 = 0」为准而不是查已删除行存在；
 * 2) organic:stb02-filtered-v1 —— 休息打烊槽位标记为系统过滤档且分值归零，
 *    评分说明只收敛旧内置文案、管理员自定义不覆盖，槽位不足的行不视为失败。
 */
class OrganicRetireAndFilterMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_retire_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), condition_items VARCHAR(2000), "
                + "updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, condition_items) VALUES "
                + "(2, 'STB_02', '營業狀態', "
                + "'營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', "
                + "'[{\"condition\":\"bonus\",\"score\":100},{\"condition\":\"deduction\",\"score\":20},"
                + "{\"condition\":\"deduction\",\"score\":50},{\"condition\":\"deduction\",\"score\":80}]'), "
                + "(9, 'COM_09', '購買廣告-點金廣告', '待下架', NULL), "
                + "(4, 'STB_04', '店鋪標籤-金牌', '待下架', NULL), "
                + "(1, 'STB_01', '主營時段加分', '必须不受影响', NULL)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void retire() {
        ReflectionTestUtils.invokeMethod(initializer, "retireOrganicRules");
    }

    private void verifyRetired() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyRetiredRulesGone");
    }

    private void markFiltered() {
        ReflectionTestUtils.invokeMethod(initializer, "markStb02ClosedAsFiltered");
    }

    private void verifyFiltered() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb02Filtered");
    }

    private int deletedFlag(String ruleCode) {
        return jdbc.queryForObject("SELECT deleted FROM biz_organic_score_rule WHERE rule_code = ?",
                Integer.class, ruleCode);
    }

    private String conditionItems() {
        return jdbc.queryForObject("SELECT condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_02'",
                String.class);
    }

    @Test
    void retiresOnlyTargetCodesAndVerifiesResidue() {
        assertThrows(IllegalStateException.class, this::verifyRetired);

        retire();

        assertEquals(1, deletedFlag("COM_09"));
        assertEquals(1, deletedFlag("STB_04"));
        // 同表其他内置项零改动，避免误删在用规则
        assertEquals(0, deletedFlag("STB_01"));
        assertEquals("system", jdbc.queryForObject(
                "SELECT updated_by FROM biz_organic_score_rule WHERE rule_code = 'STB_04'", String.class));
        verifyRetired();
    }

    @Test
    void retireRerunIsIdempotentAndResidueIsDetected() {
        retire();
        retire();

        assertEquals(1, deletedFlag("COM_09"));
        verifyRetired();

        // 重新播种（种子脚本被手工重跑）会让残留复现，校验必须让启动暴露它
        jdbc.update("UPDATE biz_organic_score_rule SET deleted = 0 WHERE rule_code = 'COM_09'");
        assertThrows(IllegalStateException.class, this::verifyRetired);
    }

    @Test
    void marksClosedSlotFilteredAndZeroesScore() {
        assertThrows(IllegalStateException.class, this::verifyFiltered);

        markFiltered();

        String items = conditionItems();
        assertTrue(items.contains("\"condition\":\"filtered\""), "第 4 槽未写入 filtered 标记: " + items);
        assertTrue(items.endsWith("{\"condition\":\"filtered\",\"score\":0}]"), "打烊档分值未归零: " + items);
        // 前三档保持原口径，不能被一起改写
        assertTrue(items.startsWith("[{\"condition\":\"bonus\",\"score\":100},"), "前档被误改: " + items);
        verifyFiltered();
    }

    @Test
    void syncsLegacyDescriptionButKeepsCustomizedOne() {
        markFiltered();

        String description = jdbc.queryForObject(
                "SELECT description FROM biz_organic_score_rule WHERE rule_code = 'STB_02'", String.class);
        assertTrue(description.contains("由系統直接過濾"), "旧内置评分说明未同步: " + description);

        // 管理员自定义过的文案不得被覆盖
        jdbc.update("UPDATE biz_organic_score_rule SET description = '自訂營業口徑' WHERE rule_code = 'STB_02'");
        markFiltered();
        assertEquals("自訂營業口徑", jdbc.queryForObject(
                "SELECT description FROM biz_organic_score_rule WHERE rule_code = 'STB_02'", String.class));
    }

    @Test
    void skipsRowsWithoutClosedSlotAndStaysIdempotent() {
        jdbc.update("UPDATE biz_organic_score_rule SET condition_items = "
                + "'[{\"condition\":\"bonus\",\"score\":100}]' WHERE rule_code = 'STB_02'");

        markFiltered();

        // 槽位不足时无标记可加，不算失败，否则缺数据的库会卡住启动
        verifyFiltered();
        assertEquals("[{\"condition\":\"bonus\",\"score\":100}]", conditionItems());

        // 恢复四档后重跑两次结果一致
        jdbc.update("UPDATE biz_organic_score_rule SET condition_items = "
                + "'[{\"condition\":\"bonus\",\"score\":100},{\"condition\":\"deduction\",\"score\":20},"
                + "{\"condition\":\"deduction\",\"score\":50},{\"condition\":\"deduction\",\"score\":80}]' "
                + "WHERE rule_code = 'STB_02'");
        markFiltered();
        String once = conditionItems();
        markFiltered();
        assertEquals(once, conditionItems());
    }
}
