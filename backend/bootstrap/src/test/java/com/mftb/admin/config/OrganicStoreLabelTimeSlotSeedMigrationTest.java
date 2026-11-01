/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 organic:add-store-label-time-slot-v1：
 * 1) 库里没行时补种 STB_LABEL / COM_SLOT 两行，维度/计分方式/分值/前提/排序号口径正确；
 * 2) 重跑幂等，且不覆盖运营改过的名称、分值、启停；
 * 3) 逻辑删除的行不擅自复活，后置校验必须让启动暴露（不记版本、下次启动重试）；
 * 4) 补种只写建表即有的列——store_label_config 由结构契约在启动末期自愈，首启写入会报 Unknown column，
 *    因此本迁移不写该列（标签清单默认 NULL，由界面空清单兜底）。
 */
class OrganicStoreLabelTimeSlotSeedMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_label_slot_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        // 只建建表即有的列：故意不带 store_label_config，用来证明本迁移不会碰那一列
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "rule_code VARCHAR(50) NOT NULL, dimension INT, name VARCHAR(100), description VARCHAR(500), "
                + "mode INT, score INT, prerequisites VARCHAR(500), status INT DEFAULT 1, builtin INT DEFAULT 1, "
                + "sort_order INT DEFAULT 0, updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (rule_code, dimension, name, mode, score, sort_order) VALUES "
                + "('COM_10', 1, '金字招牌(廣告)', 1, 100, 9), "
                + "('STB_01', 2, '主營時段加分', 1, 60, 1)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void seed() {
        ReflectionTestUtils.invokeMethod(initializer, "seedStoreLabelAndTimeSlotRules");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStoreLabelAndTimeSlotSeeded");
    }

    /** 显式列出列名：Spring 的 ColumnMapRowMapper 会把列标签转小写，键统一按小写取 */
    private Map<String, Object> row(String ruleCode) {
        return jdbc.queryForMap("SELECT rule_code, dimension, name, description, mode, score, prerequisites, "
                + "status, builtin, sort_order, deleted FROM biz_organic_score_rule WHERE rule_code = ?", ruleCode);
    }

    private int count(String ruleCode) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = ?",
                Integer.class, ruleCode);
    }

    @Test
    @DisplayName("未播种时补种两行，字段口径与前端模板一致")
    void seedsBothRulesWhenAbsent() {
        assertThrows(IllegalStateException.class, this::verify);

        seed();

        Map<String, Object> label = row("STB_LABEL");
        assertEquals(2, label.get("dimension"), "門店標籤属店鋪維度");
        assertEquals(OrganicScoreDataInitializer.STB_LABEL_NAME, label.get("name"));
        assertEquals(OrganicScoreDataInitializer.STB_LABEL_DESCRIPTION, label.get("description"));
        assertEquals(OrganicScoreDataInitializer.MODE_RULE_BONUS, label.get("mode"));
        assertEquals(0, label.get("score"), "标签分值清单默认空，分值由运营逐条配置");
        assertEquals(1, label.get("status"));
        assertEquals(1, label.get("builtin"));
        assertEquals(OrganicScoreDataInitializer.STB_LABEL_SORT_ORDER, label.get("sort_order"));
        // 门店标签没有「购买即给分」这类前提文案，前提列必须留空
        assertNull(label.get("prerequisites"));

        Map<String, Object> slot = row("COM_SLOT");
        assertEquals(1, slot.get("dimension"), "時段推薦属商業維度");
        assertEquals(OrganicScoreDataInitializer.COM_SLOT_NAME, slot.get("name"));
        assertEquals(OrganicScoreDataInitializer.COM_SLOT_DEFAULT_SCORE, slot.get("score"));
        assertEquals(OrganicScoreDataInitializer.COM_SLOT_PREREQUISITE, slot.get("prerequisites"));
        assertEquals(OrganicScoreDataInitializer.COM_SLOT_SORT_ORDER, slot.get("sort_order"));
        assertEquals(1, slot.get("status"));
        assertEquals(1, slot.get("builtin"));

        // 同表在用规则零改动
        assertEquals("金字招牌(廣告)", row("COM_10").get("name"));
        assertEquals(60, row("STB_01").get("score"));

        verify();
    }

    @Test
    @DisplayName("重跑幂等，且不覆盖运营改过的名称/分值/启停")
    void rerunKeepsOperatorEdits() {
        seed();
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, score = 30, status = 2 WHERE rule_code = ?",
                "門店標籤（運營改名）", "STB_LABEL");

        seed();

        assertEquals(1, count("STB_LABEL"));
        Map<String, Object> label = row("STB_LABEL");
        assertEquals("門店標籤（運營改名）", label.get("name"));
        assertEquals(30, label.get("score"));
        assertEquals(2, label.get("status"));
    }

    @Test
    @DisplayName("逻辑删除的行不复活，后置校验报错暴露")
    void logicallyDeletedRowIsNotResurrected() {
        seed();
        jdbc.update("UPDATE biz_organic_score_rule SET deleted = 1 WHERE rule_code = 'COM_SLOT'");

        seed();

        assertEquals(1, count("COM_SLOT"), "不擅自复活管理员删掉的行");
        assertEquals(1, row("COM_SLOT").get("deleted"));
        // 剩一个 deleted=1 的行等于「界面看不到但库里占着编码」，必须让启动暴露而不是静默记成功
        assertThrows(IllegalStateException.class, this::verify);
    }
}
