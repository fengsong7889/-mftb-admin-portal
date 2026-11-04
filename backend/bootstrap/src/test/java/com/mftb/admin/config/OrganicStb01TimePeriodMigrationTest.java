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
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 隔离内存库验证 organic:stb01-time-period-v1：
 * 1) 新库首启（列还不存在，契约尚未自愈）时迁移自带补列，不会因 unknown column 拖到第二次启动；
 * 2) 原固定分写进午餐一档并把 score 置 0，避免外部引擎把固定分与时段分重复累加；
 * 3) 守卫以 time_period_config IS NULL 为准：运营已在界面配过清单的行绝不被顶掉；
 * 4) score 为 NULL 写空清单（不猜分值）；重跑幂等；未播种不算失败；残留会被校验暴露。
 */
class OrganicStb01TimePeriodMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_stb01_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        // 种子形态：23_organic_score.sql 的 STB_01 行，且刻意不建 time_period_config 列，
        // 用来复现「本 Runner 跑在 SchemaContractValidator 之前」的新库首启窗口
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), score INT DEFAULT 0, "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, score) VALUES "
                + "(21, 'STB_01', '主營時段加分', '主營時段配置完整，當前處於主營時段內加分', 60), "
                + "(22, 'STB_02', '營業狀態', '營業中加分', 10)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateStb01TimePeriod");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStb01TimePeriod");
    }

    private String configOf(long id) {
        return jdbc.queryForObject("SELECT time_period_config FROM biz_organic_score_rule WHERE id = ?",
                String.class, id);
    }

    private int scoreOf(long id) {
        Integer score = jdbc.queryForObject("SELECT score FROM biz_organic_score_rule WHERE id = ?", Integer.class, id);
        return score == null ? -1 : score;
    }

    @Test
    @DisplayName("列缺失时先补列再收敛，原固定分进午餐一档且 score 置 0")
    void addsColumnThenMovesFixedScoreIntoLunchTier() {
        assertThrows(Exception.class, this::verify, "列还不存在时校验不应通过");

        migrate();

        String config = configOf(21);
        assertTrue(config.contains("\"periodValue\":\"lunch\""), config);
        assertTrue(config.contains("\"periodName\":\"午餐\""), config);
        assertTrue(config.contains("\"score\":60"), config);
        assertEquals(0, scoreOf(21), "固定分必须置 0，否则外部引擎会重复累加");
        // 只动目标编码：同表其它规则零改动
        assertEquals(10, scoreOf(22));
        verify();
    }

    @Test
    @DisplayName("重跑幂等；运营已配过的清单不被顶掉；score 为 NULL 写空清单")
    void rerunIsIdempotentAndAdminConfigIsPreserved() {
        migrate();
        // 模拟运营在界面改过配置（含晚餐档），重跑绝不能覆盖
        jdbc.update("UPDATE biz_organic_score_rule SET time_period_config = ?, score = 0 WHERE id = 21",
                "{\"items\":[{\"periodValue\":\"lunch\",\"periodName\":\"午餐\",\"score\":70},"
                        + "{\"periodValue\":\"dinner\",\"periodName\":\"晚餐\",\"score\":80}]}");

        migrate();
        migrate();

        String config = configOf(21);
        assertTrue(config.contains("\"score\":70") && config.contains("\"score\":80"), config);
        verify();

        jdbc.update("UPDATE biz_organic_score_rule SET score = NULL, time_period_config = NULL WHERE id = 21");
        migrate();
        assertEquals("{\"items\":[]}", configOf(21), "score 为 NULL 时写空清单，不猜分值");
        verify();
    }

    @Test
    @DisplayName("未播种不算失败；残留会被校验暴露")
    void missingSeedPassesButResidueIsDetected() {
        migrate();
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'STB_01'");
        verify();

        // 列已就绪后补一行未收敛的在用记录（等价于种子被手工重跑），校验必须让启动暴露它
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, score) VALUES (121, 'STB_01', '主營時段加分', 55)");
        assertThrows(IllegalStateException.class, this::verify);

        migrate();
        verify();
    }
}
