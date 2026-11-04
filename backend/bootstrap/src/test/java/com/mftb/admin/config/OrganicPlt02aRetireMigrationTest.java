/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
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

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 organic:retire-plt02a-v1：
 * 1) 下架的平台維度 PLT_02A「配送範圍」只做逻辑删除、只动目标编码，同表在用规则零改动；
 * 2) 重跑幂等；未播种（无 PLT_02A 行）不算失败；
 * 3) 后置校验与 migrate 同口径（只看未删除残留行数），残留必须让启动暴露，
 *    且管理员改过名称不影响校验结论。
 */
class OrganicPlt02aRetireMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_plt02a_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name) VALUES "
                + "(30, 'PLT_02A', '配送範圍'), "
                + "(29, 'PLT_01', '距離衰減'), "
                + "(31, 'PLT_03', '流量均衡')");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void retire() {
        ReflectionTestUtils.invokeMethod(initializer, "retirePlt02aRule");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyPlt02aRetired");
    }

    private int deletedFlag(String ruleCode) {
        return jdbc.queryForObject("SELECT deleted FROM biz_organic_score_rule WHERE rule_code = ?",
                Integer.class, ruleCode);
    }

    @Test
    @DisplayName("只逻辑删除 PLT_02A，在用计分项零改动")
    void retiresOnlyPlt02a() {
        assertThrows(IllegalStateException.class, this::verify);

        retire();

        assertEquals(1, deletedFlag("PLT_02A"));
        assertEquals(0, deletedFlag("PLT_01"));
        assertEquals(0, deletedFlag("PLT_03"));
        assertEquals("system", jdbc.queryForObject(
                "SELECT updated_by FROM biz_organic_score_rule WHERE rule_code = 'PLT_02A'", String.class));
        verify();
    }

    @Test
    @DisplayName("重跑幂等；未播种不算失败；残留会被校验暴露")
    void rerunIsIdempotentAndResidueIsDetected() {
        retire();
        retire();

        assertEquals(1, deletedFlag("PLT_02A"));
        verify();

        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'PLT_02A'");
        verify();

        // 种子被手工重跑会让残留复现，校验必须让启动暴露它（不记版本、下次启动重试）
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, deleted) VALUES "
                + "(130, 'PLT_02A', '配送範圍', 0)");
        assertThrows(IllegalStateException.class, this::verify);
    }

    @Test
    @DisplayName("运营改过名称不影响下架校验结论")
    void renamedRowStillCountsAsRetired() {
        jdbc.update("UPDATE biz_organic_score_rule SET name = '配送範圍（活動期）' WHERE rule_code = 'PLT_02A'");

        retire();

        assertEquals(1, deletedFlag("PLT_02A"));
        verify();
    }
}
