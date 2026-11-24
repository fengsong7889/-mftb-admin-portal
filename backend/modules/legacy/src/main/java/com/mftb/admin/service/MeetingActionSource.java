/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 会议（meeting）域对外的「本人行动项」只读端口。
 *
 * <p>为什么要有这个端口：持續績效（cpm）的关联导入需要列出本人负责/协办的未完成行动项。
 * 直接注入 {@code MeetingMinutesItemMapper} 会让 cpm 绑上 meeting 的表结构与去重口径
 * （首负责人缓存列 vs item_owner 全量负责人表），meeting 一改列，cpm 就静默漏数据——
 * 与 legacy↔RDM 走 contracts 端口是同一条理由，只是两个域同在一个 jar，端口就近声明在会议域。
 *
 * <p>返回扁平记录而不是 meeting 实体：调用方只需要「认得出是哪件事、追到谁、什么时候到期」。
 */
public interface MeetingActionSource {

    /**
     * 未完成行动项（kind=ACTION, status=pending），含「协办人」线命中。
     *
     * @param userId 目标员工 sys_user.id（由调用方从登录态取）
     * @param limit  返回上限（实现侧负责夹紧）
     */
    List<ActionItemRef> findOpenActionsOf(long userId, int limit);

    /**
     * @param itemId      biz_meeting_minutes_item.id，作为 cpm 条目的 source_ref
     * @param content     事项内容（作为 cpm 条目标题的默认值）
     * @param statusCode  事项状态原始码（pending），前端用会议域词表翻译
     * @param ownerUserId 首负责人（缓存列），用于区分「我负责」与「我协办」
     * @param meetingTitle 所属会议标题（可空：预订单被删时不编造会议名）
     * @param dueDate     完成时限（可空）
     */
    record ActionItemRef(
        Long itemId,
        String content,
        String statusCode,
        Long ownerUserId,
        String meetingTitle,
        LocalDate dueDate
    ) { }

    /**
     * 本人组织或本人参会的未取消会议（持續績效「導入會議」候选）。
     *
     * @param bookingId   biz_meeting_booking.id，作为 cpm 条目的 source_ref
     * @param bookingNo   会议编号（界面副行素材，词表归会议域）
     * @param title       会议标题（导入后作为子任務标题，用户可改）
     * @param startTime   预定开始：导入后直接带成计划起日。用<b>预定</b>时间而不是
     *                    实际签到时间：计划面要回答的是「我原本为哪段时间留了位子」，
     *                    而 actual_start_at 是事后事实，且未开的会根本没有它
     * @param endTime     预定结束：同上，带成计划止日
     * @param statusCode  booked / checked_in / finished（cancelled 与 released 不返回）
     * @param organizer   是否本人发起：界面区分「我组织 / 我参会」，不拿它做权限判定
     * @param roomName    会议室名（可空：线上会或会议室已被删）
     */
    record MeetingRef(
        Long bookingId,
        String bookingNo,
        String title,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String statusCode,
        boolean organizer,
        String roomName
    ) { }

    /**
     * 会议候选清单：只列未取消的会，含未开始与已结束。
     *
     * <p>为什么已结束也给：一场上周开完的会仍然要补录工时与产出，把它挡在候门外
     * 只会逐退事后补记；而取消的会没有任何可交付事实，列出来只会诱导导入。
     *
     * <p>为什么包含 released（未到场被系统释放）也归到「不可导入」：它实质就是一场
     * 没开的会，与取消同义；不排它就会有一堆「导入了一根本不存在于日程上的会」的记录。
     *
     * @param userId  目标员工 sys_user.id（由调用方从登录态取，前端不传身份）
     * @param keyword 标题/编号模糊匹配，空则不按关键字过滤
     * @param limit   返回上限（实现侧负责夹紧）
     */
    List<MeetingRef> findUncancelledMeetingsOf(long userId, String keyword, int limit);

    /**
     * 批量查会议当前状态，给台账读取时的「导入后会议被取消」对账用。
     *
     * <p>为什么只提供状态而不是直接叫实现方去改 cpm 表：判定「谁相关」属于会议域，
     * 而「自己的条目怎么显示」属于 cpm 域。反过来让会议域写 cpm 表，就会长出
     * 取消/系列取消/释放三条路径各写一份联动代码的坑（而且历史已取消的会永远补不回来）。
     *
     * @return bookingId → status 原始码；不存在的 ID 不返回（已被硬删的会议不参与对账）
     */
    Map<Long, String> findBookingStatuses(Collection<Long> bookingIds);
}