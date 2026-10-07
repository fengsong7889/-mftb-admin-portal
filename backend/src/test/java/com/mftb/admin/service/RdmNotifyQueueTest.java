package com.mftb.admin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 通知投递队列测试（阶段 2C）。
 * <p>核心是「状态必须反映渠道结果，而不是调用结果」，四条：
 * <ol>
 *   <li>抢不到任务就不发送（多实例不重复打扰）；</li>
 *   <li>渠道受理才记 sent；</li>
 *   <li>未受理按退避转 failed，重试用尽记 abandoned 而不是静默丢弃；</li>
 *   <li>dry-run 下不得调用真实渠道。</li>
 * </ol>
 */
class RdmNotifyQueueTest {

    private JdbcTemplate jdbcTemplate;
    private DingTalkService dingTalk;
    private RdmNotifyDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        dingTalk = mock(DingTalkService.class);
        dispatcher = new RdmNotifyDispatcher(dingTalk, jdbcTemplate);
    }

    private void stubTask(int attempts) {
        Map<String, Object> row = new HashMap<>();
        row.put("scenario", "rdm");
        row.put("title", "需求待審批");
        row.put("content", "### 需求待審批");
        row.put("at_mobiles", "13800000000");
        row.put("attempts", attempts);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row));
    }

    @Test
    @DisplayName("抢不到任务时不发送（同一任务只允许一个执行者）")
    void lostClaimSendsNothing() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);

        dispatcher.send(1L);

        verify(dingTalk, never()).sendMarkdownSync(anyString(), any(), any(), any(), eq(false));
    }

    @Test
    @DisplayName("渠道受理才记 sent")
    void acceptedMarksSent() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        stubTask(1);
        when(dingTalk.sendMarkdownSync(anyString(), any(), any(), any(), eq(false)))
                .thenReturn(DingTalkService.SendOutcome.accepted("釘釘群機器人"));

        dispatcher.send(1L);

        verify(jdbcTemplate).update(contains("send_status = ?"), eq("sent"), any(), eq("釘釘群機器人"), eq(1L));
    }

    @Test
    @DisplayName("渠道拒绝时按退避转 failed，不记 sent")
    void rejectedSchedulesRetry() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        stubTask(2);
        when(dingTalk.sendMarkdownSync(anyString(), any(), any(), any(), eq(false)))
                .thenReturn(DingTalkService.SendOutcome.rejected("130101", "token invalid", "釘釘群機器人"));

        dispatcher.send(1L);

        verify(jdbcTemplate).update(contains("SET send_status = 'failed'"), any(), any(), eq(5), eq(1L));
    }

    @Test
    @DisplayName("重试用尽记 abandoned（需人工补发），不能静默丢弃")
    void exhaustedAttemptsMarksAbandoned() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        stubTask(RdmNotifyDispatcher.MAX_ATTEMPTS);
        when(dingTalk.sendMarkdownSync(anyString(), any(), any(), any(), eq(false)))
                .thenThrow(new RuntimeException("network down"));

        dispatcher.send(1L);

        verify(jdbcTemplate).update(contains("send_status = ?"), eq("abandoned"), any(), any(), eq(1L));
    }

    @Test
    @DisplayName("dry-run 不调用真实渠道")
    void dryRunNeverCallsChannel() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        stubTask(1);
        ReflectionTestUtils.setField(dispatcher, "dryRun", true);

        dispatcher.send(1L);

        verify(dingTalk, never()).sendMarkdownSync(anyString(), any(), any(), any(), eq(false));
        verify(jdbcTemplate).update(contains("send_status = ?"), eq("skipped"), any(), any(), eq(1L));
    }

    @Test
    @DisplayName("退避表覆盖 5 次尝试，间隔按分钟递增")
    void backoffTableMatchesSpec() {
        assertTrue(RdmNotifyDispatcher.BACKOFF_MINUTES.length >= RdmNotifyDispatcher.MAX_ATTEMPTS - 1,
                "最後一次失敗也必須有間隔可取");
        assertTrue(RdmNotifyDispatcher.BACKOFF_MINUTES[0] == 1
                && RdmNotifyDispatcher.BACKOFF_MINUTES[1] == 5
                && RdmNotifyDispatcher.BACKOFF_MINUTES[2] == 30
                && RdmNotifyDispatcher.BACKOFF_MINUTES[3] == 120
                && RdmNotifyDispatcher.BACKOFF_MINUTES[4] == 360, "重試節奏必須與方案一致：1分/5分/30分/2小時/6小時");
    }
}
