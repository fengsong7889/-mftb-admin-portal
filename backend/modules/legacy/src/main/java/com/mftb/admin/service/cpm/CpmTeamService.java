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
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmRecognition;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmReactionMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmReportReadMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 团队汇报视图：阅读范围内的成员 × 本期提交事实 + 聚合统计。
 *
 * <p>统计卡口径铁律（§E.8 / 方案 §七-P4）：数字一律来自「当前筛选后的行集合」，
 * 卡片不独立发请求、不显示全量——先全量后过滤的数字误读比没有数字更糟。
 *
 * <p>反内卷红线：本服务只产出聚合（提交率/完成数/待反馈数），
 * 永不输出跨成员的个人排名列表；催办对象与话术由 CpmNotifyService 控制为「提醒本人」。
 */
@Service
@RequiredArgsConstructor
public class CpmTeamService {

    private final CpmReportMapper reportMapper;
    private final CpmReportReadMapper readMapper;
    private final CpmCommentMapper commentMapper;
    private final CpmReactionMapper reactionMapper;
    private final CpmRecognitionMapper recognitionMapper;
    private final CpmItemMapper itemMapper;
    private final SysUserMapper userMapper;
    private final CpmAccessGuard guard;
    private final CpmPeriods periods;
    private final CpmRuleService ruleService;
    private final CpmNotifyService notifyService;

    public CpmDto.TeamVO board(String periodType, String periodStartStr) {
        SysUser viewer = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(periodType, LocalDate.parse(periodStartStr));
        List<Long> scope = new ArrayList<>(guard.viewableUserIds(viewer));
        scope.remove(viewer.getId());
        CpmDto.TeamVO vo = new CpmDto.TeamVO();
        vo.setPeriodType(periodType);
        vo.setPeriodStart(period.start().toString());
        vo.setPeriodEnd(period.end().toString());
        if (scope.isEmpty()) {
            return vo;
        }
        Map<Long, SysUser> users = new HashMap<>();
        userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .select(SysUser::getId, SysUser::getName, SysUser::getUsername,
                                SysUser::getEmpId, SysUser::getDepartment)
                        .in(SysUser::getId, scope))
                .forEach(u -> users.put(u.getId(), u));
        Map<Long, CpmReport> byOwner = new HashMap<>();
        reportMapper.listByUsersAndPeriod(scope, periodType, period.start())
                .forEach(r -> byOwner.putIfAbsent(r.getUserId(), r));
        String periodTag = periods.quarterTag(period.start());

        int doneTotal = 0;
        int itemsTotal = 0;
        int pendingFeedback = 0;
        int published = 0;
        for (Long userId : scope) {
            SysUser user = users.get(userId);
            if (user == null) {
                continue;
            }
            CpmReport report = byOwner.get(userId);
            CpmDto.TeamRow row = new CpmDto.TeamRow();
            row.setUserId(userId);
            row.setName(user.getName());
            row.setEmpId(user.getEmpId());
            row.setDepartment(user.getDepartment());
            if (report != null && CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus())) {
                row.setSubmitStatus("published");
                row.setReportId(report.getId());
                row.setPublishedAt(report.getPublishedAt() == null ? null : report.getPublishedAt().toString());
                CpmDto.Snapshot snapshot = JsonUtils.parse(report.getContentJson(), CpmDto.Snapshot.class);
                if (snapshot != null && snapshot.getTotals() != null) {
                    row.setTotalItems(snapshot.getTotals().getTotal());
                    row.setDoneItems(snapshot.getTotals().getDone());
                    doneTotal += snapshot.getTotals().getDone();
                    itemsTotal += snapshot.getTotals().getTotal();
                }
                row.setReadCount(readMapper.countRead(report.getId()));
                row.setReceiverCount(ruleService.receiverCountFor(userId));
                row.setCommentCount(commentMapper.countActive(CpmConstants.TARGET_REPORT, report.getId()));
                row.setLikeCount(reactionMapper.countAll(CpmConstants.TARGET_REPORT, report.getId()));
                if (row.getCommentCount() == 0) {
                    pendingFeedback++;
                }
                published++;
            } else {
                // 草稿与缺行都如实标 missing：草稿是「没交」的私人状态，不该把草稿内容泄露给上级视图
                row.setSubmitStatus("missing");
                row.setReceiverCount(ruleService.receiverCountFor(userId));
            }
            List<CpmRecognition> mine = recognitionMapper.selectList(new LambdaQueryWrapper<CpmRecognition>()
                    .eq(CpmRecognition::getFromUserId, viewer.getId())
                    .eq(CpmRecognition::getToUserId, userId)
                    .eq(CpmRecognition::getPeriodTag, periodTag));
            row.setRecognizedByMe(mine.size());
            vo.getRows().add(row);
        }
        CpmDto.TeamVO.Stats stats = vo.getStats();
        stats.setMemberCount(vo.getRows().size());
        stats.setPublishedCount(published);
        stats.setSubmitRate(vo.getRows().isEmpty() ? 0 : Math.round(published * 100f / vo.getRows().size()));
        stats.setDoneItemsTotal(doneTotal);
        stats.setItemsTotal(itemsTotal);
        stats.setRecognitionSentCount(recognitionMapper.countSentInPeriod(viewer.getId(), periodTag));
        stats.setPendingFeedbackCount(pendingFeedback);
        return vo;
    }

    /** 手动催办入口（动作锚 cpm-rule:trigger）：只向未交成员本人发提醒。 */
    public void remindMember(long userId, String periodType, String periodStartStr) {
        SysUser viewer = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(periodType, LocalDate.parse(periodStartStr));
        if (!guard.viewableUserIds(viewer).contains(userId) || userId == viewer.getId()) {
            throw new com.mftb.admin.common.BusinessException("該成員不在你的團隊範圍");
        }
        CpmReport report = reportMapper.findOwn(userId, periodType, period.start());
        if (report != null && CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus())) {
            throw new com.mftb.admin.common.BusinessException("該成員本期已發布，無需提醒");
        }
        String text = "週期 " + period.start() + " ~ " + period.end() + " 尚未發布匯報，請及時補齊。";
        // 催办不即时发？——即时走 push_record 幂等：同日重复点击只第一条真的出站，其余 skipped 静默
        remindNow(userId, period.start(), text);
    }

    /** 供调度器与手动入口共用：登记并投递（dry-run 下只登记）。 */
    public void remindNow(long userId, LocalDate periodStart, String summaryText) {
        notifyService.remindDeadline(userId, periodStart, summaryText);
    }

    /** 工作台摘要：今日记录数 + 本周发布状态 + 本周收到的反馈数。 */
    public CpmDto.HomeSummaryVO homeSummary() {
        SysUser current = guard.currentUser();
        CpmDto.HomeSummaryVO vo = new CpmDto.HomeSummaryVO();
        LocalDate today = periods.today();
        vo.setTodayCount(itemMapper.listActiveOn(current.getId(), today).size());
        CpmPeriods.Period week = periods.resolve(CpmConstants.PERIOD_WEEK,
                today.minusDays(today.getDayOfWeek().getValue() - 1L));
        CpmReport report = reportMapper.findOwn(current.getId(), CpmConstants.PERIOD_WEEK, week.start());
        vo.setWeekPeriodStart(week.start().toString());
        vo.setWeekPublished(report != null && CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus()));
        if (Boolean.TRUE.equals(vo.getWeekPublished()) && report != null) {
            vo.setWeekFeedbackCount(commentMapper.countActive(CpmConstants.TARGET_REPORT, report.getId()));
        } else {
            vo.setWeekFeedbackCount(0);
        }
        return vo;
    }
}
