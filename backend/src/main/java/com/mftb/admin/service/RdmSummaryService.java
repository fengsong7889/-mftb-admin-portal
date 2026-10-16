package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * RDM 统一摘要服务（Batch 2 / Phase 1B；任务22 收敛到统一事实源）。
 *
 * <p><b>任务22 的定位变化</b>：本类过去自带一套统计口径与一套数据范围口径，与
 * {@link RdmProjectService} 的那一套并存，于是同一个事实能算出两个数字。现在本类<b>不再自行统计</b>，
 * 一律委派 {@link RdmProjectFactService}（唯一权威事实源），只负责把事实投影成各页面需要的摘要形状。
 * 因此「项目摘要 = 项目详情 = 统计卡 = 导出 = 对账」是结构性质，不依赖各处「记得用同一个条件」。
 *
 * <p>保留在本类的只有<b>需求维度</b>与<b>单交付项维度</b>的细粒度摘要（事实源以项目为聚合单位，
 * 这两级比它更细），且它们的测试/验收结论同样改为消费任务20 的权威判定，不再自行推导。
 *
 * <p>本次落地的口径修复：
 * <ul>
 *   <li><b>mine 不退化全量（A.2）</b>：所有入口都接收 {@code currentUserId} 并交由事实源做 fail-closed 收敛；
 *       旧 {@code getProjectListStats} 写的是 {@code if (userId != null) {收敛}}，
 *       userId 为 null 时直接查全表 —— 那不是「匿名看全部」，那是越权。</li>
 *   <li><b>关闭项目 ≠ 交付完成（A.5）</b>：{@link ProjectListStats#getCompletedProjects()} 只认
 *       {@code status=all_delivered}；已关闭数单列 {@link ProjectListStats#getClosedProjects()}。
 *       旧实现把 closed 併入 completed，等于「归档就算交付完成」。</li>
 *   <li><b>不混算历史验收（A.5）</b>：验收计数只统计交付项<b>当前 scopeVersion</b> 的记录，
 *       并新增 {@code productAcceptancePassed}/{@code bizAcceptancePassed} 直接承载任务20 的权威结论。
 *       旧 {@code getDeliveryItemSummary} 用 {@code count(conclusion=pass)} 跨全部版本统计，
 *       范围改过之后旧版本的 pass 仍被计入。</li>
 *   <li><b>不由任务/交付状态推导（A.5）</b>：需求测试状态改为「该需求下全部交付项
 *       {@link RdmTestBatchService#isTestPassed} 均为真」才算 passed；需求验收状态过滤掉旧 scopeVersion 的结论。</li>
 *   <li><b>行级待裁决 = 卡片待裁决（A.5）</b>：两者同源于事实源，不再出现行级硬编码 0。</li>
 *   <li><b>资源守卫（A.6）</b>：项目摘要过 {@link RdmProjectFactService#requireProjectVisible}，
 *       需求摘要过任务19 {@link RdmAccessGuard#requireVisible}，交付项摘要按其所属项目过守卫。</li>
 * </ul>
 *
 * <p>范围未确定（尚无交付项）时计数返回 0，由前端决定是否显示「範圍未確定」占位；
 * 本服务不用 -1/null 表达「未定义」，以免各处判空口径不一。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmSummaryService {

    /** 工作台"临期"窗口（天） */
    private static final int UPCOMING_DAYS = 7;

    private static final String TASK_STATUS_DONE = "done";
    private static final String TASK_STATUS_DOING = "doing";
    private static final String TASK_STATUS_CANCELLED = "cancelled";

    /** 统一权威事实源（任务22 A.1）：本类不再自行统计项目维度数字 */
    private final RdmProjectFactService factService;
    private final RdmProjectMapper projectMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmTestExecutionMapper testExecutionMapper;
    private final RdmAcceptanceRecordMapper acceptanceMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmScheduleServiceImpl scheduleService;
    /** 任务20 权威门禁事实：测试是否通过 */
    private final RdmTestBatchService testBatchService;
    /** 任务20 权威门禁事实：产品/业务验收是否通过（当前 scopeVersion、失效证据已过滤） */
    private final RdmAcceptanceRecordService acceptanceRecordService;
    /** 任务19 需求维度读守卫 */
    private final RdmAccessGuard accessGuard;

    /* ==================== 项目级摘要 ==================== */

    /**
     * 项目级摘要 —— 供详情页、导出、工作台复用。
     *
     * <p>全部计数来自 {@link RdmProjectFactService#projectFact}，与统计卡/列表行/导出/对账同源。
     *
     * @param currentUserId 认证主体 {@code SysUser.id}；为 null 时按 fail-closed 拒绝（不退化全量）
     * @throws BusinessException 未登录、项目不存在或越权访问他项目数据
     */
    public ProjectSummary getProjectSummary(Long projectId, Long currentUserId) {
        RdmFactVO.ProjectFact fact = factService.projectFact(projectId, currentUserId);
        ProjectSummary s = new ProjectSummary();
        s.setProjectId(projectId);
        s.setComputedAt(LocalDateTime.now());
        if (fact == null) {
            return s;
        }
        s.setDeliveryItemTotal(fact.getDeliveryItemTotal());
        s.setDeliveryItemCompleted(fact.getDeliveryItemCompleted());
        s.setDeliveryItemInProgress(fact.getDeliveryItemInProgress());
        s.setDeliveryItemTesting(fact.getDeliveryItemTesting());
        s.setDeliveryItemBlocked(fact.getDeliveryItemBlocked());
        s.setDeliveryItemOverdue(fact.getDeliveryItemOverdue());
        s.setRequirementTotal(fact.getRequirementTotal());
        s.setTaskTotal(fact.getTaskTotal());
        s.setTaskCompleted(fact.getTaskCompleted());
        s.setTaskInProgress(fact.getTaskInProgress());
        s.setBlockedTaskCount(fact.getBlockedTaskCount());
        s.setIssueOpen(fact.getIssueOpen());
        s.setIssueCritical(fact.getIssueCritical());
        s.setIssueMajor(fact.getIssueMajor());
        s.setTestBatchTotal(fact.getTestBatchTotal());
        // 行级待裁决与卡片同口径：同源于事实源，绝不硬编码 0
        s.setPendingDecisionCount(fact.getPendingDecisionCount());
        s.setDeferResidualCount(fact.getDeferResidualCount());
        s.setTestPassedItemCount(fact.getTestPassedItemCount());
        s.setProductAcceptedItemCount(fact.getProductAcceptedItemCount());
        s.setBizAcceptedItemCount(fact.getBizAcceptedItemCount());
        // 关闭 ≠ 交付完成：两个独立布尔，绝不互相推导
        s.setAllDelivered(fact.isAllDelivered());
        s.setClosed(fact.isClosed());
        s.setTodoTotal(fact.getTodoTotal());
        s.setTodoMineCount(fact.getTodoMineCount());
        s.setTodoWaitingOthersCount(fact.getTodoWaitingOthersCount());
        s.setTodoUnassignedCount(fact.getTodoUnassignedCount());
        s.setNextDeliveryDate(fact.getNextDeliveryDate());
        s.setActionUrl(fact.getActionUrl());

        // 待签署验收单数：只统计当前 scopeVersion 的记录，历史版本的验收不再混算
        List<RdmDeliveryItem> items = projectDeliveryItems(projectId);
        Map<Long, Integer> currentVersionByItem = currentScopeVersionByItem(items);
        List<Long> itemIds = idsOf(items);
        int acceptancePending = 0;
        if (!itemIds.isEmpty()) {
            for (RdmAcceptanceRecord record : acceptanceMapper.selectList(
                    new LambdaQueryWrapper<RdmAcceptanceRecord>()
                            .in(RdmAcceptanceRecord::getDeliveryItemId, itemIds)
                            .isNull(RdmAcceptanceRecord::getConclusion))) {
                if (isCurrentScope(record, currentVersionByItem)) {
                    acceptancePending++;
                }
            }
        }
        s.setAcceptancePending(acceptancePending);
        return s;
    }

    /* ==================== 需求级摘要 ==================== */

    /**
     * 需求级摘要 —— 供需求详情、列表展开行。
     * <p>交付进度以交付项完成数为准（任务完成率仅展示，不作进度口径）。
     *
     * @param currentUserId 认证主体；用于任务19 的需求读守卫（越权直接拒绝）
     */
    public RequirementSummary getRequirementSummary(Long reqId, Long currentUserId) {
        // A.6 资源守卫：复用任务19 既有读守卫，不自行放宽（全量授权或与该需求相关才放行）
        accessGuard.requireVisible(reqId, "查看需求摘要");
        RequirementSummary s = new RequirementSummary();
        s.setReqId(reqId);
        s.setComputedAt(LocalDateTime.now());
        if (reqId == null) {
            return s;
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getReqId, reqId));
        int itemCompleted = 0;
        int blocked = 0;
        for (RdmDeliveryItem item : items) {
            if (RdmConstants.DI_DONE.equals(item.getStatus())) {
                itemCompleted++;
            }
            blocked += scheduleService.getBlockedTasks(item.getId()).size();
        }
        s.setDeliveryItemTotal(items.size());
        s.setDeliveryItemCompleted(itemCompleted);
        s.setBlockerCount(blocked);

        List<Long> itemIds = idsOf(items);
        if (itemIds.isEmpty()) {
            s.setTaskTotal(0);
            s.setTaskCompleted(0);
        } else {
            s.setTaskTotal(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                    .in(RdmWorkTask::getDeliveryItemId, itemIds).ne(RdmWorkTask::getStatus, TASK_STATUS_CANCELLED))));
            s.setTaskCompleted(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                    .in(RdmWorkTask::getDeliveryItemId, itemIds).eq(RdmWorkTask::getStatus, TASK_STATUS_DONE))));
        }

        s.setTestStatus(deriveTestStatus(reqId, items));
        s.setAcceptanceStatus(deriveAcceptanceStatus(reqId, items));
        return s;
    }

    /* ==================== 交付项级摘要 ==================== */

    /**
     * 交付项级摘要 —— 供交付项详情、发布批次闸门预览。
     *
     * <p><b>资源守卫（A.6）</b>：按交付项所属项目校验，非项目成员（且非全量授权者）不得查看他项目数据。
     * <p><b>不混算历史验收（A.5）</b>：{@code acceptanceTotal}/{@code acceptancePassed} 只统计
     * 交付项<b>当前 scopeVersion</b> 的验收记录；权威通过与否另由
     * {@code productAcceptancePassed}/{@code bizAcceptancePassed} 承载任务20 的判定结果。
     */
    public DeliveryItemSummary getDeliveryItemSummary(Long deliveryItemId, Long currentUserId) {
        RdmDeliveryItem item = deliveryItemId == null ? null : deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            throw new BusinessException("交付項不存在或已刪除");
        }
        if (item.getProjectId() != null) {
            factService.requireProjectVisible(item.getProjectId(), currentUserId);
        } else {
            // 未归属项目的交付项按其需求做读守卫，绝不因为「查不到项目」就放行
            accessGuard.requireVisible(item.getReqId(), "查看交付項摘要");
        }

        DeliveryItemSummary s = new DeliveryItemSummary();
        s.setDeliveryItemId(deliveryItemId);
        s.setComputedAt(LocalDateTime.now());
        Integer scopeVersion = item.getScopeVersion();
        s.setScopeVersion(scopeVersion == null ? 0 : scopeVersion);
        s.setScopeFrozen(item.getScopeFrozenAt() != null);

        s.setTaskTotal(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).ne(RdmWorkTask::getStatus, TASK_STATUS_CANCELLED))));
        s.setTaskCompleted(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).eq(RdmWorkTask::getStatus, TASK_STATUS_DONE))));
        s.setTaskInProgress(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId).eq(RdmWorkTask::getStatus, TASK_STATUS_DOING))));

        s.setLatestTestBatchStatus(latestTestBatchStatus(deliveryItemId));

        // A.5：验收记录只统计当前 scopeVersion —— 旧版本的 pass/fail 都不是「现在」的验收事实
        List<RdmAcceptanceRecord> records = acceptanceMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>()
                        .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId));
        int total = 0;
        int passed = 0;
        for (RdmAcceptanceRecord record : records) {
            if (record == null || !sameScope(record.getScopeVersion(), scopeVersion)) {
                continue;
            }
            total++;
            if (RdmConstants.ACCEPT_PASS.equals(record.getConclusion())) {
                passed++;
            }
        }
        s.setAcceptanceTotal(total);
        s.setAcceptancePassed(passed);
        // A.5：权威结论直接消费任务20，绝不由交付项状态推导
        s.setTestPassed(testBatchService.isTestPassed(deliveryItemId));
        s.setProductAcceptancePassed(acceptanceRecordService.hasProductAcceptancePassed(deliveryItemId, scopeVersion));
        s.setBizAcceptancePassed(acceptanceRecordService.hasBizAcceptancePassed(deliveryItemId, scopeVersion));

        s.setIssueOpenCount(Math.toIntExact(countOpenIssues(List.of(deliveryItemId))));
        s.setDependencyBlockCount(scheduleService.getBlockedTasks(deliveryItemId).size());
        s.setActionUrl(RdmConstants.deliveryItemRoute(deliveryItemId));
        return s;
    }

    /* ==================== 个人工作台摘要 ==================== */

    /**
     * 个人工作台摘要 —— 我参与的项目、待办（去重后分三桶）、需处理交付项与临期节点。
     *
     * <p><b>fail-closed（A.2）</b>：{@code userId==null} 时返回空摘要，绝不退化为全量。
     * <p><b>待办去重 + 等待他人（A.3）</b>：{@code todoTotal} 来自 {@link RdmTodoBoardService} 去重后的看板，
     * 且区分「待我处理 / 等待他人 / 未指派」，不再把别人该做的事算成我的待办。
     */
    public WorkbenchSummary getWorkbenchSummary(Long userId) {
        WorkbenchSummary s = new WorkbenchSummary();
        s.setComputedAt(LocalDateTime.now());
        s.setProjects(new ArrayList<>());
        if (userId == null) {
            log.debug("工作台摘要 fail-closed：未取得认证主体，返回空摘要（不退化全量）");
            return s;
        }
        // 待办看板：跨项目视角，范围已由事实源收敛为「我参与的项目」
        RdmFactVO.TodoBoard board = factService.todoBoard(null, userId);
        s.setTodoTotal(board.getTotal());
        s.setTodoMineCount(board.getMineCount());
        s.setTodoWaitingOthersCount(board.getWaitingOthersCount());
        s.setTodoUnassignedCount(board.getUnassignedCount());
        s.setTodos(board.getTodos());

        RdmFactVO.Scope scope = factService.resolveScope(userId);
        List<Long> projectIds = scope.getProjectIds() == null ? List.of() : scope.getProjectIds();
        s.setMyProjectCount(projectIds.size());

        s.setMyPendingTaskCount(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, userId)
                .in(RdmWorkTask::getStatus, List.of("todo", TASK_STATUS_DOING, "blocked")))));

        s.setMyDeliveryItemCount(Math.toIntExact(deliveryItemMapper.selectCount(
                new LambdaQueryWrapper<RdmDeliveryItem>()
                        .eq(RdmDeliveryItem::getCoordinatorUserId, userId)
                        .in(RdmDeliveryItem::getStatus, RdmConstants.DI_ACTIVE_STATUSES))));

        LocalDate today = LocalDate.now();
        LocalDate horizon = today.plusDays(UPCOMING_DAYS);
        s.setUpcomingDeadlineCount(Math.toIntExact(taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, userId)
                .in(RdmWorkTask::getStatus, List.of("todo", TASK_STATUS_DOING, "blocked"))
                .isNotNull(RdmWorkTask::getPlanFinishDate)
                .ge(RdmWorkTask::getPlanFinishDate, today)
                .le(RdmWorkTask::getPlanFinishDate, horizon))));

        for (Long pid : projectIds) {
            RdmProject p = projectMapper.selectById(pid);
            if (p == null) {
                continue;
            }
            List<RdmDeliveryItem> items = projectDeliveryItems(pid);
            ProjectBrief brief = new ProjectBrief();
            brief.setProjectId(p.getId());
            brief.setProjectName(p.getName());
            brief.setStatus(p.getStatus());
            brief.setDeliveryItemTotal(items.size());
            brief.setDeliveryItemCompleted((int) items.stream()
                    .filter(i -> RdmConstants.DI_DONE.equals(i.getStatus())).count());
            brief.setActionUrl(RdmConstants.projectDetailRoute(p.getId()));
            s.getProjects().add(brief);
        }
        return s;
    }

    /* ==================== 项目列表统计卡 ==================== */

    /**
     * 项目列表统计卡 —— 跟随筛选条件（用户范围 / 状态 / 关键字）。
     *
     * <p>全部计数委派 {@link RdmProjectFactService#cards}，与项目列表行、导出、对账同源，
     * 避免"卡片显示全量、列表已筛选"的口径错位。
     *
     * <p><b>关闭项目 ≠ 交付完成（A.5）</b>：{@code completedProjects} 只认 {@code all_delivered}，
     * {@code closedProjects} 单列。旧实现把两者相加，等于「归档就算交付完成」。
     */
    public ProjectListStats getProjectListStats(Long userId, String statusFilter, String keyword) {
        RdmFactVO.FactQuery query = new RdmFactVO.FactQuery();
        query.setStatus(statusFilter);
        query.setKeyword(keyword);
        query.setIncludeTodos(true);
        RdmFactVO.CardSummary cards = factService.cards(query, userId);

        ProjectListStats s = new ProjectListStats();
        s.setComputedAt(LocalDateTime.now());
        s.setTotalProjects(cards.getTotalProjects());
        s.setActiveProjects(cards.getActiveProjects());
        s.setInProgressCount(cards.getInProgressCount());
        s.setAttentionCount(cards.getAttentionCount());
        // 关闭不计入交付完成
        s.setCompletedProjects(cards.getAllDeliveredProjects());
        s.setAllDeliveredProjects(cards.getAllDeliveredProjects());
        s.setClosedProjects(cards.getClosedProjects());
        s.setPausedProjects(cards.getPausedProjects());
        s.setTotalDeliveryItems(cards.getTotalDeliveryItems());
        s.setDeliveredItems(cards.getDeliveredItems());
        s.setBlockedCount(cards.getBlockedCount());
        s.setPendingDecisionCount(cards.getPendingDecisionCount());
        s.setDeferResidualCount(cards.getDeferResidualCount());
        s.setTestPassedItemCount(cards.getTestPassedItemCount());
        s.setProductAcceptedItemCount(cards.getProductAcceptedItemCount());
        s.setBizAcceptedItemCount(cards.getBizAcceptedItemCount());
        s.setIssueOpen(cards.getIssueOpen());
        s.setIssueCritical(cards.getIssueCritical());
        s.setTodoTotal(cards.getTodoTotal());
        s.setTodoMineCount(cards.getTodoMineCount());
        s.setTodoWaitingOthersCount(cards.getTodoWaitingOthersCount());
        s.setTodoUnassignedCount(cards.getTodoUnassignedCount());
        return s;
    }

    /* ==================== 内部工具 ==================== */

    private List<RdmDeliveryItem> projectDeliveryItems(Long projectId) {
        if (projectId == null) {
            return List.of();
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, projectId));
        return items == null ? List.of() : items;
    }

    private static List<Long> idsOf(List<RdmDeliveryItem> items) {
        return items.stream().map(RdmDeliveryItem::getId).filter(Objects::nonNull).toList();
    }

    private static Map<Long, Integer> currentScopeVersionByItem(List<RdmDeliveryItem> items) {
        Map<Long, Integer> map = new HashMap<>();
        for (RdmDeliveryItem item : items) {
            if (item != null && item.getId() != null) {
                map.put(item.getId(), item.getScopeVersion());
            }
        }
        return map;
    }

    /** 记录是否属于其交付项的当前 scopeVersion（历史版本的验收不参与统计） */
    private static boolean isCurrentScope(RdmAcceptanceRecord record, Map<Long, Integer> currentVersionByItem) {
        if (record == null || record.getDeliveryItemId() == null) {
            return false;
        }
        return sameScope(record.getScopeVersion(), currentVersionByItem.get(record.getDeliveryItemId()));
    }

    /**
     * 范围版本是否一致。
     * <p>任一侧为 null 时按「未启用范围版本管理」处理并视为一致 —— 存量数据大量为 null，
     * 若按不等处理会把全部历史验收一刀切成 0，那是另一种错。
     */
    private static boolean sameScope(Integer recordVersion, Integer currentVersion) {
        if (recordVersion == null || currentVersion == null) {
            return true;
        }
        return recordVersion.intValue() == currentVersion.intValue();
    }

    /** 未决问题数（集合条件 + 空集合守卫，空集合直接为 0 且不发 SQL） */
    private long countOpenIssues(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return 0L;
        }
        Long count = issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                .in(RdmIssue::getDeliveryItemId, itemIds)
                .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES));
        return count == null ? 0L : count;
    }

    /**
     * 需求测试状态：none/in_progress/passed/failed。
     *
     * <p><b>A.5：不由任务状态推导测试通过</b>。有交付项时，passed 当且仅当
     * <b>全部</b>交付项的任务20 权威判定 {@link RdmTestBatchService#isTestPassed} 为真
     * （有效批次 + 当前冻结轮次 + 必测用例全 pass + 无 critical/major 未闭环）；
     * 无交付项时才回落到「最新一批提测批次的状态」这一展示口径。
     */
    private String deriveTestStatus(Long reqId, List<RdmDeliveryItem> items) {
        if (items != null && !items.isEmpty()) {
            boolean anyBatch = false;
            boolean allPassed = true;
            for (RdmDeliveryItem item : items) {
                if (item == null || item.getId() == null) {
                    continue;
                }
                anyBatch = true;
                if (!testBatchService.isTestPassed(item.getId())) {
                    allPassed = false;
                }
            }
            if (anyBatch && allPassed) {
                return "passed";
            }
            List<RdmTestBatch> batches = reqId == null ? List.of() : testBatchMapper.selectList(
                    new LambdaQueryWrapper<RdmTestBatch>().eq(RdmTestBatch::getReqId, reqId));
            if (batches.isEmpty()) {
                return anyBatch ? "in_progress" : "none";
            }
            boolean anyFailed = batches.stream().anyMatch(b ->
                    RdmConstants.TB_FAILED.equals(b.getStatus()) || RdmConstants.TB_RETURNED.equals(b.getStatus()));
            return anyFailed ? "failed" : "in_progress";
        }
        if (reqId == null) {
            return "none";
        }
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

    /**
     * 需求验收状态：none/pending/passed/rejected。
     *
     * <p><b>A.5：不混算历史验收</b>。旧实现对该需求的<b>全部</b>验收记录做
     * {@code anyMatch(conclusion=pass)}，范围变更之后旧版本的 pass 依然让需求显示"已验收"。
     * 现在只统计<b>当前 scopeVersion</b>（该需求下交付项的最大范围版本）的记录。
     */
    private String deriveAcceptanceStatus(Long reqId, List<RdmDeliveryItem> items) {
        if (reqId == null) {
            return "none";
        }
        Integer currentVersion = currentScopeVersionOf(items);
        List<RdmAcceptanceRecord> records = acceptanceMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>().eq(RdmAcceptanceRecord::getReqId, reqId));
        List<RdmAcceptanceRecord> current = records.stream()
                .filter(r -> r != null && sameScope(r.getScopeVersion(), currentVersion))
                .toList();
        if (current.isEmpty()) {
            return "none";
        }
        boolean anyFail = current.stream().anyMatch(r -> RdmConstants.ACCEPT_FAIL.equals(r.getConclusion()));
        boolean anyPass = current.stream().anyMatch(r -> RdmConstants.ACCEPT_PASS.equals(r.getConclusion()));
        if (anyFail) {
            return "rejected";
        }
        if (anyPass) {
            return "passed";
        }
        // 已提交但结论非通过/驳回（如 conditional），或全部尚未签署，均视为待验收
        return "pending";
    }

    /** 该需求下交付项的当前范围版本（取最大值；全部为 null 时返回 null 表示未启用范围版本管理） */
    private static Integer currentScopeVersionOf(List<RdmDeliveryItem> items) {
        Integer max = null;
        for (RdmDeliveryItem item : items == null ? List.<RdmDeliveryItem>of() : items) {
            if (item == null || item.getScopeVersion() == null) {
                continue;
            }
            if (max == null || item.getScopeVersion() > max) {
                max = item.getScopeVersion();
            }
        }
        return max;
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

    /* ==================== DTO ==================== */

    /** 项目级摘要（全部计数与统计卡/列表行/导出/对账同源于 {@link RdmProjectFactService}） */
    @Data
    public static class ProjectSummary {
        private Long projectId;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        private int deliveryItemInProgress;
        private int deliveryItemTesting;
        private int deliveryItemBlocked;
        private int deliveryItemOverdue;
        private int requirementTotal;
        private int taskTotal;
        private int taskCompleted;
        private int taskInProgress;
        private int issueOpen;
        private int issueCritical;
        private int issueMajor;
        private int testBatchTotal;
        private int acceptancePending;
        private int blockedTaskCount;
        /** 待裁决（未决问题）：与统计卡同口径，不再硬编码 0 */
        private int pendingDecisionCount;
        /** 原范围延期残余（旧 scopeVersion 下已批准延期且承接未闭环） */
        private int deferResidualCount;
        private int testPassedItemCount;
        private int productAcceptedItemCount;
        private int bizAcceptedItemCount;
        /** 交付完成（status=all_delivered）。<b>与 {@link #closed} 互不推导。</b> */
        private boolean allDelivered;
        /** 已关闭（status=closed）。关闭只是归档动作，<b>不代表交付完成</b>。 */
        private boolean closed;
        /** 去重后的待办总数（= mine + waitingOthers + unassigned） */
        private int todoTotal;
        private int todoMineCount;
        private int todoWaitingOthersCount;
        private int todoUnassignedCount;
        private String nextDeliveryDate;
        /** 前端已注册路由 */
        private String actionUrl;
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
        /** none/in_progress/passed/failed（passed 只认任务20 权威判定，不由任务状态推导） */
        private String testStatus;
        /** none/pending/passed/rejected（只统计当前 scopeVersion，不混算历史验收） */
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
        /** 当前 scopeVersion 的验收记录数（历史版本不计入） */
        private int acceptanceTotal;
        /** 当前 scopeVersion 结论为 pass 的验收记录数（历史版本不计入） */
        private int acceptancePassed;
        /** 任务20 权威判定：测试是否通过（有效批次 + 当前冻结轮次 + 必测全 pass） */
        private boolean testPassed;
        /** 任务20 权威判定：产品验收是否通过（当前 scopeVersion 最新有效结论=pass） */
        private boolean productAcceptancePassed;
        /** 任务20 权威判定：业务验收是否通过 */
        private boolean bizAcceptancePassed;
        private int issueOpenCount;
        private int dependencyBlockCount;
        private int scopeVersion;
        private boolean scopeFrozen;
        /** 前端已注册路由 */
        private String actionUrl;
        private LocalDateTime computedAt;
    }

    /** 个人工作台摘要（待办已去重并分三桶，mine 不退化全量） */
    @Data
    public static class WorkbenchSummary {
        private int myProjectCount;
        private int myPendingTaskCount;
        private int myDeliveryItemCount;
        private int upcomingDeadlineCount;
        /** 去重后的待办总数（= mine + waitingOthers + unassigned） */
        private int todoTotal;
        /** 待我处理 */
        private int todoMineCount;
        /** 等待他人（责任人是别人，我催而不动手） */
        private int todoWaitingOthersCount;
        /** 未指派 */
        private int todoUnassignedCount;
        /** 待办明细（去重后；actionUrl 均为前端已注册路由） */
        private List<RdmFactVO.Todo> todos = new ArrayList<>();
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
        /** 前端已注册路由 */
        private String actionUrl;
    }

    /** 项目列表统计卡（与事实源统计卡同源） */
    @Data
    public static class ProjectListStats {
        private int totalProjects;
        private int activeProjects;
        /** 进行中（preparing / in_progress） */
        private int inProgressCount;
        /** 需关注（风险 / 逾期 / 暂停 任一命中） */
        private int attentionCount;
        /**
         * 交付完成项目数（status=all_delivered）。
         * <p><b>任务22 口径修复</b>：旧实现把 closed 也计进来，等于「归档就算交付完成」；
         * 现在已关闭数单列 {@link #closedProjects}。字段名沿用旧名以免前端改动，语义以本注释为准。
         */
        private int completedProjects;
        private int allDeliveredProjects;
        /** 已关闭项目数（<b>不计入</b>交付完成） */
        private int closedProjects;
        private int pausedProjects;
        private int totalDeliveryItems;
        private int deliveredItems;
        private int blockedCount;
        /** 待裁决（未决问题）：等于各项目行相加 */
        private int pendingDecisionCount;
        /** 原范围延期残余合计 */
        private int deferResidualCount;
        private int testPassedItemCount;
        private int productAcceptedItemCount;
        private int bizAcceptedItemCount;
        private int issueOpen;
        private int issueCritical;
        private int todoTotal;
        private int todoMineCount;
        private int todoWaitingOthersCount;
        private int todoUnassignedCount;
        private LocalDateTime computedAt;
    }
}
