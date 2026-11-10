/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesItemOwnerMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import com.mftb.admin.service.NotificationAppService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 逾期提醒作业的收件人集合。
 *
 * <p>钉住的都是"写错了不会报错、只会静默少发"的部分：多负责人以后只追首负责人，
 * 协办人永远收不到催办；负责人真源行缺失时不回退缓存，旧库上的存量待办会整批漏提；
 * 事项级去重（同一天只提醒一次）不能被"每人一条"改成"每人每天一条又回头重发整批"。
 */
class MeetingFollowUpJobTest {

    private MeetingMinutesItemMapper itemMapper;
    private MeetingMinutesItemOwnerMapper ownerMapper;
    private MeetingMinutesMapper minutesMapper;
    private SysUserMapper userMapper;
    private NotificationAppService appService;
    private DingTalkAppService dingTalkAppService;
    private MeetingNotifyTemplateService templateService;
    private MeetingFollowUpJob job;

    private static SysUser user(long id, String name, String dingtalkId) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setEmpId("MF0000" + id);
        user.setDingtalkUserId(dingtalkId);
        user.setStatus(1);
        return user;
    }

    private static MeetingMinutesItemOwner owner(long itemId, long userId, String name, String empNo, int seq) {
        MeetingMinutesItemOwner row = new MeetingMinutesItemOwner();
        row.setItemId(itemId);
        row.setUserId(userId);
        row.setUserName(name);
        row.setEmpNo(empNo);
        row.setSeq(seq);
        return row;
    }

    private static MeetingMinutesItem dueItem(long ownerUserId) {
        MeetingMinutesItem item = new MeetingMinutesItem();
        item.setId(41L);
        item.setMinutesId(5L);
        item.setKind(MeetingMinutesItem.KIND_ACTION);
        item.setContent("輸出預算明細表");
        item.setStatus(MeetingMinutesItem.STATUS_PENDING);
        item.setDueDate(LocalDate.now().minusDays(2));
        item.setOwnerUserId(ownerUserId);
        item.setOwnerName("張三");
        item.setOwnerEmpNo("MF00007");
        return item;
    }

    @BeforeEach
    void setUp() {
        itemMapper = mock(MeetingMinutesItemMapper.class);
        ownerMapper = mock(MeetingMinutesItemOwnerMapper.class);
        minutesMapper = mock(MeetingMinutesMapper.class);
        userMapper = mock(SysUserMapper.class);
        appService = mock(NotificationAppService.class);
        dingTalkAppService = mock(DingTalkAppService.class);
        templateService = mock(MeetingNotifyTemplateService.class);
        job = new MeetingFollowUpJob(itemMapper, ownerMapper, minutesMapper, userMapper,
                appService, dingTalkAppService, templateService);
        ReflectionTestUtils.setField(job, "jobEnabled", true);

        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setId(5L);
        minutes.setBookingId(100L);
        minutes.setMeetingTitle("Q4 預算復核");
        minutes.setMeetingTimeText("2026-10-19 10:00–11:00");
        when(minutesMapper.selectById(5L)).thenReturn(minutes);
        when(itemMapper.markNotified(anyLong(), any())).thenReturn(1);
        when(templateService.enabled(anyString(), anyString())).thenReturn(true);
        when(appService.resolve(anyString())).thenReturn(new NotificationAppService.Credentials(
                1L, "app-key", "app-secret", "agent-id", "https://admin.test", true));
        when(dingTalkAppService.sendWorkNotification(any(), anyLong(), anyList(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(true));
    }

    @Test
    @DisplayName("逾期提醒发给全部负责人：一条事项两个人就投两条工作通知")
    void notifiesEveryOwnerOfTheItem() {
        when(itemMapper.findDueReminders(any(LocalDate.class), anyInt()))
                .thenReturn(List.of(dueItem(7L)));
        when(ownerMapper.findByItem(41L)).thenReturn(List.of(
                owner(41L, 7L, "張三", "MF00007", 1), owner(41L, 8L, "王二", "MF00008", 2)));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(
                user(7L, "張三", "ding-7"), user(8L, "王二", "ding-8")));

        job.scan();

        @SuppressWarnings("unchecked") ArgumentCaptor<List<String>> recipients = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> bodies = ArgumentCaptor.forClass(String.class);
        verify(dingTalkAppService, times(2)).sendWorkNotification(any(), anyLong(),
                recipients.capture(), anyString(), bodies.capture());
        assertEquals(List.of("ding-7"), recipients.getAllValues().get(0), "主办先收到");
        assertEquals(List.of("ding-8"), recipients.getAllValues().get(1), "协办也必须收到");
        assertTrue(bodies.getAllValues().get(1).contains("王二"), "正文要列出全量负责人，不能只报首负责人");
        // 去重仍然是事项级：一轮只抢占一次，两个人共用同一条"今天已提醒"事实
        verify(itemMapper, times(1)).markNotified(eq(41L), any());
    }

    @Test
    @DisplayName("负责人真源行缺失时回退首负责人缓存：旧库上的存量待办不能整批静默漏提")
    void fallsBackToFirstOwnerCacheWhenOwnerRowsAreMissing() {
        when(itemMapper.findDueReminders(any(LocalDate.class), anyInt())).thenReturn(List.of(dueItem(7L)));
        when(ownerMapper.findByItem(41L)).thenReturn(List.of());
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user(7L, "張三", "ding-7")));

        job.scan();

        verify(dingTalkAppService).sendWorkNotification(any(), anyLong(), eq(List.of("ding-7")), anyString(), anyString());
    }

    @Test
    @DisplayName("负责人全部未绑钉钉时只标记不发送：配置问题不该让作业每小时空扫同一批行")
    void marksNotifiedEvenWhenNoOwnerIsReachable() {
        when(itemMapper.findDueReminders(any(LocalDate.class), anyInt())).thenReturn(List.of(dueItem(7L)));
        when(ownerMapper.findByItem(41L)).thenReturn(List.of(owner(41L, 7L, "張三", "MF00007", 1)));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user(7L, "張三", null)));

        job.scan();

        verify(dingTalkAppService, never()).sendWorkNotification(any(), anyLong(), anyList(), anyString(), anyString());
        verify(itemMapper).markNotified(eq(41L), any());
    }
}
