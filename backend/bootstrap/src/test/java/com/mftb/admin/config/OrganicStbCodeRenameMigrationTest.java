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
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 隔离内存库验证 organic:rename-stb-code-numeric-v1（STB_LABEL → STB_04、STB_ACT → STB_09）：
 * 1) 目标编码被已下架残留行（deleted=1）占用时，先把残留行改挂 *_RETIRED 让位再改在用行——
 *    表上带 UNIQUE(rule_code)，漏了让位这一步会直接撞唯一键，测试即失败；
 * 2) 改名只动 rule_code 与 updated_by，运营改过的名称/分值/启停/排序号原样保留；
 * 3) 重跑幂等：第二次执行不会把刚改好的 STB_04 当成残留再扫走；
 * 4) 目标编码被未删除的行占用（运营自建撞号）时抛异常且不碰运营数据，本步不记版本、下次启动重试；
 * 5) 后置校验：旧语义编码零残留、两个目标编码必须有行，否则让启动暴露。
 */
class OrganicStbCodeRenameMigrationTest {

    private JdbcTemplate jdbc;
    private OrganicScoreDataInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:organic_rename_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        // 故意带 UNIQUE(rule_code)：真实库的 uk_rule_code 就是本迁移必须先让位的根因，漏掉必须在这里红
        jdbc.execute("CREATE TABLE biz_organic_score_rule (id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "rule_code VARCHAR(50) NOT NULL UNIQUE, dimension INT, name VARCHAR(100), description VARCHAR(500), "
                + "mode INT, score INT, prerequisites VARCHAR(500), status INT DEFAULT 1, builtin INT DEFAULT 1, "
                + "sort_order INT DEFAULT 0, updated_by VARCHAR(50), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO biz_organic_score_rule (rule_code, dimension, name, mode, score, sort_order, deleted) VALUES "
                // 在用两项：待收编的语义编码
                + "('STB_LABEL', 2, '門店標籤', 1, 0, 2, 0), "
                + "('STB_ACT', 2, '活動加分', 1, 0, 12, 0), "
                // 目标编码被已下架残留行物理占用（deleted=1，应用读不到但仍占唯一键）
                + "('STB_04', 2, '店鋪標籤-金牌', 1, 60, 2, 1), "
                + "('STB_09', 2, '超時接單', 3, 0, 11, 1), "
                // 同维度在用项：本迁移一行都不该动
                + "('STB_08', 2, '訂單取消率', 6, 0, 10, 0)");
        initializer = new OrganicScoreDataInitializer(jdbc, new SchemaVersionTracker(jdbc));
    }

    private void rename() {
        ReflectionTestUtils.invokeMethod(initializer, "renameStbCodesToNumeric");
    }

    private void verify() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyStbCodesRenamed");
    }

    /** 显式列出列名：Spring 的 ColumnMapRowMapper 会把列标签转小写，键统一按小写取 */
    private Map<String, Object> row(String ruleCode) {
        return jdbc.queryForMap("SELECT rule_code, dimension, name, mode, score, sort_order, status, builtin, deleted, updated_by "
                + "FROM biz_organic_score_rule WHERE rule_code = ?", ruleCode);
    }

    private int count(String ruleCode) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = ?",
                Integer.class, ruleCode);
    }

    private int countAll() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM biz_organic_score_rule", Integer.class);
    }

    @Test
    @DisplayName("残留行先让位、在用行再收编，旧语义编码零残留")
    void renamesAfterRetiredResidueYieldsCode() {
        rename();

        Map<String, Object> label = row(OrganicScoreDataInitializer.STORE_LABEL_TARGET_CODE);
        assertEquals(2, label.get("dimension"), "門店標籤属店鋪維度");
        assertEquals("門店標籤", label.get("name"));
        assertEquals(2, label.get("sort_order"), "顶替原金牌项的 2 号位，界面位置不变");
        assertEquals(0, label.get("deleted"));
        assertEquals("system", label.get("updated_by"));

        Map<String, Object> activity = row(OrganicScoreDataInitializer.STORE_ACTIVITY_TARGET_CODE);
        assertEquals("活動加分", activity.get("name"));
        assertEquals(12, activity.get("sort_order"), "仍排在订单取消率之后");
        assertEquals(0, activity.get("deleted"));

        // 残留行只改编码：名称、分值、排序号、deleted 标记原封不动，历史仍可回滚
        Map<String, Object> retiredLabel = row("STB_04_RETIRED");
        assertEquals("店鋪標籤-金牌", retiredLabel.get("name"));
        assertEquals(60, retiredLabel.get("score"));
        assertEquals(1, retiredLabel.get("deleted"));
        Map<String, Object> retiredActivity = row("STB_09_RETIRED");
        assertEquals("超時接單", retiredActivity.get("name"));
        assertEquals(3, retiredActivity.get("mode"), "旧按次计罚配置不被本迁移顺手改写");
        assertEquals(1, retiredActivity.get("deleted"));

        assertEquals(0, count("STB_LABEL"), "旧语义编码不得残留");
        assertEquals(0, count("STB_ACT"), "旧语义编码不得残留");
        assertEquals(5, countAll(), "只改编码不增删行");

        // 同维度在用项零改动
        assertEquals("訂單取消率", row("STB_08").get("name"));

        verify();
    }

    @Test
    @DisplayName("重跑幂等：不会把刚改好的编码当成残留再扫走")
    void rerunIsIdempotent() {
        rename();
        jdbc.update("UPDATE biz_organic_score_rule SET name = ?, score = 30 WHERE rule_code = ?",
                "門店標籤（運營改名）", OrganicScoreDataInitializer.STORE_LABEL_TARGET_CODE);

        rename();
        verify();

        assertEquals(1, count(OrganicScoreDataInitializer.STORE_LABEL_TARGET_CODE));
        assertEquals(0, count("STB_04_RETIRED_RETIRED"), "已让位的残留行不得被二次扫走");
        Map<String, Object> label = row(OrganicScoreDataInitializer.STORE_LABEL_TARGET_CODE);
        assertEquals("門店標籤（運營改名）", label.get("name"), "运营改名不被重跑覆盖");
        assertEquals(30, label.get("score"));
    }

    @Test
    @DisplayName("目标编码被未删除行占用时报错，绝不移动运营数据")
    void refusesToClobberLiveOccupant() {
        // 运营自建项恰好撞上同一序号：残留行让位后 STB_04 仍是 deleted=0
        jdbc.update("UPDATE biz_organic_score_rule SET deleted = 0 WHERE rule_code = 'STB_04'");

        IllegalStateException error = assertThrows(IllegalStateException.class, this::rename);
        assertEquals(true, error.getMessage().contains(OrganicScoreDataInitializer.STORE_LABEL_TARGET_CODE),
                "报错必须点明被占用的目标编码，便于人工处置：" + error.getMessage());
        // 占用行原样保留（编码与名称都没被动过），在用项也没被半改
        Map<String, Object> occupant = row("STB_04");
        assertEquals("店鋪標籤-金牌", occupant.get("name"));
        assertEquals(0, occupant.get("deleted"));
        assertEquals(1, count("STB_LABEL"), "撞号时整对改名必须中止，不能出现半迁移状态");
    }

    @Test
    @DisplayName("后置校验：旧编码残留或目标编码缺行都必须让启动暴露")
    void verifyFailsOnIncompleteRename() {
        // 只改第一对（模拟人工修库半途）：另一对仍是旧语义编码，后置校验必须报错而不是静默记成功
        jdbc.update("UPDATE biz_organic_score_rule SET rule_code = 'STB_04_RETIRED' WHERE rule_code = 'STB_04' AND deleted = 1");
        jdbc.update("UPDATE biz_organic_score_rule SET rule_code = 'STB_04' WHERE rule_code = 'STB_LABEL'");

        assertThrows(IllegalStateException.class, this::verify);

        // 补完第二对即通过
        jdbc.update("UPDATE biz_organic_score_rule SET rule_code = 'STB_09_RETIRED' WHERE rule_code = 'STB_09' AND deleted = 1");
        jdbc.update("UPDATE biz_organic_score_rule SET rule_code = 'STB_09' WHERE rule_code = 'STB_ACT'");
        verify();
    }
}
