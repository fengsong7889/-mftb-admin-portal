/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.contracts.rdm.RdmWorkItemSource;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.service.MeetingActionSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 关联业务对象候选清单（方案 §五-A / §十）：把「本人相关的 RDM 需求」与「本人负责的会议行动项」
 * 以统一形状交给我的工作記錄的导入挑选器。
 *
 * <p>三条口径：
 * 1) 只读、只列、不写——导入动作仍走 {@code POST /api/cpm/items}，由条目服务的
 *    UNIQUE(user_id,source_type,source_ref) 做重复导入裁判，这里不自建去重逻辑（两处裁判必出一处）；
 * 2) {@code imported} 只是给界面的提示位，真正的防重仍在唯一键：清单与点「導入」之间
 *    可能有另一个会话（或另一个标签页）已经导入过；
 * 3) RDM 侧走 contracts 端口且 fail-closed：端口没有实现（RDM 模块未部署）时返回空清单
 *    并记一次 warn，绝不让 CPM 直接查 rdm_* 表绕过 RDM 的数据范围口径。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmSourceService {

    /** 挑选器一屏够用即可，且 RDM 实现侧还会再夹一次上限 */
    private static final int CANDIDATE_LIMIT = 30;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    /** 会议起止给到界面的精度：分钟足够（导入后落的是计划起止日，时间只供阅读） */
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final ObjectProvider<RdmWorkItemSource> rdmSource;
    private final MeetingActionSource meetingActions;
    private final CpmItemMapper itemMapper;
    private final CpmAccessGuard guard;

    /* ==================== RDM 需求 ==================== */

    public List<CpmDto.SourceVO> listRdmRequirements(String keyword) {
        RdmWorkItemSource source = rdmSource.getIfAvailable();
        if (source == null) {
            log.warn("cpm 关联导入：RDM 工作项端口无实现，返回空清单（fail-closed，不降级为直查 rdm 表）");
            return List.of();
        }
        SysUser current = guard.currentUser();
        List<RdmWorkItemSource.WorkItemRef> refs =
                source.findRelatedOpenRequirements(current.getId(), keyword, CANDIDATE_LIMIT);
        Set<String> imported = importedRefs("rdm_requirement", current.getId(),
                refs.stream().map(ref -> String.valueOf(ref.reqId())).toList());

        List<CpmDto.SourceVO> out = new ArrayList<>();
        for (RdmWorkItemSource.WorkItemRef ref : refs) {
            CpmDto.SourceVO vo = new CpmDto.SourceVO();
            vo.setSourceType("rdm_requirement");
            vo.setSourceRef(String.valueOf(ref.reqId()));
            vo.setTitle(ref.title());
            vo.setStatusCode(ref.status());
            vo.setRole(ref.myRole());
            vo.setProgress(ref.progress());
            vo.setDueDate(ref.planDate() == null ? null : ref.planDate().format(DATE));
            vo.setTerminated(ref.terminated());
            // 卡片副标题只给编号：状态与角色交给前端词表翻译，服务端不拼死文案
            vo.setSubtitle(StringUtils.hasText(ref.reqNo()) ? ref.reqNo() : null);
            vo.setImported(imported.contains(vo.getSourceRef()));
            out.add(vo);
        }
        return out;
    }

    /* ==================== RDM 任务（阶段三：可回写的那一档） ==================== */

    /**
     * 本人相关的未结案 RDM 任务。
     *
     * <p>为什么需求档之外还要单独给一档任务：RDM 的进度真值在 {@code rdm_work_task.progress}，
     * 而 {@code rdm_requirement.progress} 被 RDM 日报自己判为「可能长期停留 0，用它算进度
     * 会与执行侧甘特图矛盾」。所以需求档只能做只读关联，只有任务档具备回写落点——
     * 把回写做成需求级，等于在两边各写一套「进度」然后等它们飘开。
     *
     * <p>{@code prdTask} 原样透出：PRD 任务的 100% 只能通过提交评审达成，
     * 界面预先标出来，用户就不会填一个永远回写不进去的进度再奇怪徽标为什么一直红。
     */
    public List<CpmDto.SourceVO> listRdmTasks(String keyword) {
        RdmWorkItemSource source = rdmSource.getIfAvailable();
        if (source == null) {
            log.warn("cpm 關聯導入：RDM 任務端口無實現，返回空清單（fail-closed，不降級為直查 rdm 表）");
            return List.of();
        }
        SysUser current = guard.currentUser();
        List<RdmWorkItemSource.TaskRef> refs = source.findMyOpenTasks(current.getId(), keyword, CANDIDATE_LIMIT);
        Set<String> imported = importedRefs(CpmConstants.SOURCE_RDM_TASK, current.getId(),
                refs.stream().map(ref -> String.valueOf(ref.taskId())).toList());

        List<CpmDto.SourceVO> out = new ArrayList<>();
        for (RdmWorkItemSource.TaskRef ref : refs) {
            CpmDto.SourceVO vo = new CpmDto.SourceVO();
            vo.setSourceType(CpmConstants.SOURCE_RDM_TASK);
            vo.setSourceRef(String.valueOf(ref.taskId()));
            vo.setTitle(ref.title());
            vo.setStatusCode(ref.status());
            vo.setRole(ref.myRole());
            vo.setProgress(ref.progress());
            vo.setPlanHours(ref.planHours());
            vo.setDueDate(ref.planFinishDate() == null ? null : ref.planFinishDate().format(DATE));
            vo.setTerminated(ref.terminated());
            vo.setPrdTask(ref.prdTask());
            // 副行给任务号、父行给需求标题：都是来源系统的原文，CPM 不拼成一句死文案
            vo.setExternalNo(ref.taskNo());
            vo.setSubtitle(StringUtils.hasText(ref.taskNo()) ? ref.taskNo() : null);
            vo.setParentTitle(ref.reqTitle());
            vo.setImported(imported.contains(vo.getSourceRef()));
            out.add(vo);
        }
        return out;
    }

    /* ==================== 会议行动项 ==================== */
    /**
     * 本人负责（含协办）的未完成行动项。归属判定与会议标题都留在会议域的
     * {@link MeetingActionSource} 实现里：cpm 不碰 biz_meeting_minutes_item_* 的列，
     * 会议改表时这里只会「少几行」而不会「悄悄错判成无关」。
     */
    public List<CpmDto.SourceVO> listMeetingActions() {
        SysUser current = guard.currentUser();
        List<MeetingActionSource.ActionItemRef> refs =
                meetingActions.findOpenActionsOf(current.getId(), CANDIDATE_LIMIT);
        Set<String> imported = importedRefs("meeting_action", current.getId(),
                refs.stream().map(ref -> String.valueOf(ref.itemId())).toList());

        List<CpmDto.SourceVO> out = new ArrayList<>();
        for (MeetingActionSource.ActionItemRef ref : refs) {
            CpmDto.SourceVO vo = new CpmDto.SourceVO();
            vo.setSourceType("meeting_action");
            vo.setSourceRef(String.valueOf(ref.itemId()));
            vo.setTitle(ref.content());
            vo.setStatusCode(ref.statusCode());
            vo.setRole(current.getId().equals(ref.ownerUserId()) ? "owner" : "participant");
            vo.setDueDate(ref.dueDate() == null ? null : ref.dueDate().format(DATE));
            vo.setSubtitle(ref.meetingTitle());
            vo.setImported(imported.contains(vo.getSourceRef()));
            out.add(vo);
        }
        return out;
    }

    /* ==================== 会议本体（導入會議） ==================== */

    /**
     * 本人组织或参与的未取消会议，供台账「導入會議」挑选。
     *
     * <p>与行动项档是两个接而不是一个 tab 两种行：行动项带回来的是一个「完成时限」（单日），
     * 会议本体带回来的是一段「预定起止」（计划起 + 计划止）。合成一档，界面就无法在同一个
     * 日期列里同时说清两种语义；导入后用户看到的两个日期与他刚才选的东西对不上。
     *
     * <p>「哪些会与我相关」与「哪些会不算已取消」全部在会议域端口里定，这里只翻译形状：
     * cpm 不查 biz_meeting_booking 的列，会议改表时最多「少几行」，不会静默错判归属。
     */
    public List<CpmDto.MeetingSourceVO> listMeetings(String keyword) {
        SysUser current = guard.currentUser();
        List<MeetingActionSource.MeetingRef> refs =
                meetingActions.findUncancelledMeetingsOf(current.getId(), keyword, CANDIDATE_LIMIT);
        if (refs.isEmpty()) {
            return List.of();
        }
        Set<String> imported = importedRefs(CpmConstants.SOURCE_MEETING, current.getId(),
                refs.stream().map(ref -> String.valueOf(ref.bookingId())).toList());

        List<CpmDto.MeetingSourceVO> out = new ArrayList<>();
        for (MeetingActionSource.MeetingRef ref : refs) {
            CpmDto.MeetingSourceVO vo = new CpmDto.MeetingSourceVO();
            vo.setBookingId(ref.bookingId());
            vo.setBookingNo(ref.bookingNo());
            vo.setTitle(ref.title());
            // 起止直接原样透出 ISO 白日期时间：日期语义不在这层丢失，也不先折成日期再让人猜时间
            vo.setStartTime(ref.startTime() == null ? null : ref.startTime().format(DATE_TIME));
            vo.setEndTime(ref.endTime() == null ? null : ref.endTime().format(DATE_TIME));
            vo.setStatusCode(ref.statusCode());
            vo.setRole(ref.organizer() ? "organizer" : "participant");
            vo.setRoomName(ref.roomName());
            vo.setImported(imported.contains(String.valueOf(ref.bookingId())));
            out.add(vo);
        }
        return out;
    }

    /** 已经导入过的来源对象 ID（未删条目口径）；软删过的允许重新导入，与唯一键一致 */
    private Set<String> importedRefs(String sourceType, long userId, List<String> refs) {
        if (refs.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(itemMapper.selectList(new LambdaQueryWrapper<CpmItem>()
                        .select(CpmItem::getSourceRef)
                        .eq(CpmItem::getUserId, userId)
                        .eq(CpmItem::getSourceType, sourceType)
                        .eq(CpmItem::getDeleted, 0)
                        .in(CpmItem::getSourceRef, refs))
                .stream().map(CpmItem::getSourceRef).toList());
    }
}
