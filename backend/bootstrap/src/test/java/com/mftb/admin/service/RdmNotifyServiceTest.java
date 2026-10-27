package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmNotifyLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 任务22 B.2 / B.3 —— 通知入队的<b>事件级去重</b>与 <b>fallback 不得绕过 dry-run</b> 测试。
 *
 * <p>锁死六条结论：
 * <ol>
 *   <li><b>同键只发一次</b>：{@code (object_type, object_id, event_version, receiver_user_id)} 已出站过
 *       就不再入队；并发命中唯一索引（{@link DuplicateKeyException}）时静默让位，<b>不重试、不降级发送</b>；</li>
 *   <li><b>每接收人一行、四元组齐全</b>：写入 {@code rdm_notify_log} 的行必须携带完整
 *       {@code object_type/object_id/event_version/receiver_user_id/dedupe_key}，
 *       这是 238 冻结 DDL 的 {@code ck_rdm_notify_dedupe} 与 {@code uk_rdm_notify_dedupe} 的前提；</li>
 *   <li><b>fail-closed</b>：四元组不完整（如无接收人）直接拒绝，<b>绝不</b>降级成
 *       「不知道发给谁就不去重」的群发；正文为空同样不发；</li>
 *   <li><b>B.3 fallback 修复</b>：登记失败后<b>任何路径都不再调用 {@code dispatcher.sendOnce}</b>，
 *       改为「提交后重试登记」。旧实现的直发有两宗罪：事务未提交就把消息推给真实收件人
 *       （回滚了通知却收不回），且 {@code sendOnce} 不查 dry-run 开关；</li>
 *   <li><b>提交后才投递</b>：有活动事务时注册 {@code afterCommit}，提交前不 dispatch；
 *       无事务（定时作业）时立即 dispatch，但仍经由 dispatcher，dry-run/抢占/退避一个不少；</li>
 *   <li><b>通知服务不直连渠道</b>：{@link RdmNotifyService} 全程不与 {@code DingTalkService} 交互，
 *       因此不存在绕过 dry-run 的旁路。</li>
 * </ol>
 *
 * <p><b>纯 Mockito 离线单测，不连库、不跑迁移。</b>
 * 唯一索引在真实并发下的兜底行为归属任务24，mock 只证明「本服务在同键时不再入队、
 * 在命中唯一索引时不降级发送」这两条应用层逻辑，<b>不等价于真实数据库并发证明</b>。
 */
class RdmNotifyServiceTest {

    private static final String EVENT = RdmConstants.EVENT_PROJECT_URGE;
    private static final String OBJECT_TYPE = "project_urge:delivery_item";
    private static final long OBJECT_ID = 77L;
    private static final String EVENT_VERSION = "DATE:2026-03-04";
    private static final long RECEIVER = 41L;
    private static final long TASK_ID = 555L;
    private static final String TITLE = "【催辦】P-001 交付項";
    private static final String TEXT = "### ⏰ 待辦已逾期\n\n請盡快推進";

    /** insertDedupeTask 的占位符序（13 个），用于精确断言写入内容 */
    private static final int IDX_REQ_ID = 1;
    private static final int IDX_EVENT_CODE = 2;
    private static final int IDX_SCENARIO = 3;
    private static final int IDX_TITLE = 4;
    private static final int IDX_CONTENT = 5;
    private static final int IDX_AT_MOBILES = 6;
    private static final int IDX_STATUS = 8;
    private static final int IDX_OBJECT_TYPE = 9;
    private static final int IDX_OBJECT_ID = 10;
    private static final int IDX_EVENT_VERSION = 11;
    private static final int IDX_RECEIVER = 12;
    private static final int IDX_DEDUPE_KEY = 13;

    private RdmNotifyDispatcher dispatcher;
    private SysUserMapper sysUserMapper;
    private JdbcTemplate jdbcTemplate;
    private RdmNotifyLogMapper notifyLogMapper;
    private RdmNotifyService notifyService;
    private Connection connection;
    private PreparedStatement preparedStatement;

