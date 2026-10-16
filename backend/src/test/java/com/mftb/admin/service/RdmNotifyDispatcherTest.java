package com.mftb.admin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 任务22 B.3 / B.6 —— 投递执行器的 <b>dry-run 严守</b>与既有 outbox 语义测试。
 *
 * <p>锁死五条结论：
 * <ol>
 *   <li><b>dry-run 下任何路径都不发</b>：正常投递（{@code send}）与<b>兜底直发</b>（{@code sendOnce}）
 *       都被开关拦下。旧实现的 {@code sendOnce} 只看正文是否为空、完全绕过
 *       {@code rdm.notify.dry-run}，等于「联调环境的测试消息真的打到生产群」——
 *       本测试就是这条缺陷的回归栅栏；</li>
 *   <li><b>dry-run 不弱化审计</b>：不真发但状态照实记为 {@code skipped}，
 *       不会被误读成「已通知」；</li>
 *   <li><b>抢占式领取不变</b>：条件更新抢不到任务（返回 0）时不查正文、不发送，
 *       多实例部署下同一行只被一个执行者拿到；</li>
 *   <li><b>sent = 渠道已受理</b>：只有 {@code channelAccepted} 才记 sent，否则进退避重试；</li>
 *   <li><b>退避与耗尽</b>：未达 5 次记 failed 并按 {@code BACKOFF_MINUTES} 排下一次；
 *       达到 5 次记 abandoned 供人工补发，不静默丢弃。</li>
 * </ol>
 *
 * <p><b>纯 Mockito 离线单测，不连库。</b>mock 只证明分支与状态流转逻辑，
 * <b>不等价于真实数据库下的并发抢占证明</b>（条件更新的互斥性归属任务24 的真实库验证）。
 */
class RdmNotifyDispatcherTest {

    private static final long TASK_ID = 900L;
    private static final String CLAIM_SQL_FRAGMENT = "send_status = 'sending'";
    private static final String RETRY_SQL_FRAGMENT = "send_status = 'failed'";

    private DingTalkService dingTalkService;
    private JdbcTemplate jdbcTemplate;
    private RdmNotifyDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dingTalkService = mock(DingTalkService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        dispatcher = new RdmNotifyDispatcher(dingTalkService, jdbcTemplate);
        // 默认抢占成功（claim 是唯一一个「1 个可变参数」的 update 调用）
        doReturn(1).when(jdbcTemplate).update(contains(CLAIM_SQL_FRAGMENT), ArgumentMatchers.<Object>any());
        doReturn(List.of(row(1, "正文"))).when(jdbcTemplate).queryForList(anyString(), ArgumentMatchers.<Object>any());
    }

    private static Map<String, Object> row(int attempts, String content) {
        return Map.of("scenario", "rdm", "title", "標題", "content", content,
                "at_mobiles", "13800000000", "attempts", attempts);
    }

    private void dryRun(boolean value) {
        ReflectionTestUtils.setField(dispatcher, "dryRun", value);
    }

    /* ==================== B.6 dry-run 严守 ==================== */

    @Test
    @DisplayName("dry-run=true：正常投递不联系渠道，状态记skipped（不真发但不假装已通知）")
    void dryRunBlocksNormalSendAndRecordsSkipped() {
        dryRun(true);

        dispatcher.send(TASK_ID);

        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
        verify(jdbcTemplate).update(contains("send_status = ?"), eq("skipped"),
                contains("dry-run"), any(), any());
        assertTrue(dispatcher.isDryRun());
    }

    @Test
    @DisplayName("dry-run=true：兜底sendOnce同样被拦下且返回false（B.3缺陷回归栅栏）")
    void dryRunBlocksSendOnceFallback() {
        dryRun(true);

        boolean sent = dispatcher.sendOnce("PROJECT_URGE", "rdm", "標題", "正文", List.of("13800000000"));

        assertFalse(sent, "dry-run 下兜底路径也不得声称已发送");
        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
        // 兜底路径没有任何持久化凭据，因此也不该去动队列表状态
        verify(jdbcTemplate, never()).update(anyString(), ArgumentMatchers.<Object>any());
    }

