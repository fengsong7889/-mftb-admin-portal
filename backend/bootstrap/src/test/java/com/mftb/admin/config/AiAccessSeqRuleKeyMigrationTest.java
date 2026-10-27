package com.mftb.admin.config;

import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * AI 使用申請流程編號規則 key 對齊遷移（seq:init-v22）的隔離庫驗證。
 * <p>
 * 背景：sys_biz_seq_rule 對 prefix 有唯一鍵，舊種子 rule_key=ai_access 佔住 AI 前綴後，
 * 按 ai_access_request 寫入的種子被 INSERT IGNORE 靜默丟棄，提交 AI 申請直接 fail-closed
 * 報「編號生成規則未配置」。這裡只在 H2 內存庫驗證改名口徑，不連開發/生產庫。
 */
class AiAccessSeqRuleKeyMigrationTest {

    private JdbcTemplate jdbc;
    private BizSeqService bizSeqService;
    private BizSeqRuleInitializer initializer;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:ai_access_seq_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = spy(new JdbcTemplate(dataSource));
        jdbc.execute("CREATE TABLE sys_biz_seq_rule ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "rule_key VARCHAR(64) NOT NULL, "
                + "rule_name VARCHAR(64) NOT NULL, "
                + "biz_menu VARCHAR(64) NULL, "
                + "prefix VARCHAR(16) NOT NULL, "
                + "date_format VARCHAR(16) NOT NULL DEFAULT '', "
                + "seq_length INT NOT NULL DEFAULT 4, "
                + "seq_start INT NOT NULL DEFAULT 0, "
                + "remark VARCHAR(255) NULL, "
                + "status TINYINT NOT NULL DEFAULT 1, "
                + "UNIQUE KEY uk_seq_rule_key (rule_key), "
                + "UNIQUE KEY uk_seq_rule_prefix (prefix))");
        // 流水按 prefix 記帳：改 rule_key 不得影響它
        jdbc.execute("CREATE TABLE sys_biz_seq (id BIGINT AUTO_INCREMENT PRIMARY KEY, prefix VARCHAR(16) NOT NULL, "
                + "date_key VARCHAR(16) NOT NULL, current_value BIGINT NOT NULL)");

        var tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "ai-access-seq-test");
        tracker.isApplied("warmup"); // 建出 sys_schema_version / 审计表
        bizSeqService = mock(BizSeqService.class);
        initializer = new BizSeqRuleInitializer(jdbc, tracker, bizSeqService);
    }

    @AfterEach
    void tearDown() {
        if (jdbc != null) jdbc.execute("SHUTDOWN");
    }

    /** 插入当日的 AI 流水（存量事实），改名后必须原样保留 */
    private void seedAiSeq() {
        jdbc.update("INSERT INTO sys_biz_seq (prefix, date_key, current_value) VALUES ('AI', '20261023', 7)");
    }

    @Test
    void renamesLegacyKeyWithoutTouchingPrefixOrSequence() {
        jdbc.update("INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                + "seq_length, seq_start, remark, status) VALUES "
                + "('ai_access', 'AI申請流程編號', '審批中心', 'AI', 'YYYYMMDD', 4, 1, '舊種子', 1)");
        seedAiSeq();

        initializer.alignAiAccessRuleKey();

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT rule_key, prefix, date_format, seq_length, seq_start, rule_name, status "
                        + "FROM sys_biz_seq_rule WHERE prefix = 'AI'");
        assertEquals("ai_access_request", row.get("rule_key"));
        assertEquals("AI", row.get("prefix"));
        assertEquals("YYYYMMDD", row.get("date_format"));
        assertEquals(4, ((Number) row.get("seq_length")).intValue());
        assertEquals(1, ((Number) row.get("seq_start")).intValue(), "序号起点属管理员配置，迁移不得改写");
        assertEquals("AI申請流程編號", row.get("rule_name"));
        assertEquals(1, ((Number) row.get("status")).intValue(), "启用状态不得被迁移改写");

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_biz_seq_rule", Integer.class),
                "改名后仍应只有一行，不得新旧并存");
        assertEquals(7L, jdbc.queryForObject(
                "SELECT current_value FROM sys_biz_seq WHERE prefix = 'AI' AND date_key = '20261023'",
                Long.class), "流水按 prefix 记帐，改名不得重置水位");

        assertDoesNotThrow(() -> initializer.verifyAiAccessRuleKey());
        verify(bizSeqService, atLeastOnce()).refreshRules();
    }

    @Test
    void repeatedRunIsIdempotent() {
        jdbc.update("INSERT INTO sys_biz_seq_rule (rule_key, rule_name, prefix, seq_length, status) "
                + "VALUES ('ai_access', 'AI申請流程編號', 'AI', 4, 1)");

        initializer.alignAiAccessRuleKey();
        initializer.alignAiAccessRuleKey();

        assertEquals("ai_access_request",
                jdbc.queryForObject("SELECT rule_key FROM sys_biz_seq_rule WHERE prefix = 'AI'", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_biz_seq_rule", Integer.class));
    }

    @Test
    void keepsCanonicalKeyWhenAlreadySeeded() {
        jdbc.update("INSERT INTO sys_biz_seq_rule (rule_key, rule_name, prefix, seq_length, status) "
                + "VALUES ('ai_access_request', 'AI申請流程編號', 'AI', 4, 1)");

        initializer.alignAiAccessRuleKey();

        assertEquals("ai_access_request",
                jdbc.queryForObject("SELECT rule_key FROM sys_biz_seq_rule WHERE prefix = 'AI'", String.class));
        assertDoesNotThrow(() -> initializer.verifyAiAccessRuleKey());
    }

    @Test
    void seedsRuleWhenNeitherKeyExists() {
        initializer.alignAiAccessRuleKey();

        assertEquals("ai_access_request",
                jdbc.queryForObject("SELECT rule_key FROM sys_biz_seq_rule WHERE prefix = 'AI'", String.class));
        assertDoesNotThrow(() -> initializer.verifyAiAccessRuleKey());
    }

    @Test
    void verifyFailsClosedWhenRuleRowMissing() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> initializer.verifyAiAccessRuleKey());
        assertTrue(ex.getMessage().contains("ai_access_request"), ex.getMessage());
    }

    /** 規則 key 是對外數據契約（sys_biz_seq_rule.rule_key），改名必須同步遷移與前端目錄 */
    @Test
    void ruleKeyIsCanonical() {
        assertEquals("ai_access_request", BizSeqService.RULE_AI_ACCESS_REQUEST);
    }
}