    @BeforeEach
    void setUp() throws Exception {
        dispatcher = mock(RdmNotifyDispatcher.class);
        sysUserMapper = mock(SysUserMapper.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        notifyLogMapper = mock(RdmNotifyLogMapper.class);
        // 用真实的去重服务：键的构成必须与 RdmNotifyDedupeService 完全一致，mock 掉就等于没测
        notifyService = new RdmNotifyService(dispatcher, sysUserMapper, jdbcTemplate,
                new RdmNotifyDedupeService(notifyLogMapper));

        connection = mock(Connection.class);
        preparedStatement = mock(PreparedStatement.class);
        doReturn(preparedStatement).when(connection)
                .prepareStatement(anyString(), eq(Statement.RETURN_GENERATED_KEYS));
        doReturn(receiver()).when(sysUserMapper).selectById(RECEIVER);
        doReturn(0L).when(notifyLogMapper).selectCount(any());
        stubInsertReturningKey(TASK_ID);
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    /** 让 jdbcTemplate.update(psc, keyHolder) 真的执行 PSC 并回填自增主键（否则 getKey() 恒为 null） */
    private void stubInsertReturningKey(long generatedId) {
        doAnswer(invocation -> {
            PreparedStatementCreator creator = invocation.getArgument(0);
            creator.createPreparedStatement(connection);
            KeyHolder keyHolder = invocation.getArgument(1);
            Map<String, Object> keys = new HashMap<>();
            keys.put("GENERATED_KEY", generatedId);
            keyHolder.getKeyList().add(keys);
            return 1;
        }).when(jdbcTemplate).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }

    private static SysUser receiver() {
        SysUser user = new SysUser();
        user.setId(RECEIVER);
        user.setName("張三");
        user.setMobile("13800000000");
        return user;
    }

    private boolean notifyDeduped() {
        return notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION,
                RECEIVER, null, TITLE, TEXT);
    }

    private void commitTransaction() {
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
    }

    /* ==================== B.2 同键只发一次 ==================== */

    @Test
    @DisplayName("首次入队：返回true、写入完整四元组+dedupe_key、状态pending，并触发提交后投递")
    void firstEnqueueWritesFullQuadrupleAndDispatches() throws Exception {
        assertTrue(notifyDeduped(), "首次必须新入队");

        verify(preparedStatement).setString(IDX_EVENT_CODE, EVENT);
        verify(preparedStatement).setString(IDX_SCENARIO, RdmConstants.NOTIFY_SCENARIO);
        verify(preparedStatement).setString(IDX_TITLE, TITLE);
        verify(preparedStatement).setString(IDX_CONTENT, TEXT);
        verify(preparedStatement).setString(IDX_STATUS, RdmConstants.NOTIFY_STATUS_PENDING);
        verify(preparedStatement).setString(IDX_OBJECT_TYPE, OBJECT_TYPE);
        verify(preparedStatement).setObject(IDX_OBJECT_ID, OBJECT_ID);
        verify(preparedStatement).setString(IDX_EVENT_VERSION, EVENT_VERSION);
        verify(preparedStatement).setObject(IDX_RECEIVER, RECEIVER);
        verify(preparedStatement).setString(IDX_DEDUPE_KEY,
                RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER));
        verify(dispatcher).dispatch(TASK_ID);
    }

    @Test
    @DisplayName("关联需求ID为null时按占位符写入（项目级通知没有单一需求，不得伪造reqId）")
    void reqIdIsNullForProjectLevelNotify() throws Exception {
        notifyDeduped();
        verify(preparedStatement).setObject(IDX_REQ_ID, null);
    }

