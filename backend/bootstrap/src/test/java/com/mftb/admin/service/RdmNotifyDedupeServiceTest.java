package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmNotifyLog;
import com.mftb.admin.mapper.RdmNotifyLogMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 任务22 B.2 —— 通知<b>事件级唯一去重</b>键测试。
 *
 * <p>锁死四条结论：
 * <ol>
 *   <li><b>键构成</b>：{@code dedupe_key = SHA-256(object_type|object_id|event_version|receiver_user_id)}，
 *       四元组任一要素变动都会产出不同的键（因此「问题5」与「交付项5」不会互相抑制）；</li>
 *   <li><b>规范化稳定</b>：object_type 大小写与首尾空白不影响键（否则同一事件两种写法会各发一次）；</li>
 *   <li><b>列宽与 CHECK 约束对齐</b>：键恒为 64 位十六进制（{@code ck_rdm_notify_dedupe} 要求
 *       {@code CHAR_LENGTH(dedupe_key) = 64}）；四元组不完整时返回 {@code null}，
 *       绝不签发出会被 CHECK 约束拒绝或让「不知道发给谁」变成「发给所有人只发一次」的键；</li>
 *   <li><b>fail-closed 查询</b>：键为空白时 {@code alreadyEnqueued} 返回 {@code true}（视为已发过），
 *       拿不到键就不发，且此时不查库。</li>
 * </ol>
 *
 * <p><b>纯 Mockito 离线单测，不连库、不跑迁移。</b>
 * 注意：mock 只证明「键的构成与判定逻辑」正确，<b>不等价于真实数据库下的并发证明</b>——
 * 多实例同时插同键的竞态由 238 冻结 DDL 的唯一索引 {@code uk_rdm_notify_dedupe} 兜底，
 * 其真实并发验证归属任务24。
 */
class RdmNotifyDedupeServiceTest {

    private static final String OBJECT_TYPE = "project_todo:delivery_item";
    private static final long OBJECT_ID = 5L;
    private static final String EVENT_VERSION = "VERSION:3";
    private static final long RECEIVER = 41L;

    private RdmNotifyLogMapper notifyLogMapper;
    private RdmNotifyDedupeService dedupeService;

