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
import com.mftb.admin.entity.CpmReportRevision;
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
import java.time.LocalDateTime;
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
    /** 阶段三：正式版本链。发布/修订都在同事务内写版本行，指针绑定失败整个回滚 */
    private final CpmReportRevisionService revisionService;

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
            CpmDto.ReportVO vo = toVO(stored, current);
            /*
             * 已发布的当期视图要重跑一次聚合，才能回答「期间内是不是又发生了新事实」。
             * 没有这个信号，修订功能等于不存在——用户不会知道自己漏了什么，
             * 而阶段二那条「已发布不可修改」的提示会一直挂着，看起来像系统坏掉了。
             */
            attachRevisions(vo, stored, CpmConstants.REPORT_STATUS_PUBLISHED.equals(stored.getStatus())
                    ? snapshotBuilder.build(current.getId(), periodType, period.start(), period.end())
                    : null);
            return vo;
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
                // 阶段三起已发布不再「等下一周期」：补录走修订重发布，旧版本照样留着
                throw new BusinessException("匯報已發布，不可改回草稿；如需補錄請使用「修訂並重新發布」");
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
                trim(form.getSummary(), 2000), Boolean.TRUE.equals(form.getAiSummary()) ? 1 : 0,
                revisionService.contentHash(snapshotJson, trim(form.getSummary(), 2000),
                        Boolean.TRUE.equals(form.getAiSummary()))) == 0) {
            CpmReport latest = reportMapper.selectById(existing.getId());
            if (latest != null && CpmConstants.REPORT_STATUS_PUBLISHED.equals(latest.getStatus())) {
                return toVO(latest, current);
            }
            throw new BusinessException("發布狀態已變更，請刷新後重試");
        }
        CpmReport published = reportMapper.selectById(existing.getId());
        // V1 与发布同事务：指针绑不上就整个回滚，绝不留「已发布但没有版本」这种半状态
        CpmReportRevision revision = revisionService.ensureRevision(
                published, CpmReportRevisionService.FIRST_REVISION_NOTE, published.getPublishedAt(), current);
        reportMapper.bindRevision(published.getId(), revision.getId());
        published.setPublishedRevisionId(revision.getId());
        final long reportId = published.getId();
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

    /**
     * 修订重发布：重新聚合 → 冻结为 V(n+1) → 指针推进 → 通知指向新版。
     *
     * <p>已发布不再是终态，但也不是「可以偷偷改」：每次修订都留下不可变版本与一句必填说明，
     * 旧版本继续可查可导出。内容没有任何变化时不会产生新版本（幂等），
     * 因为「V2 与 V1 完全一样」这种版本链只会让人怀疑版本机制本身在说谎。
     */
    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ReportVO republish(CpmDto.RepublishForm form) {
        SysUser current = guard.currentUser();
        // 锁汇报行：版本号分配与 request_key 间隙检查必须按汇报串行化（见 requireOwnedReportForUpdate）
        CpmReport stored = guard.requireOwnedReportForUpdate(form.getReportId(), current);
        if (!CpmConstants.REPORT_STATUS_PUBLISHED.equals(stored.getStatus())) {
            throw new BusinessException("只有已發布的匯報才能修訂重發布");
        }
        if (form.getChangeNote() == null || form.getChangeNote().isBlank()) {
            throw new BusinessException("請填寫修訂說明");
        }
        // 重新聚合是修订存在的唯一理由：让期间内新发生的事实（补记的时段、新写的流水）进入新版
        CpmDto.Snapshot snapshot = snapshotBuilder.build(
                stored.getUserId(), stored.getPeriodType(), stored.getPeriodStart(), stored.getPeriodEnd());
        if (snapshot.getTotals().getTotal() == 0) {
            throw new BusinessException("本週期已無活躍工作記錄，無法修訂為空匯報");
        }
        String snapshotJson = JsonUtils.toJson(snapshot);
        String summary = trim(form.getSummary(), 2000);
        boolean aiSummary = Boolean.TRUE.equals(form.getAiSummary());
        String hash = revisionService.contentHash(snapshotJson, summary, aiSummary);
        if (hash.equals(stored.getDraftHash())) {
            // 内容与上次发布完全一致：直接回当前视图。此处不产生 V(n+1)，也不推送第二次
            return toVO(stored, current);
        }
        String newSummary = summary == null ? stored.getSummary() : summary;
        int newAiSummary = form.getSummary() == null && form.getAiSummary() == null
                ? (Integer.valueOf(1).equals(stored.getAiSummary()) ? 1 : 0)
                : (aiSummary ? 1 : 0);

        CpmReport staged = new CpmReport();
        staged.setId(stored.getId());
        staged.setVersion(stored.getVersion());
        staged.setContentJson(snapshotJson);
        staged.setSummary(newSummary);
        staged.setAiSummary(newAiSummary);
        LocalDateTime publishedAt = LocalDateTime.now();
        CpmReportRevision revision = revisionService.ensureRevision(
                staged, form.getChangeNote().trim(), publishedAt, current);
        if (reportMapper.applyRevision(stored.getId(), current.getId(), stored.getVersion(),
                snapshotJson, newSummary, newAiSummary, hash, revision.getId(), publishedAt) == 0) {
            throw new BusinessException("匯報已被更新，請刷新後重試");
        }
        final long reportId = stored.getId();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    notifyService.notifyReportPublished(reportId);
                } catch (RuntimeException e) {
                    log.warn("[CpmNotify] 修訂送達異常 reportId={}: {}", reportId, e.getMessage());
                }
            }
        });
        return toVO(reportMapper.selectById(reportId), current);
    }

    /**
     * 读取指定历史版本。
     *
     * <p>读历史<b>不登记已读回执</b>：回执的业务含义是「他收到了这一期汇报」，
     * 把「翻出三个月前的旧版看了一眼」也记成已读，送达统计就开始说谎。
     * 权限仍走 {@code requireReadableReport}——能看到当期不等于能看到该人全部历史，
     * 但既然当期可读，同一期的旧版本就是同一批内容，不额外扩大披露面。
     */
    public CpmDto.ReportVO revisionView(long reportId, int revisionNo) {
        SysUser viewer = guard.currentUser();
        CpmReport report = guard.requireReadableReport(reportId, viewer);
        SysUser owner = report.getUserId().equals(viewer.getId()) ? viewer : userOf(report.getUserId());
        CpmReportRevision revision = revisionService.require(reportId, revisionNo);
        CpmDto.ReportVO vo = toVO(report, owner);
        // 覆盖成那一版冻结的内容：当前版的 content_json/摘要与版本号都必须被替换，
        // 只换快照不换摘要的话，界面会出现「V1 的版本号 + V2 的摘要」这种最坏的组合
        vo.setSnapshot(revisionService.parseSnapshot(revision));
        vo.setSummary(revision.getDigest());
        vo.setAiSummary(Integer.valueOf(1).equals(revision.getAiSummary()));
        vo.setPublishedAt(revision.getPublishedAt() == null ? null : revision.getPublishedAt().format(DISPLAY));
        vo.setRevisionNo(revision.getRevisionNo());
        return vo;
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
        CpmDto.ReportVO vo = toVO(report, owner);
        // 上级侧不重跑聚合：「有未发布变更」是汇报人自己的判断依据，
        // 让读者触发一次重聚合既没有消费方，又会给团队视图的每次点开加一遍统计
        attachRevisions(vo, report, null);
        return vo;
    }

    /**
     * 版本列表（供界面抬头切换器与历史 tab 用）。
     *
     * <p>守卫与详情同一条：能看到这一期汇报，就能看到它被发布过几版——
     * 版本链是「谁在什么时候看到了什么内容」的证据，对已经有权读内容的人不必再藏。
     */
    public List<CpmDto.RevisionVO> revisions(long reportId) {
        SysUser viewer = guard.currentUser();
        CpmReport report = guard.requireReadableReport(reportId, viewer);
        return revisionService.list(reportId, report.getPublishedRevisionId());
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
        vo.setPublishedRevisionId(stored.getPublishedRevisionId());
        return vo;
    }

    /**
     * 把版本链挂到视图上，只在「单个汇报被打开」时调用。
     *
     * <p>历史列表不挂：那里每行都要多两次查询（版本列表 + 实时重聚合）才能给出一个
     * 列表里根本看不见的版本号。缺字段与零值不同，宁可不给也不为列表造 N+1。
     *
     * @param live 已经算好的当前实时聚合快照；传 null 表示不判定「有未发布变更」
     */
    private void attachRevisions(CpmDto.ReportVO vo, CpmReport stored, CpmDto.Snapshot live) {
        if (stored.getId() == null || !CpmConstants.REPORT_STATUS_PUBLISHED.equals(stored.getStatus())) {
            return;
        }
        List<CpmDto.RevisionVO> revisions = revisionService.list(stored.getId(), stored.getPublishedRevisionId());
        vo.setRevisions(revisions);
        revisions.stream().filter(r -> Boolean.TRUE.equals(r.getCurrent())).findFirst()
                .ifPresent(current -> vo.setRevisionNo(current.getRevisionNo()));
        if (live != null) {
            String liveHash = revisionService.contentHash(JsonUtils.toJson(live),
                    stored.getSummary(), Integer.valueOf(1).equals(stored.getAiSummary()));
            // 「有未发布变更」说的是「期间内又发生了新事实」，而不是「我改过草稿」：
            // 已发布记录的草稿不可改，判据只能是重新聚合的结果与冻结快照的差异
            vo.setHasUnpublishedChanges(!liveHash.equals(stored.getDraftHash()));
        }
    }

    private SysUser safeCurrent() {
        try {
            return guard.currentUser();
        } catch (BusinessException e) {
            return null;
        }
    }
}
