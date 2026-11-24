/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesItemOwnerMapper;
import com.mftb.admin.service.MeetingActionSource;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@link MeetingActionSource} 的会议域实现：行动项归属判定只在这里维护。
 *
 * <p>两条线都要查：{@code owner_user_id} 只是首负责人缓存，全量负责人在
 * {@code biz_meeting_minutes_item_owner}。只查缓存列，协办人在自己的待办里就看不到
 * 明明追办到自己头上的事——纪要的钉钉追办通知正是按 owner 表发的，两边口径必须一致。
 */
@Service
@RequiredArgsConstructor
public class MeetingActionSourceImpl implements MeetingActionSource {

    private final MeetingMinutesItemMapper itemMapper;
    private final MeetingMinutesItemOwnerMapper ownerMapper;
    private final MeetingBookingMapper bookingMapper;

    @Override
    public List<ActionItemRef> findOpenActionsOf(long userId, int limit) {
        Map<Long, MeetingMinutesItem> found = new LinkedHashMap<>();
        itemMapper.selectList(new LambdaQueryWrapper<MeetingMinutesItem>()
                        .eq(MeetingMinutesItem::getKind, MeetingMinutesItem.KIND_ACTION)
                        .eq(MeetingMinutesItem::getStatus, MeetingMinutesItem.STATUS_PENDING)
                        .eq(MeetingMinutesItem::getDeleted, 0)
                        .eq(MeetingMinutesItem::getOwnerUserId, userId))
                .forEach(item -> found.put(item.getId(), item));

        List<Long> asCoOwner = ownerMapper.selectList(new LambdaQueryWrapper<MeetingMinutesItemOwner>()
                        .eq(MeetingMinutesItemOwner::getUserId, userId))
                .stream().map(MeetingMinutesItemOwner::getItemId).distinct().toList();
        if (!asCoOwner.isEmpty()) {
            itemMapper.selectList(new LambdaQueryWrapper<MeetingMinutesItem>()
                            .in(MeetingMinutesItem::getId, asCoOwner)
                            .eq(MeetingMinutesItem::getKind, MeetingMinutesItem.KIND_ACTION)
                            .eq(MeetingMinutesItem::getStatus, MeetingMinutesItem.STATUS_PENDING)
                            .eq(MeetingMinutesItem::getDeleted, 0))
                    .forEach(item -> found.putIfAbsent(item.getId(), item));
        }
        if (found.isEmpty()) {
            return List.of();
        }
        Map<Long, String> titles = meetingTitles(found.values());
        List<ActionItemRef> out = new ArrayList<>();
        List<MeetingMinutesItem> ordered = new ArrayList<>(found.values());
        ordered.sort((a, b) -> Long.compare(b.getId(), a.getId()));
        for (MeetingMinutesItem item : ordered.subList(0, Math.min(ordered.size(), Math.max(1, Math.min(limit, 50))))) {
            if (!StringUtils.hasText(item.getContent())) {
                continue;
            }
            out.add(new ActionItemRef(item.getId(), item.getContent(), item.getStatus(),
                    item.getOwnerUserId(), titles.get(item.getBookingId()), item.getDueDate()));
        }
        return out;
    }

    /** 会议标题批量取（N 个行动项常常来自两三场会，逐行查就是 N+1） */
    private Map<Long, String> meetingTitles(Iterable<MeetingMinutesItem> items) {
        Set<Long> bookingIds = new HashSet<>();
        items.forEach(item -> {
            if (item.getBookingId() != null) {
                bookingIds.add(item.getBookingId());
            }
        });
        if (bookingIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> titles = new HashMap<>();
        bookingMapper.selectBatchIds(bookingIds).forEach(booking ->
                titles.put(booking.getId(), StringUtils.hasText(booking.getTitle())
                        ? booking.getTitle() : booking.getBookingNo()));
        return titles;
    }

    /* ==================== 導入會議候选与状态对账（持續績效消费） ==================== */

    /**
     * 候选清单：本人参与或发起的未取消会议。
     *
     * <p>身份判定只走 {@code biz_meeting_attendee} JOIN（组织者同样落一行），所以这里不再
     * 补一次 organizer_id OR：两处条件必会在「代订」「转组织者」这类场景上飘开。
     *
     * <p>我组织/我参会直接用 {@code organizer_id} 比对本人心跳：这一行已经
     * SELECT 出来了，为它再查一次参会表只多一次往返，不多一分真相。
     */
    @Override
    public List<MeetingRef> findUncancelledMeetingsOf(long userId, String keyword, int limit) {
        List<MeetingBooking> rows = bookingMapper.findInvolvedExcludingStatuses(
                userId,
                StringUtils.hasText(keyword) ? keyword.trim() : null,
                MeetingConstants.NON_DELIVERABLE_STATUSES,
                Math.max(1, Math.min(limit, 50)));
        List<MeetingRef> out = new ArrayList<>();
        for (MeetingBooking b : rows) {
            if (!StringUtils.hasText(b.getTitle()) || b.getStartTime() == null || b.getEndTime() == null) {
                // 计列起止是导入的全部意义：缺任一时间的脏单不开放导入，
                // 否则用户拿到一条永远落在「待排期」档的子任務还以为是自己的错
                continue;
            }
            out.add(new MeetingRef(b.getId(), b.getBookingNo(), b.getTitle(),
                    b.getStartTime(), b.getEndTime(), b.getStatus(),
                    Long.valueOf(userId).equals(b.getOrganizerId()),
                    StringUtils.hasText(b.getRoomName()) ? b.getRoomName() : null));
        }
        return out;
    }

    /**
     * 状态对账用：一次批量读，不在台账循环里逐条查（一场一人可能有几十条导入记录）。
     *
     * <p>已软删的会议不返回：它已经不是任何人的事实了，把导入条目标成「已取消」
     * 会让人以为会是自己乱删的；宁愿它停在导入那一刻的状态。
     */
    @Override
    public Map<Long, String> findBookingStatuses(Collection<Long> bookingIds) {
        if (bookingIds == null || bookingIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> statuses = new HashMap<>();
        bookingMapper.selectBatchIds(bookingIds).forEach(
                booking -> statuses.put(booking.getId(), booking.getStatus()));
        return statuses;
    }
}