    /**
     * LambdaQueryWrapper 解析「方法引用 → 列名」依赖 MyBatis-Plus 的 TableInfo 缓存，
     * 没有 Spring 容器时该缓存是空的，{@code getSqlSegment()} 会抛
     * 「can not find lambda cache for this entity」。按仓库既有做法手动初始化。
     */
    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), RdmNotifyLog.class);
    }

    @BeforeEach
    void setUp() {
        notifyLogMapper = mock(RdmNotifyLogMapper.class);
        dedupeService = new RdmNotifyDedupeService(notifyLogMapper);
    }

    /* ==================== 键构成 ==================== */

    @Test
    @DisplayName("去重键=四元组规范化SHA-256，固定64位小写十六进制（对齐ck_rdm_notify_dedupe列宽）")
    void dedupeKeyIsSha256OfQuadruple() {
        String key = RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER);

        assertNotNull(key);
        assertEquals(RdmNotifyDedupeService.DEDUPE_KEY_LENGTH, key.length(),
                "CHAR(64) 列宽与 CHECK 约束都要求恰好 64 位");
        assertTrue(key.matches("[0-9a-f]{64}"), "必须是小写十六进制，否则 ascii_bin 排序下大小写不一致会撞不上唯一索引");
        // 与任务28 的规范化摘要实现同源（项目里不得出现第二套 SHA-256 写法）
        assertEquals(RdmIdempotentService.sha256Hex(OBJECT_TYPE + "|" + OBJECT_ID + "|" + EVENT_VERSION + "|" + RECEIVER),
                key);
    }

    @Test
    @DisplayName("四元组任一要素变动→键不同（对象类型/对象ID/事件版本/接收人各自参与去重）")
    void dedupeKeyChangesWithEveryElement() {
        String base = RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER);

        assertNotEquals(base, RdmNotifyDedupeService.dedupeKey("project_todo:issue", OBJECT_ID, EVENT_VERSION, RECEIVER),
                "同为 id=5，问题与交付项必须产出不同键，否则互相永久抑制");
        assertNotEquals(base, RdmNotifyDedupeService.dedupeKey("project_urge:delivery_item", OBJECT_ID, EVENT_VERSION, RECEIVER),
                "待办通知与催办是两种事件语义，必须互不抑制");
        assertNotEquals(base, RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID + 1, EVENT_VERSION, RECEIVER));
        assertNotEquals(base, RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, "VERSION:4", RECEIVER),
                "对象版本推进后应能再通知一次");
        assertNotEquals(base, RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER + 1),
                "不同接收人各自一行、各自去重");
    }

    @Test
    @DisplayName("规范化：object_type大小写与首尾空白、event_version首尾空白不影响键")
    void dedupeKeyIsNormalized() {
        String base = RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER);

        assertEquals(base, RdmNotifyDedupeService.dedupeKey("  PROJECT_TODO:DELIVERY_ITEM  ", OBJECT_ID, EVENT_VERSION, RECEIVER));
        assertEquals(base, RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, "  " + EVENT_VERSION + " ", RECEIVER));
    }

    /* ==================== fail-closed：不完整四元组 ==================== */

    @Test
    @DisplayName("四元组不完整一律返回null（不签发出会被CHECK约束拒绝的键）")
    void dedupeKeyIsNullWhenIncomplete() {
        assertNull(RdmNotifyDedupeService.dedupeKey(null, OBJECT_ID, EVENT_VERSION, RECEIVER));
        assertNull(RdmNotifyDedupeService.dedupeKey("  ", OBJECT_ID, EVENT_VERSION, RECEIVER), "空白对象类型不合法");
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, null, EVENT_VERSION, RECEIVER));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, 0L, EVENT_VERSION, RECEIVER), "object_id 必须 > 0");
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, -1L, EVENT_VERSION, RECEIVER));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, null, RECEIVER));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, "", RECEIVER));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, null));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, 0L),
                "receiver_user_id 必须 > 0，否则违反 ck_rdm_notify_dedupe");
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, -7L));
    }

    @Test
    @DisplayName("isComplete与dedupeKey口径一致（同一套判定，不出现两处各写一版）")
    void isCompleteMatchesDedupeKey() {
        assertTrue(RdmNotifyDedupeService.isComplete(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER));
        assertNotNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER));

        assertFalse(RdmNotifyDedupeService.isComplete(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, 0L));
        assertNull(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, 0L));
    }

    @Test
    @DisplayName("keyOf：合法四元组给出可用键，非法四元组给出null（供调用方直接fail-closed）")
    void keyOfReturnsUsableKeyOrNull() {
        String key = dedupeService.keyOf(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER);
        assertNotNull(key);
        assertEquals(RdmNotifyDedupeService.DEDUPE_KEY_LENGTH, key.length());

        assertNull(dedupeService.keyOf(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, null), "接收人为空时拒绝出站");
    }

    /* ==================== event_version 两种语义 ==================== */

    @Test
    @DisplayName("VERSION语义：VERSION:<并发版本>，版本缺失退化VERSION:0（宁可少发不重复发）")
    void versionEventVersionSemantics() {
        assertEquals("VERSION:3", RdmNotifyDedupeService.versionEventVersion(3));
        assertEquals("VERSION:0", RdmNotifyDedupeService.versionEventVersion(null));
        assertEquals(RdmNotifyDedupeService.FALLBACK_VERSION, 0);
        assertTrue(RdmNotifyDedupeService.versionEventVersion(7)
                .startsWith(RdmConstants.NOTIFY_EVENT_VERSION_PREFIX), "前缀必须取自 RdmConstants");
    }

    @Test
    @DisplayName("DATE语义：DATE:<yyyy-MM-dd>提醒日，同日同键、次日可再催")
    void dateEventVersionSemantics() {
        LocalDate day = LocalDate.of(2026, 3, 4);
        String eventVersion = RdmNotifyDedupeService.dateEventVersion(day);

        assertEquals("DATE:2026-03-04", eventVersion);
        assertTrue(eventVersion.startsWith(RdmConstants.NOTIFY_EVENT_DATE_PREFIX));
        // 同一提醒日：键相同 → 同一天只催一次
        assertEquals(RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID, eventVersion, RECEIVER),
                RdmNotifyDedupeService.dedupeKey(OBJECT_TYPE, OBJECT_ID,
                        RdmNotifyDedupeService.dateEventVersion(day), RECEIVER));
        // 次日：键不同 → 第二天可以再催（催过一次就永远安静同样是缺陷）
        assertNotEquals(eventVersion, RdmNotifyDedupeService.dateEventVersion(day.plusDays(1)));
        assertNotNull(RdmNotifyDedupeService.dateEventVersion(null), "提醒日为空时取今天，仍必须是合法键");
    }

    /* ==================== alreadyEnqueued ==================== */

    @Test
    @DisplayName("已存在同键行→true（同键只发一次）；不存在→false（本次可入队）")
    void alreadyEnqueuedReflectsExistingRow() {
        doReturn(1L).when(notifyLogMapper).selectCount(any());
        assertTrue(dedupeService.alreadyEnqueued("a".repeat(64)));

        doReturn(0L).when(notifyLogMapper).selectCount(any());
        assertFalse(dedupeService.alreadyEnqueued("a".repeat(64)));
    }

    @Test
    @DisplayName("计数为null（驱动返回null）按未入队处理，不因此静默丢通知")
    void alreadyEnqueuedTreatsNullCountAsNotEnqueued() {
        doReturn(null).when(notifyLogMapper).selectCount(any());
        assertFalse(dedupeService.alreadyEnqueued("a".repeat(64)));
    }

    @Test
    @DisplayName("fail-closed：键为空白时视为已出站且不查库（拿不到键就不发）")
    void alreadyEnqueuedIsFailClosedOnBlankKey() {
        assertTrue(dedupeService.alreadyEnqueued((String) null));
        assertTrue(dedupeService.alreadyEnqueued("   "));
        verify(notifyLogMapper, never()).selectCount(any());
    }

    @Test
    @DisplayName("四元组重载：先算键再查；四元组不完整时同样fail-closed为true且不查库")
    void alreadyEnqueuedByQuadrupleIsFailClosed() {
        doReturn(0L).when(notifyLogMapper).selectCount(any());
        assertFalse(dedupeService.alreadyEnqueued(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER));

        assertTrue(dedupeService.alreadyEnqueued(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, null));
        // 上面那次合法查询 + 无其它查询：不完整四元组不得触发查库
        verify(notifyLogMapper).selectCount(any());
    }

    @Test
    @DisplayName("去重查询按dedupe_key等值匹配RdmNotifyLog（与唯一索引同列，不另立第二套口径）")
    void alreadyEnqueuedQueriesByDedupeKeyColumn() {
        doReturn(0L).when(notifyLogMapper).selectCount(any());
        String key = dedupeService.keyOf(OBJECT_TYPE, OBJECT_ID, EVENT_VERSION, RECEIVER);
        dedupeService.alreadyEnqueued(key);

        org.mockito.ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.Wrapper<RdmNotifyLog>> captor =
                org.mockito.ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.Wrapper.class);
        verify(notifyLogMapper).selectCount(captor.capture());
        String sqlSegment = captor.getValue().getSqlSegment();
        assertTrue(sqlSegment.contains("dedupe_key"), "必须走 dedupe_key 列（唯一索引所在列），实际=" + sqlSegment);
    }
}
