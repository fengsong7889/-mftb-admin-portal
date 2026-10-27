package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 回填历史会话的 {@code request_count}（配套服务端回合计数改造）。
 * <p><b>为什么需要</b>：请求次数以前没有任何写入方，审计页该列全显示 {@code --}，
 * 管理员无法判断一次会话被调了多少次；改成服务端计数后，<b>存量会话仍是 0</b>，
 * 新数据又带着真实值，同一列两种可信度反而更容易误读。
 * <p>口径（取三者最大值，只补 request_count=0 的行，不覆盖已有真值）：
 * 事件表 {@code USER_TURN} 条数、messages JSON 里 {@code "role":"user"} 出现次数。
 * <p>幂等 + 后置校验；失败抛出，不吞异常。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25)
public class AiConversationCountBackfillInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:conversation-count-backfill:v1.0";
    /** messages 里一条 user 消息的 JSON 片段（与前端落库结构一致） */
    private static final String USER_ROLE_TOKEN = "\"role\":\"user\"";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        int filled = jdbcTemplate.update(
                "UPDATE ai_conversation c "
                + "SET c.request_count = GREATEST("
                + "      COALESCE((SELECT COUNT(*) FROM ai_conversation_event e "
                + "                  WHERE e.conversation_pk = c.id AND e.event_type = 'USER_TURN'), 0), "
                + "      COALESCE((LENGTH(c.messages) - LENGTH(REPLACE(c.messages, ?, ''))) / LENGTH(?), 0)) "
                + "WHERE COALESCE(c.request_count, 0) = 0 "
                + "  AND c.messages IS NOT NULL AND c.messages != '[]' AND c.deleted = 0",
                USER_ROLE_TOKEN, USER_ROLE_TOKEN);
        log.info("会话请求次数回填: 补齐 {} 条历史会话（只动 request_count=0 的行）", filled);
    }

    /** 后置校验：有对话内容且事件可数的活跃会话，不应再有 request_count=0 的存量行。 */
    private void verifyMigration() {
        Integer remaining = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_conversation c "
                + "WHERE COALESCE(c.request_count, 0) = 0 AND c.deleted = 0 "
                + "  AND c.messages IS NOT NULL AND c.messages != '[]' "
                + "  AND c.messages LIKE CONCAT('%', ?, '%')", Integer.class, USER_ROLE_TOKEN);
        if (remaining != null && remaining > 0) {
            throw new IllegalStateException("仍有 " + remaining + " 条含用户消息的会话 request_count=0，回填未生效");
        }
    }
}
