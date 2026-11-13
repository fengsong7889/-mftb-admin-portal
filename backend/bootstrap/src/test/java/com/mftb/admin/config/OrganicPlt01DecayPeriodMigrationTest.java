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
 * 隔离内存库验证 organic:plt01-decay-period-v1：
 * 1) 新库首启（列还不存在，契约尚未自愈）时迁移自带补列，不会因 unknown column 拖到第二次启动；
 * 2) 五时段全预填旧满分 100，score 保留旧满分作 legacy 引擎兜底（DECAY 模式置 0 会让距离衰减归零）；
 * 3) 守卫以 decay_period_config IS NULL 为准：运营已在界面配过满分清单的行绝不被顶掉；
 *    description 以旧内置值作条件收敛，管理员自定义文案不顶；
 * 4) 重跑幂等；未播种不算失败；残留（NULL 配置或旧内置说明）会被校验暴露。
 */
class OrganicPlt01DecayPeriodMigrationTest {

    private static final String OLD_DESC = "滿分按衰減係數×距離遞減，距離越遠得分越低";
    private static final String NEW_DESC = "滿分按時段獨立配置，得分 = 滿分（當前時段） - 衰減係數 × 距離，距離越遠得分越低";

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_plt01_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        // 种子形态：23_organic_score.sql 的 PLT_01 行，且刻意不建 decay_period_config 列，
        // 用来复现「本 Runner 跑在 SchemaContractValidator 之前」的新库首启窗口
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT PRIMARY KEY, rule_code VARCHAR(50), "
                + "name VARCHAR(100), description VARCHAR(500), score INT DEFAULT 0, "
                + "updated_by VARCHAR(50), deleted INT NOT NULL DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, score) VALUES "
                + "(31, 'PLT_01', '距離衰減', '" + OLD_DESC + "', 100), "
                + "(32, 'PLT_03', '流量均衡', '流量均衡說明', 0)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migratePlt01DecayPeriod");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyPlt01DecayPeriod");
    }

    private String configOf(long id) {
        return jdbc.queryForObject("SELECT decay_period_config FROM biz_organic_score_rule WHERE id = ?",
                String.class, id);
    }

    private String descOf(long id) {
        return jdbc.queryForObject("SELECT description FROM biz_organic_score_rule WHERE id = ?",
                String.class, id);
    }

    private int scoreOf(long id) {
        Integer score = jdbc.queryForObject("SELECT score FROM biz_organic_score_rule WHERE id = ?", Integer.class, id);
        return score == null ? -1 : score;
    }

    @Test
    @DisplayName("列缺失时先补列再收敛：五档全预填 100、说明换新、score 保留旧满分")
    void addsColumnThenSeedsFivePeriodMaxScores() {
        assertThrows(Exception.class, this::verify, "列还不存在时校验不应通过");

        migrate();

        String config = configOf(31);
        for (String period : new String[]{"breakfast", "lunch", "afternoonTea", "dinner", "lateNight"}) {
            assertTrue(config.contains("\"periodValue\":\"" + period + "\""), config);
        }
        assertTrue(config.contains("\"score\":100"), config);
        assertEquals(NEW_DESC, descOf(31));
        // DECAY 模式 legacy 引擎把 score 当满分：保留 100，不置 0（与 STB_01 加分项先例不同）
        assertEquals(100, scoreOf(31));
        // 只动目标编码：同表其它规则零改动
        assertEquals(0, scoreOf(32));
        assertEquals("流量均衡說明", descOf(32));
        verify();
    }

    @Test
    @DisplayName("重跑幂等；运营已配过的满分清单与自定义说明不被顶掉")
    void rerunIsIdempotentAndAdminConfigIsPreserved() {
        migrate();
        // 模拟运营在界面改过配置（午餐 80）与自定义说明，重跑绝不能覆盖
        jdbc.update("UPDATE biz_organic_score_rule SET decay_period_config = ?, description = ? WHERE id = 31",
                "{\"items\":[{\"periodValue\":\"lunch\",\"periodName\":\"午餐\",\"score\":80}]}", "運營自定義說明");

        migrate();
        migrate();

        assertTrue(configOf(31).contains("\"score\":80"), configOf(31));
        assertEquals("運營自定義說明", descOf(31));
        verify();
    }

    @Test
    @DisplayName("未播种不算失败；NULL 配置或旧内置说明残留会被校验暴露")
    void missingSeedPassesButResidueIsDetected() {
        migrate();
        jdbc.update("DELETE FROM biz_organic_score_rule WHERE rule_code = 'PLT_01'");
        verify();

        // 列已就绪后补一行未收敛的在用记录（等价于种子被手工重跑），校验必须让启动暴露它
        jdbc.execute("INSERT INTO biz_organic_score_rule (id, rule_code, name, description, score) "
                + "VALUES (131, 'PLT_01', '距離衰減', '" + OLD_DESC + "', 100)");
        assertThrows(IllegalStateException.class, this::verify);

        migrate();
        verify();

        // 仅残留旧内置说明（配置已写）也要暴露：说明收敛守卫与校验同口径
        jdbc.update("UPDATE biz_organic_score_rule SET description = ? WHERE id = 131", OLD_DESC);
        assertThrows(IllegalStateException.class, this::verify);
        migrate();
        verify();
    }
}