    @Test
    @DisplayName("同键已出站过→返回false，不再INSERT、不再dispatch（同一事件同一提醒日只发一次）")
    void sameKeyIsEnqueuedOnlyOnce() throws Exception {
        doReturn(1L).when(notifyLogMapper).selectCount(any());

        assertFalse(notifyDeduped());

        verify(jdbcTemplate, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verifyNoInteractions(dispatcher);
    }

    @Test
    @DisplayName("并发命中唯一索引：静默让位返回false，不重试、不降级直发")
    void duplicateKeyYieldsToOtherWriter() throws Exception {
        doThrow(new DuplicateKeyException("uk_rdm_notify_dedupe")).when(jdbcTemplate)
                .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        assertFalse(notifyDeduped());

        verify(jdbcTemplate, times(1)).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verifyNoInteractions(dispatcher);
        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
    }

    @Test
    @DisplayName("不同接收人各自一行、各自去重（ck_rdm_notify_dedupe要求receiver_user_id>0）")
    void eachReceiverGetsOwnRow() throws Exception {
        SysUser other = new SysUser();
        other.setId(42L);
        other.setName("李四");
        other.setMobile("13900000000");
        doReturn(other).when(sysUserMapper).selectById(42L);

        assertTrue(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER, null, TITLE, TEXT));
        assertTrue(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, 42L, null, TITLE, TEXT));

        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        verify(preparedStatement, times(2)).setString(eq(IDX_DEDUPE_KEY), keys.capture());
        assertEquals(2, keys.getAllValues().size());
        assertNotEquals(keys.getAllValues().get(0), keys.getAllValues().get(1), "两个接收人必须是两个不同的键");
        // 第二行的 @手机号必须是第二个接收人的（每接收人一行，不是把两个人塞进同一条群播）
        ArgumentCaptor<String> mobiles = ArgumentCaptor.forClass(String.class);
        verify(preparedStatement, times(2)).setString(eq(IDX_AT_MOBILES), mobiles.capture());
        assertEquals(List.of("13800000000", "13900000000"), mobiles.getAllValues());
    }

    /* ==================== B.2 fail-closed ==================== */

    @Test
    @DisplayName("四元组不完整（无接收人）→拒绝出站，绝不降级成不去重的群发")
    void incompleteQuadrupleIsRejected() throws Exception {
        assertFalse(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, null, null, TITLE, TEXT));
        assertFalse(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, 0L, null, TITLE, TEXT));
        assertFalse(notifyService.notifyDeduped(EVENT, null, OBJECT_ID, EVENT_VERSION, RECEIVER, null, TITLE, TEXT));
        assertFalse(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, null, RECEIVER, null, TITLE, TEXT));

        verify(jdbcTemplate, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verifyNoInteractions(dispatcher);
    }

    @Test
    @DisplayName("正文为空→不入队不发送（空消息发出去只是噪音，也不该占一个去重键）")
    void blankTextIsNotEnqueued() throws Exception {
        assertFalse(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER, null, TITLE, "  "));
        assertFalse(notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER, null, TITLE, null));

        verify(jdbcTemplate, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verifyNoInteractions(dispatcher);
    }

    @Test
    @DisplayName("标题超200字符按列宽截断（title列VARCHAR(200)，超长会让整行INSERT失败→通知全丢）")
    void titleIsTruncatedToColumnWidth() throws Exception {
        String longTitle = "催".repeat(260);

        notifyService.notifyDeduped(EVENT, OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER, null, longTitle, TEXT);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        verify(preparedStatement).setString(eq(IDX_TITLE), title.capture());
        assertEquals(200, title.getValue().length());
    }

    /* ==================== B.3 fallback 不得绕过 dry-run / 不得提交前发送 ==================== */

    @Test
    @DisplayName("B.3核心：去重登记失败→绝不sendOnce直发，改为提交后重试登记并走正常投递")
    void dedupeInsertFailureNeverFallsBackToSendOnce() throws Exception {
        doThrow(new RuntimeException("Unknown column 'dedupe_key'"))
                .doAnswer(invocation -> {
                    PreparedStatementCreator creator = invocation.getArgument(0);
                    creator.createPreparedStatement(connection);
                    KeyHolder keyHolder = invocation.getArgument(1);
                    Map<String, Object> keys = new HashMap<>();
                    keys.put("GENERATED_KEY", TASK_ID);
                    keyHolder.getKeyList().add(keys);
                    return 1;
                })
                .when(jdbcTemplate).update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        assertFalse(notifyDeduped(), "本轮登记失败，不得声称已入队");

        // 直发一次都不允许：这正是旧实现的缺陷（提交前发送 + 绕过 dry-run）
        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
        // 无活动事务时立即重试登记，成功后进入正常投递队列（因此天然尊重 dry-run）
        verify(jdbcTemplate, times(2)).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verify(dispatcher).dispatch(TASK_ID);
    }

    @Test
    @DisplayName("重试登记仍失败→只记日志留人工补发线索，绝不降级直发、绝不dispatch")
    void persistentInsertFailureNeverSendsDirectly() throws Exception {
        doThrow(new RuntimeException("table missing")).when(jdbcTemplate)
                .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        assertFalse(notifyDeduped());

        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
        verifyNoInteractions(dispatcher);
    }

    @Test
    @DisplayName("B.3核心：群播路径登记失败同样不直发（旧实现在这里调sendOnce绕过dry-run）")
    void legacyInsertFailureNeverFallsBackToSendOnce() throws Exception {
        doThrow(new RuntimeException("Unknown column 'scenario'"))
                .doAnswer(invocation -> {
                    PreparedStatementCreator creator = invocation.getArgument(0);
                    creator.createPreparedStatement(connection);
                    KeyHolder keyHolder = invocation.getArgument(1);
                    Map<String, Object> keys = new HashMap<>();
                    keys.put("GENERATED_KEY", TASK_ID);
                    keyHolder.getKeyList().add(keys);
                    return 1;
                })
                .when(jdbcTemplate).update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        notifyService.notifyUsers(EVENT, null, List.of(receiver()), TITLE, TEXT);

        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
        verify(dispatcher, atLeastOnce()).dispatch(TASK_ID);
    }

    @Test
    @DisplayName("通知服务不直连渠道：全程零DingTalkService交互（不存在绕过dry-run的旁路）")
    void notifyServiceNeverTouchesChannelDirectly() {
        notifyDeduped();
        notifyService.notifyUsers(EVENT, null, List.of(receiver()), TITLE, TEXT);

        // 出站只有一个入口：dispatcher.dispatch（提交后投递）；兜底直发 sendOnce 从未被调用
        verify(dispatcher, times(2)).dispatch(TASK_ID);
        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
    }

    /* ==================== 提交后才投递 ==================== */

    @Test
    @DisplayName("事务内：只登记不投递，afterCommit后才dispatch（回滚的通知不该发出去）")
    void dispatchHappensOnlyAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertTrue(notifyDeduped());
            verifyNoInteractions(dispatcher);
            assertTrue(TransactionSynchronizationManager.isSynchronizationActive());

            commitTransaction();
            verify(dispatcher).dispatch(TASK_ID);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("事务回滚：afterCommit不触发→不投递（通知与业务同生共死）")
    void rollbackMeansNoDispatch() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            notifyDeduped();
            // 模拟回滚：只走 afterCompletion(ROLLED_BACK)，不调 afterCommit
            for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            }
            verifyNoInteractions(dispatcher);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("无活动事务（定时作业）：立即dispatch，但仍经由dispatcher（dry-run/抢占/退避一个不少）")
    void withoutTransactionDispatchIsImmediateButStillViaDispatcher() {
        assertFalse(TransactionSynchronizationManager.isSynchronizationActive());

        assertTrue(notifyDeduped());

        verify(dispatcher).dispatch(TASK_ID);
        verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
    }

    @Test
    @DisplayName("事务内登记失败：重试登记也延到afterCommit（绝不在提交前发送）")
    void reinsertIsAlsoDeferredToAfterCommit() throws Exception {
        doThrow(new RuntimeException("deadlock"))
                .doAnswer(invocation -> {
                    KeyHolder keyHolder = invocation.getArgument(1);
                    Map<String, Object> keys = new HashMap<>();
                    keys.put("GENERATED_KEY", TASK_ID);
                    keyHolder.getKeyList().add(keys);
                    return 1;
                })
                .when(jdbcTemplate).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertFalse(notifyDeduped());
            verifyNoInteractions(dispatcher);
            verify(jdbcTemplate, times(1)).update(any(PreparedStatementCreator.class), any(KeyHolder.class));

            commitTransaction();

            verify(jdbcTemplate, times(2)).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
            verify(dispatcher).dispatch(TASK_ID);
            verify(dispatcher, never()).sendOnce(any(), any(), any(), any(), anyList());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    /* ==================== 既有群播语义不回归 ==================== */

    @Test
    @DisplayName("群播行不写dedupe_key（保持NULL不参与唯一索引，既有行为不变）")
    void broadcastRowHasNoDedupeKey() throws Exception {
        notifyService.notifyUsers(EVENT, null, List.of(receiver()), TITLE, TEXT);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(connection).prepareStatement(sql.capture(), eq(Statement.RETURN_GENERATED_KEYS));
        assertFalse(sql.getValue().contains("dedupe_key"), "群播路径不得被卷进去重，实际=" + sql.getValue());
        assertTrue(sql.getValue().contains("INSERT INTO rdm_notify_log"));
        verify(dispatcher).dispatch(TASK_ID);
    }

    @Test
    @DisplayName("群播正文为空：登记为skipped且不投递（不占队列也不发消息）")
    void broadcastWithBlankTextIsSkipped() throws Exception {
        notifyService.notifyUsers(EVENT, null, List.of(receiver()), TITLE, "  ");

        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        // 群播 INSERT 多插了 msg_type/btn_title/btn_url 三列（卡片化），send_status 后移为第 11 位
        verify(preparedStatement).setString(eq(11), status.capture());
        assertEquals("skipped", status.getValue());
        verifyNoInteractions(dispatcher);
    }

    @Test
    @DisplayName("站内相对链接补成公网绝对地址（钉钉客户端不认相对路径）")
    void absolutizeRelativeLinkUsesPortalBase() {
        org.mockito.Mockito.when(jdbcTemplate.queryForList(
                        org.mockito.ArgumentMatchers.contains("sys_notification_scenario"),
                        eq(String.class), any(Object[].class)))
                .thenReturn(List.of("https://portal.example/-mftb-admin-portal/"));

        String out = notifyService.absolutizeLinks("[點擊處理](/rdm-delivery-item?id=5&mode=view)");

        assertEquals("[點擊處理](https://portal.example/-mftb-admin-portal/#/rdm-delivery-item?id=5&mode=view)", out);
    }

    @Test
    @DisplayName("已是绝对地址的链接不重复拼接；取不到门户基址时保留原文")
    void absolutizeKeepsAbsoluteAndFallsBackWhenBaseMissing() {
        String absolute = "[查看](https://portal.example/a#/rdm-detail?id=1)";
        assertEquals(absolute, notifyService.absolutizeLinks(absolute));

        org.mockito.Mockito.when(jdbcTemplate.queryForList(
                        anyString(), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());
        org.mockito.Mockito.when(jdbcTemplate.queryForList(anyString(), eq(String.class)))
                .thenReturn(List.of());
        String relative = "[點擊處理](/rdm-issue?id=9)";
        assertEquals(relative, notifyService.absolutizeLinks(relative));
    }

    @Test
    @DisplayName("去重行与群播行同表同列族：send_status/attempts/next_retry_at语义一致（重试与抢占可共用）")
    void dedupeRowSharesOutboxSemantics() throws Exception {
        notifyDeduped();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(connection).prepareStatement(sql.capture(), eq(Statement.RETURN_GENERATED_KEYS));
        String value = sql.getValue();
        assertTrue(value.contains("send_status"), value);
        assertTrue(value.contains("attempts"), "attempts 必须初始化为 0，否则退避计算错位");
        assertTrue(value.contains("next_retry_at"), value);
        assertTrue(value.contains("'DINGTALK'"), value);
    }
}
