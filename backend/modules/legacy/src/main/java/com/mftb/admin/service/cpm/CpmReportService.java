/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmReactionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmReportReadMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 汇报服务：预览（不落库）→ 草稿（可覆盖）→ 发布（快照冻结 + 触发送达）。
 *
 * <p>发布语义三条硬约束（方案 §五-C）：
 * 1) 发布时重算快照再冻结——用户可能停留页面很久，「所见」必须等于「所发」的当前事实；
 * 2) publishDraft 是条件 UPDATE（仅 draft 能翻正），重复点击幂等且不会二次触发推送；
 * 3) 推送在事务提交后异步发起：汇报发布不能因为钉钉抖动而失败回滚，
 *    投递结果另记 push_record（queued/sent/skipped/failed）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmReportService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final CpmReportMapper reportMapper;
    private final CpmReportReadMapper readMapper;
    private final CpmCommentMapper commentMapper;
    private final CpmReactionMapper reactionMapper;
    private final CpmSnapshotBuilder snapshotBuilder;
    private final CpmPeriods periods;
    private final CpmAccessGuard guard;
    private final CpmRuleService ruleService;
    private final CpmNotifyService notifyService;

    /* ==================== 预览 ==================== */

    /** 确定性初稿：不落库、零副作用（进入汇报页每个周期只调一次，秒开）。 */
    public CpmDto.Snapshot preview(String periodType, String periodStartStr) {
        SysUser current = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(periodType, LocalDate.parse(periodStartStr));
        return snapshotBuilder.build(current.getId(), periodType, period.start(), period.end());
    }

    /** 我的当期视图：有草稿/已发布读存量，没有则回显实时预览（草稿未建时的「所见」）。 */
    public CpmDto.ReportVO current(String periodType, String periodStartStr) {
        SysUser current = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(periodType, LocalDate.parse(periodStartStr));
        CpmReport stored = reportMapper.findOwn(current.getId(), periodType, period.start());
        if (stored != null) {
            return toVO(stored, current);
        }
        CpmReport virtual = new CpmReport();
        virtual.setUserId(current.getId());
        virtual.setPeriodType(periodType);
        virtual.setPeriodStart(period.start());
        virtual.setPeriodEnd(period.end());
        virtual.setStatus(CpmConstants.REPORT_STATUS_DRAFT);
        virtual.setAiSummary(0);
        // 草稿未建：实时聚合直接进 VO（无 id，接收人/回执计数按 0 出，绝不拿假数字冒充口径）
        CpmDto.ReportVO vo = toVO(virtual, current);
        vo.setSnapshot(snapshotBuilder.build(current.getId(), periodType, period.start(), period.end()));
        return vo;
    }

    /* ==================== 草稿与发布 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ReportVO saveDraft(CpmDto.DraftForm form) {
        SysUser current = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(form.getPeriodType(), LocalDate.parse(form.getPeriodStart()));
        String snapshotJson = JsonUtils.toJson(
                snapshotBuilder.build(current.getId(), period.periodType(), period.start(), period.end()));
        CpmReport existing = reportMapper.findOwn(current.getId(), period.periodType(), period.start());
        if (existing != null) {
            if (!CpmConstants.REPORT_STATUS_DRAFT.equals(existing.getStatus())) {
                throw new BusinessException("匯報已發布，不可修改；如需重述請等待下一週期");
            }
            if (reportMapper.overwriteDraft(existing.getId(), current.getId(), snapshotJson,
                    trim(form.getSummary(), 2000), Boolean.TRUE.equals(form.getAiSummary()) ? 1 : 0,
                    period.end()) == 0) {
                throw new BusinessException("草稿已被更新，請刷新後重試");
            }
            return toVO(reportMapper.selectById(existing.getId()), current);
        }
        CpmReport row = new CpmReport();
        row.setUserId(current.getId());
        row.setPeriodType(period.periodType());
        row.setPeriodStart(period.start());
        row.setPeriodEnd(period.end());
        row.setContentJson(snapshotJson);
        row.setSummary(trim(form.getSummary(), 2000));
        row.setAiSummary(Boolean.TRUE.equals(form.getAiSummary()) ? 1 : 0);
        row.setStatus(CpmConstants.REPORT_STATUS_DRAFT);
        row.setVersion(0);
        row.setDeleted(0);
        // 审计列显式落值（全局 MetaObjectHandler 只填时间，不填 createdBy/updatedBy）
        row.setCreatedBy(current.getName());
        row.setUpdatedBy(current.getName());
        try {
            reportMapper.insert(row);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("本週期匯報已被建立（可能另一端已保存），請刷新後重試");
        }
        return toVO(row, current);
    }

    /** 发布：重算快照 → 条件翻正 → 事务提交后异步送达。返回最新视图。 */
    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ReportVO publish(CpmDto.DraftForm form) {
        SysUser current = guard.currentUser();
        CpmPeriods.Period period = periods.resolve(form.getPeriodType(), LocalDate.parse(form.getPeriodStart()));
        CpmDto.Snapshot snapshot = snapshotBuilder.build(current.getId(), period.periodType(), period.start(), period.end());
        if (snapshot.getTotals().getTotal() == 0) {
            throw new BusinessException("本週期沒有活躍的工作記錄，無需發布空匯報");
        }
        String snapshotJson = JsonUtils.toJson(snapshot);
        CpmReport existing = reportMapper.findOwn(current.getId(), period.periodType(), period.start());
        if (existing == null) {
            // 未存草稿直接发布：先建行再翻正，两步同事务，语义等同「存并发的草稿然后发布」
            CpmReport row = new CpmReport();
            row.setUserId(current.getId());
            row.setPeriodType(period.periodType());
            row.setPeriodStart(period.start());
            row.setPeriodEnd(period.end());
            row.setContentJson(snapshotJson);
            row.setSummary(trim(form.getSummary(), 2000));
            row.setAiSummary(Boolean.TRUE.equals(form.getAiSummary()) ? 1 : 0);
            row.setStatus(CpmConstants.REPORT_STATUS_DRAFT);
            row.setVersion(0);
            row.setDeleted(0);
            row.setCreatedBy(current.getName());
            row.setUpdatedBy(current.getName());
            try {
                reportMapper.insert(row);
                existing = row;
            } catch (DuplicateKeyException e) {
                existing = reportMapper.findOwn(current.getId(), period.periodType(), period.start());
                if (existing == null) {
                    throw new BusinessException("匯報狀態衝突，請刷新後重試");
                }
            }
        }
        if (CpmConstants.REPORT_STATUS_PUBLISHED.equals(existing.getStatus())) {
            // 幂等：已发布直接回当前视图，不再触发第二次推送
            return toVO(existing, current);
        }
        if (reportMapper.publishDraft(existing.getId(), snapshotJson,
                trim(form.getSummary(), 2000), Boolean.TRUE.equals(form.getAiSummary()) ? 1 : 0) == 0) {
            CpmReport latest = reportMapper.selectById(existing.getId());
            if (latest != null && CpmConstants.REPORT_STATUS_PUBLISHED.equals(latest.getStatus())) {
                return toVO(latest, current);
            }
            throw new BusinessException("發布狀態已變更，請刷新後重試");
        }
        final long reportId = existing.getId();
        // 事务提交后再投递：钉钉抖动不回滚发布（同纪要 Dispatcher 的 afterCommit 口径）
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    notifyService.notifyReportPublished(reportId);
                } catch (RuntimeException e) {
                    log.warn("[CpmNotify] 发布送达异常 reportId={}: {}", reportId, e.getMessage());
                }
            }
        });
        return toVO(reportMapper.selectById(reportId), current);
    }

    /* ==================== 详情（本人或可见范围） ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ReportVO detail(long reportId) {
        SysUser viewer = guard.currentUser();
        CpmReport report = guard.requireReadableReport(reportId, viewer);
        SysUser owner = report.getUserId().equals(viewer.getId())
                ? viewer : userOf(report.getUserId());
        // 打开即登记已读（本人打开不记——「自己读了自己的汇报」不是送达口径的证据）
        if (!report.getUserId().equals(viewer.getId())) {
            readMapper.insertIgnore(reportId, viewer.getId());
        }
        return toVO(report, owner);
    }

    /** 我的历史列表（倒序）。 */
    public List<CpmDto.ReportVO> listMine(String periodType) {
        SysUser current = guard.currentUser();
        List<CpmDto.ReportVO> out = new ArrayList<>();
        reportMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CpmReport>()
                        .eq(CpmReport::getUserId, current.getId())
                        .eq(periodType != null && !periodType.isBlank(), CpmReport::getPeriodType, periodType)
                        .orderByDesc(CpmReport::getPeriodStart))
                .forEach(r -> out.add(toVO(r, current)));
        return out;
    }

    /* ==================== 内部 ==================== */

    private SysUser userOf(long userId) {
        SysUser user = guard.userById(userId);
        return user == null ? placeholder(userId) : user;
    }

    private SysUser placeholder(long userId) {
        SysUser ghost = new SysUser();
        ghost.setId(userId);
        ghost.setName("未知用戶");
        return ghost;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.length() > max) {
            throw new BusinessException("內容超過長度上限 " + max);
        }
        return t;
    }

    CpmDto.ReportVO toVO(CpmReport stored, SysUser owner) {
        CpmDto.ReportVO vo = new CpmDto.ReportVO();
        vo.setId(stored.getId());
        vo.setUserId(stored.getUserId());
        vo.setOwnerName(owner == null ? null : owner.getName());
        vo.setOwnerEmpId(owner == null ? null : owner.getEmpId());
        vo.setPeriodType(stored.getPeriodType());
        vo.setPeriodStart(stored.getPeriodStart() == null ? null : stored.getPeriodStart().toString());
        vo.setPeriodEnd(stored.getPeriodEnd() == null ? null : stored.getPeriodEnd().toString());
        vo.setStatus(stored.getStatus());
        vo.setSummary(stored.getSummary());
        vo.setAiSummary(Integer.valueOf(1).equals(stored.getAiSummary()));
        vo.setPublishedAt(stored.getPublishedAt() == null ? null : stored.getPublishedAt().format(DISPLAY));
        if (stored.getContentJson() != null) {
            vo.setSnapshot(JsonUtils.parse(stored.getContentJson(), CpmDto.Snapshot.class));
        }
        // 送达口径：规则解析出的接收人（本人+接收策略），已读/评论/点赞取各自表——
        // 数字全部服务端算，前端不得自行重算（「通知里的数字=页面数字」同源约束）
        vo.setReceiverCount(stored.getId() == null ? 0 : ruleService.receiverCountFor(stored.getUserId()));
        vo.setReadCount(stored.getId() == null ? 0 : readMapper.countRead(stored.getId()));
        vo.setCommentCount(stored.getId() == null ? 0 : commentMapper.countActive(CpmConstants.TARGET_REPORT, stored.getId()));
        vo.setLikeCount(stored.getId() == null ? 0 : reactionMapper.countAll(CpmConstants.TARGET_REPORT, stored.getId()));
        SysUser viewer = safeCurrent();
        vo.setLikedByMe(viewer != null && stored.getId() != null
                && reactionMapper.countActive(CpmConstants.TARGET_REPORT, stored.getId(), viewer.getId()) > 0);
        vo.setVersion(stored.getVersion());
        return vo;
    }

    private SysUser safeCurrent() {
        try {
            return guard.currentUser();
        } catch (BusinessException e) {
            return null;
        }
    }
}