    @Test
    @DisplayName("dry-run=false：sendOnce才真正交给渠道（开关是唯一闸门，未被弱化也未被常开）")
    void sendOnceSendsOnlyWhenDryRunOff() {
        dryRun(false);
        doReturn(DingTalkService.SendOutcome.accepted("dingtalk")).when(dingTalkService)
                .sendMarkdownSync(anyString(), anyString(), anyString(), anyList(), anyBoolean());

        assertTrue(dispatcher.sendOnce("PROJECT_URGE", "rdm", "標題", "正文", List.of("13800000000")));
        verify(dingTalkService).sendMarkdownSync(eq("rdm"), eq("標題"), eq("正文"),
                eq(List.of("13800000000")), eq(false));
    }

    @Test
    @DisplayName("sendOnce：正文为空不发；渠道抛异常不外泄只返回false（无重试凭据→留人工跟进）")
    void sendOnceGuardsBlankTextAndChannelFailure() {
        dryRun(false);
        assertFalse(dispatcher.sendOnce("PROJECT_URGE", "rdm", "標題", "  ", List.of()));
        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());

        doThrow(new RuntimeException("webhook 500")).when(dingTalkService)
                .sendMarkdownSync(anyString(), anyString(), anyString(), anyList(), anyBoolean());
        assertDoesNotThrow(() -> assertFalse(
                dispatcher.sendOnce("PROJECT_URGE", "rdm", "標題", "正文", null)));
    }

    @Test
    @DisplayName("dry-run=false且渠道受理：记sent（sent=渠道已受理，不是方法返回了）")
    void sentOnlyWhenChannelAccepted() {
        dryRun(false);
        doReturn(DingTalkService.SendOutcome.accepted("dingtalk")).when(dingTalkService)
                .sendMarkdownSync(anyString(), anyString(), anyString(), anyList(), anyBoolean());

        dispatcher.send(TASK_ID);

        verify(jdbcTemplate).update(contains("send_status = ?"), eq("sent"), any(), eq("dingtalk"), any());
    }

    /* ==================== 既有 outbox 语义不回归 ==================== */

    @Test
    @DisplayName("抢不到任务（条件更新命中0行）→不查正文、不发送、不落状态")
    void claimFailureShortCircuits() {
        dryRun(false);
        doReturn(0).when(jdbcTemplate).update(contains(CLAIM_SQL_FRAGMENT), ArgumentMatchers.<Object>any());

        dispatcher.send(TASK_ID);

        verify(jdbcTemplate, never()).queryForList(anyString(), ArgumentMatchers.<Object>any());
        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
    }

    @Test
    @DisplayName("id为null直接返回（不去抢占一个不存在的任务）")
    void nullIdIsIgnored() {
        dryRun(false);

        dispatcher.send(null);

        verify(jdbcTemplate, never()).update(anyString(), ArgumentMatchers.<Object>any());
        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
    }

    @Test
    @DisplayName("dispatch与send同源：异步入口最终也走抢占+dry-run（不存在绕过开关的第二条路）")
    void dispatchGoesThroughSamePipeline() {
        dryRun(true);

        dispatcher.dispatch(TASK_ID);

        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
    }

    @Test
    @DisplayName("渠道拒绝且未达上限：记failed并按BACKOFF_MINUTES排下一次重试")
    void rejectedBelowMaxAttemptsSchedulesRetry() {
        dryRun(false);
        doReturn(List.of(row(2, "正文"))).when(jdbcTemplate).queryForList(anyString(), ArgumentMatchers.<Object>any());
        doReturn(DingTalkService.SendOutcome.rejected("310000", "keywords not in content", "dingtalk"))
                .when(dingTalkService).sendMarkdownSync(anyString(), anyString(), anyString(), anyList(), anyBoolean());

        dispatcher.send(TASK_ID);

        // attempts=2 → BACKOFF_MINUTES[min(2-1, 4)] = 5 分钟
        verify(jdbcTemplate).update(contains(RETRY_SQL_FRAGMENT), any(), any(), eq(5), eq(TASK_ID));
        verify(jdbcTemplate, never()).update(contains("send_status = ?"), eq("abandoned"), any(), any(), any());
    }

    @Test
    @DisplayName("重试耗尽（attempts>=5）：记abandoned供人工补发，不静默丢弃")
    void exhaustedAttemptsAreAbandoned() {
        dryRun(false);
        doReturn(List.of(row(RdmNotifyDispatcher.MAX_ATTEMPTS, "正文"))).when(jdbcTemplate).queryForList(anyString(), ArgumentMatchers.<Object>any());
        doThrow(new RuntimeException("webhook timeout")).when(dingTalkService)
                .sendMarkdownSync(anyString(), anyString(), anyString(), anyList(), anyBoolean());

        dispatcher.send(TASK_ID);

        verify(jdbcTemplate).update(contains("send_status = ?"), eq("abandoned"), any(), any(), eq(TASK_ID));
        verify(jdbcTemplate, never()).update(contains(RETRY_SQL_FRAGMENT), any(), any(), any(), any());
    }

    @Test
    @DisplayName("正文为空：记skipped且不联系渠道（空消息发出去只会是噪音）")
    void blankContentIsSkipped() {
        dryRun(false);
        doReturn(List.of(row(1, "  "))).when(jdbcTemplate).queryForList(anyString(), ArgumentMatchers.<Object>any());

        dispatcher.send(TASK_ID);

        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
        verify(jdbcTemplate).update(contains("send_status = ?"), eq("skipped"), any(), any(), eq(TASK_ID));
    }

    @Test
    @DisplayName("任务行已消失（被删）→只记日志返回，不发送")
    void vanishedTaskIsNotSent() {
        dryRun(false);
        doReturn(List.of()).when(jdbcTemplate).queryForList(anyString(), ArgumentMatchers.<Object>any());

        dispatcher.send(TASK_ID);

        verify(dingTalkService, never()).sendMarkdownSync(any(), any(), any(), anyList(), anyBoolean());
    }

    @Test
    @DisplayName("重试次数语义未改：最多5次尝试，退避1/5/30/120/360分钟")
    void retrySemanticsUnchanged() {
        assertEquals(5, RdmNotifyDispatcher.MAX_ATTEMPTS);
        assertEquals(5, RdmNotifyDispatcher.BACKOFF_MINUTES.length);
        assertEquals(1, RdmNotifyDispatcher.BACKOFF_MINUTES[0]);
        assertEquals(5, RdmNotifyDispatcher.BACKOFF_MINUTES[1]);
        assertEquals(30, RdmNotifyDispatcher.BACKOFF_MINUTES[2]);
        assertEquals(120, RdmNotifyDispatcher.BACKOFF_MINUTES[3]);
        assertEquals(360, RdmNotifyDispatcher.BACKOFF_MINUTES[4]);
    }

    @Test
    @DisplayName("抢占条件只认pending/failed（sending/sent/skipped/abandoned都不会被二次领取）")
    void claimOnlyAcceptsPendingOrFailed() {
        dryRun(true);

        dispatcher.send(TASK_ID);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).update(sql.capture(), ArgumentMatchers.<Object>any());
        assertTrue(sql.getValue().contains("send_status IN ('pending','failed')"),
                "领取互斥靠这条条件更新，改动它会破坏 outbox 语义，实际=" + sql.getValue());
        assertTrue(sql.getValue().contains("attempts = attempts + 1"));
    }

    @Test
    @DisplayName("isDryRun如实反映开关（供上层判断本轮不会真发，不得用于弱化开关）")
    void isDryRunReflectsSwitch() {
        dryRun(false);
        assertFalse(dispatcher.isDryRun());
        dryRun(true);
        assertTrue(dispatcher.isDryRun());
    }
}
