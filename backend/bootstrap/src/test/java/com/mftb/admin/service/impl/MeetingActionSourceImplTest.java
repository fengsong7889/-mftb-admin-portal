/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesItemOwnerMapper;
import com.mftb.admin.service.MeetingActionSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会议行动项归属口径测试：首负责人缓存列 + 全量负责人表两条线的并集去重。
 *
 * <p>这条并集是「协办人能不能在自己的待办里看到事」的唯一保证；
 * 只查 owner_user_id 缓存列的用例必须在这里被拒掉，否则 cpm 的关联导入会静默漏项。
 */
class MeetingActionSourceImplTest {

    private MeetingMinutesItemMapper itemMapper;
    private MeetingMinutesItemOwnerMapper ownerMapper;
    private MeetingBookingMapper bookingMapper;
    private MeetingActionSourceImpl source;

    private static MeetingMinutesItem action(long id, long bookingId, String content, Long ownerUserId) {
        MeetingMinutesItem item = new MeetingMinutesItem();
        item.setId(id);
        item.setBookingId(bookingId);
        item.setKind(MeetingMinutesItem.KIND_ACTION);
        item.setStatus(MeetingMinutesItem.STATUS_PENDING);
        item.setDeleted(0);
        item.setContent(content);
        item.setOwnerUserId(ownerUserId);
        item.setDueDate(LocalDate.of(2026, 11, 25));
        return item;
    }

    private static MeetingMinutesItemOwner ownerRow(long itemId, long userId) {
        MeetingMinutesItemOwner row = new MeetingMinutesItemOwner();
        row.setItemId(itemId);
        row.setUserId(userId);
        return row;
    }

    private static MeetingBooking booking(long id, String title) {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(id);
        booking.setTitle(title);
        return booking;
    }

    @BeforeEach
    void setUp() {
        for (Class<?> entity : new Class<?>[]{MeetingMinutesItem.class, MeetingMinutesItemOwner.class, MeetingBooking.class}) {
            if (com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(entity) == null) {
                com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                        new org.apache.ibatis.builder.MapperBuilderAssistant(
                                new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                        entity);
            }
        }
        itemMapper = mock(MeetingMinutesItemMapper.class);
        ownerMapper = mock(MeetingMinutesItemOwnerMapper.class);
        bookingMapper = mock(MeetingBookingMapper.class);
        source = new MeetingActionSourceImpl(itemMapper, ownerMapper, bookingMapper);
    }

    @Test
    @DisplayName("首负责人与协办两条线并集去重，同一事项只出一行")
    void unionsOwnerAndCoOwnerWithoutDuplicates() {
        when(itemMapper.selectList(any()))
                .thenReturn(List.of(action(10L, 5L, "補寫結算文檔", 2L)))
                .thenReturn(List.of(action(10L, 5L, "補寫結算文檔", 2L), action(11L, 6L, "對齊灰度名額", 3L)));
        when(ownerMapper.selectList(any())).thenReturn(List.of(ownerRow(10L, 2L), ownerRow(11L, 2L)));
        when(bookingMapper.selectBatchIds(any())).thenReturn(List.of(
                booking(5L, "11 月結算評審會"), booking(6L, null)));

        List<MeetingActionSource.ActionItemRef> rows = source.findOpenActionsOf(2L, 30);

        assertEquals(2, rows.size(), "事项 10 被两条线命中，也只能有一行");
        assertEquals(11L, rows.get(0).itemId(), "按 id 倒序：新事项在前");
        assertEquals(10L, rows.get(1).itemId());
        assertEquals("11 月結算評審會", rows.get(1).meetingTitle());
        // 会议标题缺失时回退预订单号（这里 bookingNo 也为 null，只可能是 null，不得凭空造名）
        assertTrue(rows.get(0).meetingTitle() == null);
    }

    @Test
    @DisplayName("没有命中任何行动项时不查会议表")
    void emptyResultSkipsBookingQuery() {
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(ownerMapper.selectList(any())).thenReturn(List.of());

        assertTrue(source.findOpenActionsOf(2L, 30).isEmpty());
        verify(bookingMapper, never()).selectBatchIds(any());
    }

    @Test
    @DisplayName("空内容事项不进清单（标题会落成空白条目，比缺失更糟）")
    void blankContentIsFiltered() {
        when(itemMapper.selectList(any())).thenReturn(List.of(action(10L, 5L, "   ", 2L)));
        when(ownerMapper.selectList(any())).thenReturn(List.of());
        when(bookingMapper.selectBatchIds(any())).thenReturn(List.of(booking(5L, "會議")));

        assertTrue(source.findOpenActionsOf(2L, 30).isEmpty());
    }
}