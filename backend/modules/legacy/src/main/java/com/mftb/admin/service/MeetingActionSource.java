/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import java.time.LocalDate;
import java.util.List;

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
}