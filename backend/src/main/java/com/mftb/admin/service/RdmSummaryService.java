package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * RDM 统一摘要服务（Batch 2 / Phase 1B）。
 *
 * <p>「一处计算、多处消费」的统计口径中心。项目详情、需求详情、交付项详情、个人工作台、
 * 项目列表统计卡过去各算各的数，容易出现"同一事实两个数字"（详情页说 3 个阻塞、列表卡说 2 个）。
 * 本服务把所有派生统计收敛到这里，全部基于事实表实时计算，不做缓存：
 * <ul>
 *   <li>交付项/任务/测试/问题/验收的计数一律走对应 mapper 的 {@code selectCount}，口径与
 *       {@link RdmProjectService}、{@link RdmReleaseBatchService} 的闸门判定保持一致；</li>
 *   <li>阻塞任务数复用 {@link RdmScheduleServiceImpl#getBlockedTasks}（跨交付项依赖阻断），
 *       不再自行推导，避免关键路径口径分裂；</li>
 *   <li>每份摘要都带 {@code computedAt}，前端可据此显示"统计时点"，提示数字非实时刷新即会漂移。</li>
 * </ul>
 *
 * <p>范围未确定（尚无交付项）时计数返回 0，由前端决定是否显示"範圍未確定"占位；
 * 本服务不用 -1/null 表达"未定义"，以免各处判空口径不一。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmSummaryService {

    /** 工作台"临期"窗口（天） */
    private static final int UPCOMING_DAYS = 7;

    private final RdmProjectMapper projectMapper;
    private final RdmProjectMemberMapper memberMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmTestExecutionMapper testExecutionMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmAcceptanceRecordMapper acceptanceMapper;
    private final RdmScheduleServiceImpl scheduleService;

    /* ==================== 项目级摘要 ==================== */

    /**
     * 项目级摘要 —— 供详情页、导出、工作台复用。
     * <p>聚合交付项、需求、任务、问题、测试批次、验收与阻塞任务的实时计数。
     */
    public ProjectSummary getProjectSummary(Long projectId) {
        ProjectSummary s = new ProjectSummary();
        s.setProjectId(projectId);
        s.setComputedAt(LocalDateTime.now());
        if (projectId == null) {
            return s;
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, projectId));
        List<Long> itemIds = items.stream().map(RdmDeliveryItem::getId).filter(Objects::nonNull).toList();

        int itemCompleted = 0, itemInProgress = 0, blockedTaskCount = 0;
        for (RdmDeliveryItem item : items) {
            if (RdmConstants.DI_DONE.equals(item.getStatus())) {
                itemCompleted++;
            } else if (RdmConstants.DI_ACTIVE_STATUSES.contains(item.getStatus())) {
                itemInProgress++;
            }
            blockedTaskCount += scheduleService.getBlockedTasks(item.getId()).size();
        }
        s.setDeliveryItemTotal(items.size());
        s.setDeliveryItemCompleted(itemCompleted);
        s.setDeliveryItemInProgress(itemInProgress);
        s.setBlockedTaskCount(blockedTaskCount);

        s.setRequirementTotal(Math.toIntExact(requirementMapper.selectCount(
                new LambdaQueryWrapper<RdmRequirement>().eq(RdmRequirement::getProjectId, projectId))));

        s.setTaskTotal(Math.toIntExact(taskMapper.selectCount(
                new LambdaQueryWrapper<RdmWorkTask>().in(RdmWorkTask::getDeliveryItemId, inIds(itemIds))
                        .ne(RdmWorkTask::getStatus, "cancelled"))));
        s.setTaskCompleted(Math.toIntExact(taskMapper.selectCount(
                new LambdaQueryWrapper<RdmWorkTask>().in(RdmWorkTask::getDeliveryItemId, inIds(itemIds))
                        .eq(RdmWorkTask::getStatus, "done"))));
        s.setTaskInProgress(Math.toIntExact(taskMapper.selectCount(
                new LambdaQueryWrapper<RdmWorkTask>().in(RdmWorkTask::getDeliveryItemId, inIds(itemIds))
                        .eq(RdmWorkTask::getStatus, "doing"))));

        if (!itemIds.isEmpty()) {
            s.setIssueOpen(Math.toIntExact(issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                    .in(RdmIssue::getDeliveryItemId, itemIds)
                    .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES))));
            s.setIssueCritical(Math.toIntExact(issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                    .in(RdmIssue::getDeliveryItemId, itemIds)
                    .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES)
                    .eq(RdmIssue::getSeverity, RdmConstants.SEV_CRITICAL))));
            s.setAcceptancePending(Math.toIntExact(acceptanceMapper.selectCount(
                    new LambdaQueryWrapper<RdmAcceptanceRecord>()
                            .in(RdmAcceptanceRecord::getDeliveryItemId, itemIds)
                            .isNull(RdmAcceptanceRecord::getConclusion))));
        }
        s.setTestBatchTotal(Math.toIntExact(testBatchMapper.selectCount(
                new LambdaQueryWrapper<RdmTestBatch>().eq(RdmTestBatch::getReqId, projectReqIds(projectId)))));
        return s;
    }

    /* ==================== 需求级摘要 ==================== */

    /**
     * 需求级摘要 —— 供需求详情、列表展开行。
     * <p>交付进度以交付项完成数为准（任务完成率仅展示，不作进度口径）。
     */
    public RequirementSummary getRequirementSummary(Long reqId) {
        RequirementSummary s = new RequirementSummary();
        s.setReqId(reqId);
        s.setComputedAt(LocalDateTime.now());
        if (reqId == null) {
            return s;
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getReqId, reqId));
        int itemCompleted = 0, blocked = 0;
        for (RdmDeliveryItem item : items) {
            if (RdmConstants.DI_DONE.equals(item.getStatus())) {
                itemCompleted++;
            }
            blocked += scheduleService.getBlockedTasks(item.getId()).size();
        }
        s.setDeliveryItemTotal(items.size());
        s.setDeliveryItemCompleted(itemCompleted);
        s.setBlockerCount(blocked);

        s.setTaskTotal(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId).ne(RdmWorkTask::getStatus, "cancelled"))));
        s.setTaskCompleted(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId).eq(RdmWorkTask::getStatus, "done"))));

        s.setTestStatus(deriveTestStatus(reqId));
        s.setAcceptanceStatus(deriveAcceptanceStatus(reqId));
        return s;
    }

    /* ==================== 交付项级摘要 ==================== */

    /**
     * 交付项级摘要 —— 供交付项详情、发布批次闸门预览。
     */
    public DeliveryItemSummary getDeliveryItemSummary(Long deliveryItemId) {
        DeliveryItemSummary s = new DeliveryItemSummary();
        s.setDeliveryItemId(deliveryItemId);
        s.setComputedAt(LocalDateTime.now());
        if (deliveryItemId == null) {
            return s;
        }
        RdmDeliveryItem item = deliveryItemMapper.selectById(deliveryItemId);
        if (item != null) {
            s.setScopeVersion(item.getScopeVersion() == null ? 0 : item.getScopeVersion());
            s.setScopeFrozen(item.getScopeFrozenAt() != null);
        }
        s.setTaskTotal(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).ne(RdmWorkTask::getStatus, "cancelled"))));
        s.setTaskCompleted(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).eq(RdmWorkTask::getStatus, "done"))));
        s.setTaskInProgress(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).eq(RdmWorkTask::getStatus, "doing"))));

        s.setLatestTestBatchStatus(latestTestBatchStatus(deliveryItemId));

        s.setAcceptanceTotal(Math.toIntExact(acceptanceMapper.selectCount(
                new LambdaQueryWrapper<RdmAcceptanceRecord>()
                        .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId))));
        s.setAcceptancePassed(Math.toIntExact(acceptanceMapper.selectCount(
                new LambdaQueryWrapper<RdmAcceptanceRecord>()
                        .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId)
                        .eq(RdmAcceptanceRecord::getConclusion, RdmConstants.ACCEPT_PASS))));

        s.setIssueOpenCount(Math.toIntExact(issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getDeliveryItemId, deliveryItemId)
                .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES))));

        s.setDependencyBlockCount(scheduleService.getBlockedTasks(deliveryItemId).size());
        return s;
    }

    /* ==================== 个人工作台摘要 ==================== */

    /**
     * 个人工作台摘要 —— 我参与的项目、待办任务、需处理交付项与临期节点。
     */
    public WorkbenchSummary getWorkbenchSummary(Long userId) {
        WorkbenchSummary s = new WorkbenchSummary();
        s.setComputedAt(LocalDateTime.now());
        s.setProjects(new ArrayList<>());
        if (userId == null) {
            return s;
        }
        List<Long> projectIds = joinedProjectIds(userId);
        s.setMyProjectCount(projectIds.size());

        s.setMyPendingTaskCount(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, userId)
                .in(RdmWorkTask::getStatus, List.of("todo", "doing", "blocked")))));

        s.setMyDeliveryItemCount(Math.toIntExact(deliveryItemMapper.selectCount(
                new LambdaQueryWrapper<RdmDeliveryItem>()
                        .eq(RdmDeliveryItem::getCoordinatorUserId, userId)
                        .in(RdmDeliveryItem::getStatus, RdmConstants.DI_ACTIVE_STATUSES))));

        LocalDate today = LocalDate.now();
        LocalDate horizon = today.plusDays(UPCOMING_DAYS);
        s.setUpcomingDeadlineCount(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, userId)
                .in(RdmWorkTask::getStatus, List.of("todo", "doing", "blocked"))
                .isNotNull(RdmWorkTask::getPlanFinishDate)
                .ge(RdmWorkTask::getPlanFinishDate, today)
                .le(RdmWorkTask::getPlanFinishDate, horizon))));

        for (Long pid : projectIds) {
            RdmProject p = projectMapper.selectById(pid);
            if (p == null) {
                continue;
            }
            List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                    new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, pid));
            ProjectBrief brief = new ProjectBrief();
            brief.setProjectId(p.getId());
            brief.setProjectName(p.getName());
            brief.setStatus(p.getStatus());
            brief.setDeliveryItemTotal(items.size());
            brief.setDeliveryItemCompleted((int) items.stream()
                    .filter(i -> RdmConstants.DI_DONE.equals(i.getStatus())).count());
            s.getProjects().add(brief);
        }
        return s;
    }

    /* ==================== 项目列表统计卡 ==================== */

    /**
     * 项目列表统计卡 —— 跟随筛选条件（用户范围 / 状态 / 关键字）。
     * <p>与列表取数同一套过滤条件，避免"卡片显示全量、列表已筛选"的口径错位。
     */
    public ProjectListStats getProjectListStats(Long userId, String statusFilter, String keyword) {
        ProjectListStats s = new ProjectListStats();
        s.setComputedAt(LocalDateTime.now());

        LambdaQueryWrapper<RdmProject> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(statusFilter)) {
            wrapper.eq(RdmProject::getStatus, statusFilter.trim());
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(RdmProject::getName, kw).or().like(RdmProject::getProjectNo, kw));
        }
        if (userId != null) {
            List<Long> joined = joinedProjectIds(userId);
            if (joined.isEmpty()) {
                return s;
            }
            wrapper.in(RdmProject::getId, joined);
        }
        List<RdmProject> projects = projectMapper.selectList(wrapper);
        s.setTotalProjects(projects.size());

        int active = 0, completed = 0, paused = 0;
        for (RdmProject p : projects) {
            if (RdmConstants.PROJECT_ALL_DELIVERED.equals(p.getStatus())
                    || RdmConstants.PROJECT_CLOSED.equals(p.getStatus())) {
                completed++;
            } else if (RdmConstants.PROJECT_ACTIVE_STATUSES.contains(p.getStatus())) {
                active++;
            }
            if (Integer.valueOf(1).equals(p.getPausedFlag())) {
                paused++;
            }
        }
        s.setActiveProjects(active);
        s.setCompletedProjects(completed);
        s.setPausedProjects(paused);

        List<Long> ids = projects.stream().map(RdmProject::getId).filter(Objects::nonNull).toList();
        if (!ids.isEmpty()) {
            List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                    new LambdaQueryWrapper<RdmDeliveryItem>().in(RdmDeliveryItem::getProjectId, ids));
            s.setTotalDeliveryItems(items.size());
            s.setBlockedCount((int) items.stream()
                    .filter(i -> Integer.valueOf(1).equals(i.getBlockedFlag())).count());
        }
        return s;
    }

    /* ==================== 内部工具 ==================== */

    /** 我参与（在途）的项目ID集合 */
    private List<Long> joinedProjectIds(Long userId) {
        return memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .eq(RdmProjectMember::getUserId, userId)
                        .isNull(RdmProjectMember::getLeaveTime))
                .stream().map(RdmProjectMember::getProjectId).filter(Objects::nonNull).distinct().toList();
    }

    /** 项目下所有需求ID（用于测试批次口径收敛） */
    private List<Long> projectReqIds(Long projectId) {
        List<Long> reqIds = requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .eq(RdmRequirement::getProjectId, projectId))
                .stream().map(RdmRequirement::getId).filter(Objects::nonNull).toList();
        return reqIds.isEmpty() ? List.of(-1L) : reqIds;
    }

    /** 需求测试状态：none/in_progress/passed/failed（取该需求最新一批测试批次的口径） */
    private String deriveTestStatus(Long reqId) {
        List<RdmTestBatch> batches = testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                .eq(RdmTestBatch::getReqId, reqId)
                .orderByDesc(RdmTestBatch::getId));
        if (batches.isEmpty()) {
            return "none";
        }
        String status = batches.get(0).getStatus();
        if (RdmConstants.TB_PASSED.equals(status)) {
            return "passed";
        }
        if (RdmConstants.TB_FAILED.equals(status) || RdmConstants.TB_RETURNED.equals(status)) {
            return "failed";
        }
        return "in_progress";
    }

    /** 需求验收状态：none/pending/passed/rejected（有一条通过即通过，有驳回即驳回，其余待验收） */
    private String deriveAcceptanceStatus(Long reqId) {
        List<RdmAcceptanceRecord> records = acceptanceMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>().eq(RdmAcceptanceRecord::getReqId, reqId));
        if (records.isEmpty()) {
            return "none";
        }
        boolean anyPass = records.stream().anyMatch(r -> RdmConstants.ACCEPT_PASS.equals(r.getConclusion()));
        boolean anyFail = records.stream().anyMatch(r -> RdmConstants.ACCEPT_FAIL.equals(r.getConclusion()));
        if (anyFail) {
            return "rejected";
        }
        if (anyPass) {
            return "passed";
        }
        // 已提交但结论非通过/驳回（如 conditional），或全部尚未签署，均视为待验收
        return "pending";
    }

    /** 交付项最新提测批次状态：由测试执行记录回溯最近一批 */
    private String latestTestBatchStatus(Long deliveryItemId) {
        List<RdmTestExecution> execs = testExecutionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                .eq(RdmTestExecution::getDeliveryItemId, deliveryItemId)
                .orderByDesc(RdmTestExecution::getRoundNo)
                .orderByDesc(RdmTestExecution::getId));
        Long batchId = execs.stream().map(RdmTestExecution::getBatchId).filter(Objects::nonNull).findFirst().orElse(null);
        if (batchId == null) {
            return "none";
        }
        RdmTestBatch batch = testBatchMapper.selectById(batchId);
        return batch == null || batch.getStatus() == null ? "none" : batch.getStatus();
    }

    /** 空集合会让 IN () 生成非法 SQL 或全表命中，用 -1 占位保证命中空集 */
    private static List<Long> inIds(List<Long> ids) {
        return ids == null || ids.isEmpty() ? List.of(-1L) : ids;
    }

    /* ==================== DTO ==================== */

    /** 项目级摘要 */
    @Data
    public static class ProjectSummary {
        private Long projectId;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        private int deliveryItemInProgress;
        private int requirementTotal;
        private int taskTotal;
        private int taskCompleted;
        private int taskInProgress;
        private int issueOpen;
        private int issueCritical;
        private int testBatchTotal;
        private int acceptancePending;
        private int blockedTaskCount;
        private LocalDateTime computedAt;
    }

    /** 需求级摘要 */
    @Data
    public static class RequirementSummary {
        private Long reqId;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        private int taskTotal;
        private int taskCompleted;
        /** none/in_progress/passed/failed */
        private String testStatus;
        /** none/pending/passed/rejected */
        private String acceptanceStatus;
        private int blockerCount;
        private LocalDateTime computedAt;
    }

    /** 交付项级摘要 */
    @Data
    public static class DeliveryItemSummary {
        private Long deliveryItemId;
        private int taskTotal;
        private int taskCompleted;
        private int taskInProgress;
        private String latestTestBatchStatus;
        private int acceptanceTotal;
        private int acceptancePassed;
        private int issueOpenCount;
        private int dependencyBlockCount;
        private int scopeVersion;
        private boolean scopeFrozen;
        private LocalDateTime computedAt;
    }

    /** 个人工作台摘要 */
    @Data
    public static class WorkbenchSummary {
        private int myProjectCount;
        private int myPendingTaskCount;
        private int myDeliveryItemCount;
        private int upcomingDeadlineCount;
        private List<ProjectBrief> projects;
        private LocalDateTime computedAt;
    }

    /** 工作台项目简报 */
    @Data
    public static class ProjectBrief {
        private Long projectId;
        private String projectName;
        private String status;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
    }

    /** 项目列表统计卡 */
    @Data
    public static class ProjectListStats {
        private int totalProjects;
        private int activeProjects;
        private int completedProjects;
        private int pausedProjects;
        private int totalDeliveryItems;
        private int blockedCount;
        private LocalDateTime computedAt;
    }
}
