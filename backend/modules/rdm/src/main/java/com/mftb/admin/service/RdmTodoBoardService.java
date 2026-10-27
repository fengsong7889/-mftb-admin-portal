package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RDM 待办看板事实计算（任务22 A.3 / A.4）。
 *
 * <p>本服务是「待办」这一事实的<b>唯一</b>计算处：项目详情待办、个人工作台待办、全量导出的待办 Sheet、
 * 对账的待办计数、PM 待办通知的收件人解析，全部消费同一个 {@link RdmFactVO.TodoBoard}，
 * 因此「卡片上的待办数」与「展开后的待办行数」结构上不可能不一致。
 *
 * <p>修正的三个历史口径错误：
 * <ol>
 *   <li><b>按分组相加产生重复</b>：旧实现对同一个交付项分别按「未指派 / 阻塞 / 逾期」各产出一条待办，
 *       一个交付项能被计 3 次，待办总数虚高。现在待办按
 *       {@code (objectType, refId, responsibleUserId)} <b>去重</b>，多个成因只作为
 *       {@link RdmFactVO.Todo#getReasons()} 明细；{@link RdmFactVO.TodoBoard#getRawReasonHits()}
 *       保留去重前的命中次数，两者的差值就是被去重掉的重复计数，可被人直接核对。</li>
 *   <li><b>缺「等待他人」</b>：旧实现只有一种视角，责任人是别人的事情也被算进自己的待办数，
 *       于是「待办 12 条」里有 9 条自己什么都做不了。现在分三桶：
 *       {@link RdmConstants#TODO_BUCKET_MINE}（待我处理）/
 *       {@link RdmConstants#TODO_BUCKET_WAITING_OTHERS}（等待他人）/
 *       {@link RdmConstants#TODO_BUCKET_UNASSIGNED}（未指派），三桶<b>互斥且穷尽</b>，
 *       因此 {@code mine + waitingOthers + unassigned == total} 恒成立。</li>
 *   <li><b>路由错误</b>：旧实现把所有待办的 {@code actionUrl} 一律拼成未注册的
 *       {@code /rdm/project/delivery/{id}}（点开即 404），问题(Issue)也套用了交付项地址。
 *       现在一律由 {@link RdmConstants} 的路由构造器拼装<b>前端已注册</b>路径，且按对象类型分流：
 *       问题走 {@code /rdm-issue?id=}，交付项走 {@code /rdm-delivery-item?id=&mode=view}，绝不混用。</li>
 * </ol>
 *
 * <p>本服务<b>只读不写</b>，也不查库（所有事实由 {@link RdmProjectFactService} 一次载入后传入），
 * 因此待办口径与汇总口径共用同一批数据，不会出现「待办查到的问题和卡片查到的问题不是同一批」。
 * 唯一的例外是逾期工作日数，它委托 {@link RdmWorkingDayCalculator} 按<b>责任人真实工作日历</b>计算
 * （含请假/周末支援），而不是简单按周一至周五折算。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTodoBoardService {

    /** 未指派时去重键中的责任人占位（避免 null 让两个未指派待办被当成不同键） */
    private static final String UNASSIGNED_KEY_PART = "0";

    private final RdmWorkingDayCalculator workingDayCalculator;

    /**
     * 待办计算的输入事实（由 {@link RdmProjectFactService} 一次载入后传入，保证与汇总同源）。
     * <p>所有集合均已按<b>数据范围</b>过滤：传进来什么就只能算出什么，本服务不再自行放宽范围。
     */
    @Data
    public static class TodoInput {
        /** 项目ID；null 表示跨项目（我的工作台 / 全量导出）视角 */
        private Long projectId;
        /** 视角所属登录人（认证主体 SysUser.id）；null = 未登录，fail-closed */
        private Long userId;
        /** 是否已取得认证主体；false 时看板恒为空 */
        private boolean authenticated;
        /** 交付项事实（已含 scopeVersion / 责任人 / 测试与验收权威结论） */
        private List<RdmFactVO.ItemFact> items = new ArrayList<>();
        /** 范围内未决问题（{@link RdmConstants#ISSUE_OPEN_STATUSES}） */
        private List<RdmIssue> openIssues = new ArrayList<>();
        /** 范围内「原范围延期残余」延期单（判定口径见 {@link RdmProjectFactService}） */
        private List<RdmIssueDefer> residualDefers = new ArrayList<>();
        /** 范围内项目（用于项目级逾期待办） */
        private List<RdmProject> projects = new ArrayList<>();
        /**
         * issueId → projectId 索引。
         * <p>{@code rdm_issue} <b>没有</b> project_id 列（只有 req_id / delivery_item_id），
         * 项目归属只能由事实服务按交付项/需求回填后传入；本服务不猜、不放宽。
         */
        private Map<Long, Long> projectIdByIssueId = new HashMap<>();
        /** 判定「今天」的基准日；null 取 {@link LocalDate#now()}（测试可注入固定日） */
        private LocalDate today;
    }

    /**
     * 一条待办的「种子」事实（去重前的原始输入）。
     * <p>抽出来是为了让 {@link #addReason} 的参数表可读：调用点只描述「这是什么对象、谁负责、何时到期」，
     * 去重与分桶逻辑集中在一处，不会被 14 个平铺参数打散。
     */
    @Data
    private static class TodoSeed {
        private String objectType;
        private Long refId;
        /** 仅延期残余使用：待办要跳回它所属的问题页 */
        private Long refIssueId;
        private String refNo;
        private String title;
        private Long projectId;
        private Long responsibleUserId;
        private String responsibleName;
        private LocalDate dueDate;
        /** 自然日口径的逾期标记（工作日口径另由 {@link RdmWorkingDayCalculator} 复核） */
        private boolean overdue;
        /**
         * 所属对象的并发版本（任务22 B.2）。
         * <p>待办通知的去重 {@code event_version} 取 {@code VERSION:<refVersion>}，因此版本必须由
         * <b>事实源</b>一路带过来，通知侧绝不另查一次 —— 两处取版本就会出现「看板看到的版本」
         * 与「去重用的版本」不是同一个，导致同一条待办被重复通知或该通知的被抑制。
         */
        private Integer refVersion;
    }

    /**
     * 构建待办看板。
     *
     * <p><b>fail-closed</b>：未登录（{@code authenticated=false} 或 {@code userId=null}）时返回空看板，
     * 绝不把「不知道你是谁」当成「你什么都能看」——那会让 mine 视角退化为全量。
     */
    public RdmFactVO.TodoBoard build(TodoInput input) {
        RdmFactVO.TodoBoard board = new RdmFactVO.TodoBoard();
        board.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        if (input == null) {
            board.setAuthenticated(false);
            return board;
        }
        LocalDate today = input.getToday() == null ? LocalDate.now() : input.getToday();
        board.setProjectId(input.getProjectId());
        board.setUserId(input.getUserId());
        boolean authenticated = input.isAuthenticated() && input.getUserId() != null;
        board.setAuthenticated(authenticated);
        if (!authenticated) {
            log.debug("待办看板 fail-closed：未取得认证主体，返回空看板（不退化全量）");
            return board;
        }

        // 视角登录人显式贯穿到分桶，绝不使用实例级可变状态（本服务是单例 bean，且会被 @Async 线程调用）
        Long viewerId = input.getUserId();

        // 去重容器：同一 (objectType, refId, responsibleUserId) 只保留一条，成因累加到 reasons
        Map<String, RdmFactVO.Todo> deduped = new LinkedHashMap<>();
        int[] rawHits = {0};

        Map<Long, Long> projectIdByItemId = indexProjectIdByItemId(input.getItems());
        collectItemTodos(input, today, viewerId, deduped, rawHits);
        collectIssueTodos(input, today, viewerId, projectIdByItemId, deduped, rawHits);
        collectDeferResidualTodos(input, today, viewerId, projectIdByItemId, deduped, rawHits);
        collectProjectTodos(input, today, viewerId, deduped, rawHits);

        List<RdmFactVO.Todo> todos = new ArrayList<>(deduped.values());
        int mine = 0;
        int waiting = 0;
        int unassigned = 0;
        for (RdmFactVO.Todo todo : todos) {
            String bucket = todo.getBucket() == null ? "" : todo.getBucket();
            if (RdmConstants.TODO_BUCKET_MINE.equals(bucket)) {
                mine++;
            } else if (RdmConstants.TODO_BUCKET_WAITING_OTHERS.equals(bucket)) {
                waiting++;
            } else {
                unassigned++;
            }
        }
        board.setTodos(todos);
        board.setTotal(todos.size());
        board.setMineCount(mine);
        board.setWaitingOthersCount(waiting);
        board.setUnassignedCount(unassigned);
        board.setRawReasonHits(rawHits[0]);
        if (mine + waiting + unassigned != todos.size()) {
            // 三桶互斥且穷尽是本服务的核心不变量；不成立即为实现缺陷，必须暴露而不是静默返回错数
            log.error("待办分桶不互斥或不穷尽: mine={}, waiting={}, unassigned={}, total={}",
                    mine, waiting, unassigned, todos.size());
        }
        return board;
    }

    /* ==================== 交付项待办 ==================== */

    private void collectItemTodos(TodoInput input, LocalDate today, Long viewerId,
                                  Map<String, RdmFactVO.Todo> deduped, int[] rawHits) {
        for (RdmFactVO.ItemFact item : nullSafe(input.getItems())) {
            if (item == null || item.getItemId() == null || item.isDelivered()) {
                continue; // 已交付完成的交付项不产生待办
            }
            // 协调人是「推进这个交付项」的责任人：未指派 / 阻塞 / 逾期 / 测试未通过 都归他
            TodoSeed coordinatorSeed = seed(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, item.getItemId(), null,
                    item.getItemNo(), item.getTitle(), item.getProjectId(), item.getCoordinatorUserId(),
                    item.getCoordinatorUserName(), parseDate(item.getPlanEndDate()), item.isOverdue(),
                    item.getVersion());
            addReason(deduped, rawHits, viewerId, coordinatorSeed, today, itemReasonsForCoordinator(item));

            // 产品验收待签：责任人是产品验收人，不是协调人（协调人催不动验收签字）
            if (isPendingProductAcceptance(item)) {
                TodoSeed productSeed = seed(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, item.getItemId(), null,
                        item.getItemNo(), item.getTitle(), item.getProjectId(), item.getProductAcceptorUserId(),
                        item.getProductAcceptorUserName(), parseDate(item.getPlanEndDate()), false,
                        item.getVersion());
                addReason(deduped, rawHits, viewerId, productSeed, today,
                        List.of(RdmConstants.TODO_REASON_PENDING_PRODUCT_ACCEPTANCE));
            }
            // 业务验收待签：责任人是业务验收人
            if (isPendingBizAcceptance(item)) {
                TodoSeed bizSeed = seed(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, item.getItemId(), null,
                        item.getItemNo(), item.getTitle(), item.getProjectId(), item.getBizAcceptorUserId(),
                        item.getBizAcceptorUserName(), parseDate(item.getPlanEndDate()), false,
                        item.getVersion());
                addReason(deduped, rawHits, viewerId, bizSeed, today,
                        List.of(RdmConstants.TODO_REASON_PENDING_BIZ_ACCEPTANCE));
            }
        }
    }

    /**
     * 协调人视角的成因明细（可多条，但只算一条待办）。
     * <p><b>不包含</b>「原范围延期残余」：那笔欠帐的责任人是延期单承接人（{@code defer.ownerUserId}），
     * 不是协调人，已由 {@link #collectDeferResidualTodos} 单独成条；在这里再记一次会让同一笔欠帐
     * 在两个不同责任人的待办里各出现一次，待办总数重新虚高。残余的<b>呈现</b>由
     * {@link RdmFactVO.ItemFact#getDeferResidualCount()} / {@link RdmFactVO.ProjectFact#getDeferResidualCount()} 承担。
     */
    private List<String> itemReasonsForCoordinator(RdmFactVO.ItemFact item) {
        List<String> reasons = new ArrayList<>();
        if (item.getCoordinatorUserId() == null) {
            reasons.add(RdmConstants.TODO_REASON_UNASSIGNED);
        }
        if (item.isBlocked()) {
            reasons.add(RdmConstants.TODO_REASON_BLOCKED);
        }
        if (item.isOverdue()) {
            reasons.add(RdmConstants.TODO_REASON_OVERDUE);
        }
        if (!item.isTestPassed()) {
            // 测试是否通过是任务20 的权威事实；此处只把它作为待办成因呈现，绝不反过来推导
            reasons.add(RdmConstants.TODO_REASON_TEST_NOT_PASSED);
        }
        if (item.getPendingDecisionCount() > 0) {
            reasons.add(RdmConstants.TODO_REASON_PENDING_DECISION);
        }
        return reasons;
    }

    /**
     * 产品验收是否「待签」。
     * <p>只在交付项已推进到验收/上线环节、且<b>权威验收事实尚未通过</b>时才算待办；
     * 开发中的交付项本来就还没到验收，不能算「验收待办」（否则待办会被还没开始的事情淹没）。
     */
    private boolean isPendingProductAcceptance(RdmFactVO.ItemFact item) {
        return !item.isProductAccepted() && reachedAcceptanceStage(item);
    }

    /** 业务验收是否「待签」（路径A 上线前验、路径B 上线后验都算到达验收环节）。 */
    private boolean isPendingBizAcceptance(RdmFactVO.ItemFact item) {
        return !item.isBizAccepted() && reachedAcceptanceStage(item);
    }

    private boolean reachedAcceptanceStage(RdmFactVO.ItemFact item) {
        return isReachedAcceptanceStage(item);
    }

    /**
     * 交付项是否已推进到验收/上线环节（对外共享的唯一判定处）。
     * <p>待办分桶、交付清单的「验收状态」展示、项目摘要的待签署计数全部调本方法，
     * 避免三处各写一套状态列表现而出现「卡片说待验收、清单说不待」的口径漂移。
     * <p><b>注意</b>：到达验收环节 ≠ 验收通过；通过与否只能由任务20 的
     * {@code hasProductAcceptancePassed}/{@code hasBizAcceptancePassed} 判定，绝不由本方法推导。
     */
    public static boolean isReachedAcceptanceStage(RdmFactVO.ItemFact item) {
        if (item == null) {
            return false;
        }
        String st = item.getStatus();
        return RdmConstants.DI_PENDING_ACCEPTANCE.equals(st)
                || RdmConstants.DI_PENDING_RELEASE.equals(st)
                || RdmConstants.DI_RELEASED_PENDING.equals(st);
    }

    /* ==================== 问题待办 ==================== */

    private void collectIssueTodos(TodoInput input, LocalDate today, Long viewerId,
                                   Map<Long, Long> projectIdByItemId,
                                   Map<String, RdmFactVO.Todo> deduped, int[] rawHits) {
        for (RdmIssue issue : nullSafe(input.getOpenIssues())) {
            if (issue == null || issue.getId() == null) {
                continue;
            }
            // 未决问题的责任人是问题负责人；严重度只作为成因明细，不改变计数
            TodoSeed s = seed(RdmConstants.NOTIFY_OBJECT_ISSUE, issue.getId(), issue.getId(),
                    issue.getIssueNo(), issue.getTitle(),
                    resolveProjectId(input, issue, projectIdByItemId),
                    issue.getOwnerUserId(), issue.getOwnerUserName(), null, false, issue.getVersion());
            addReason(deduped, rawHits, viewerId, s, today,
                    List.of(RdmConstants.TODO_REASON_PENDING_DECISION));
        }
    }

    /* ==================== 原范围延期残余待办 ==================== */

    private void collectDeferResidualTodos(TodoInput input, LocalDate today, Long viewerId,
                                           Map<Long, Long> projectIdByItemId,
                                           Map<String, RdmFactVO.Todo> deduped, int[] rawHits) {
        Map<Long, RdmIssue> issueById = new HashMap<>();
        for (RdmIssue issue : nullSafe(input.getOpenIssues())) {
            if (issue != null && issue.getId() != null) {
                issueById.put(issue.getId(), issue);
            }
        }
        for (RdmIssueDefer defer : nullSafe(input.getResidualDefers())) {
            if (defer == null || defer.getId() == null) {
                continue;
            }
            // 延期残余的责任人是延期单承接人；跳转仍指向问题页，绝不指向交付项页
            RdmIssue issue = defer.getIssueId() == null ? null : issueById.get(defer.getIssueId());
            Long projectId = issue == null
                    ? resolveProjectId(input, null, projectIdByItemId)
                    : resolveProjectId(input, issue, projectIdByItemId);
            TodoSeed s = seed(RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER, defer.getId(), defer.getIssueId(),
                    null, defer.getReason(), projectId, defer.getOwnerUserId(), defer.getOwnerUserName(),
                    defer.getDueAt(), isOverdueDate(defer.getDueAt(), today), defer.getVersion());
            addReason(deduped, rawHits, viewerId, s, today,
                    List.of(RdmConstants.TODO_REASON_DEFER_RESIDUAL));
        }
    }

    /* ==================== 项目级待办 ==================== */

    private void collectProjectTodos(TodoInput input, LocalDate today, Long viewerId,
                                     Map<String, RdmFactVO.Todo> deduped, int[] rawHits) {
        for (RdmProject project : nullSafe(input.getProjects())) {
            if (project == null || project.getId() == null) {
                continue;
            }
            boolean noLongerPushed = RdmConstants.PROJECT_CLOSED.equals(project.getStatus())
                    || RdmConstants.PROJECT_ALL_DELIVERED.equals(project.getStatus());
            if (noLongerPushed || !isOverdueDate(project.getPlanEndDate(), today)) {
                continue;
            }
            // 这里 closed / all_delivered 都只是「不再需要推进」，与统计侧无关：
            // 统计侧 allDelivered 与 closed 分列，绝不把关闭当作交付完成计入。
            TodoSeed s = seed(RdmConstants.NOTIFY_OBJECT_PROJECT, project.getId(), null,
                    project.getProjectNo(), project.getName(), project.getId(),
                    project.getPmUserId(), project.getPmUserName(), project.getPlanEndDate(), true,
                    project.getVersion());
            addReason(deduped, rawHits, viewerId, s, today, List.of(RdmConstants.TODO_REASON_OVERDUE));
        }
    }

    /* ==================== 去重与分桶 ==================== */

    /**
     * 累加一条待办成因。
     *
     * <p>去重键 = {@code objectType:refId:responsibleUserId}。<b>为什么责任人参与去重键</b>：
     * 同一个交付项可能同时「阻塞（协调人处理）」与「待产品验收（验收人签字）」，
     * 这是两个不同的人各自要做的事，合成一条会让验收人在自己的「待我处理」里看不到它。
     * 但同一个人同一个对象无论命中几个成因，都<b>只算一条</b>——这正是待办总数不再虚高的原因。
     *
     * @param reasons 空集合表示该对象当前没有成因，不产生待办
     */
    private void addReason(Map<String, RdmFactVO.Todo> deduped, int[] rawHits, Long viewerId,
                           TodoSeed s, LocalDate today, List<String> reasons) {
        if (reasons == null || reasons.isEmpty() || s.getRefId() == null) {
            return;
        }
        rawHits[0] += reasons.size();
        String key = todoKey(s.getObjectType(), s.getRefId(), s.getResponsibleUserId());
        RdmFactVO.Todo todo = deduped.get(key);
        if (todo == null) {
            todo = new RdmFactVO.Todo();
            todo.setKey(key);
            todo.setObjectType(s.getObjectType());
            todo.setRefId(s.getRefId());
            todo.setRefIssueId(s.getRefIssueId());
            todo.setRefNo(s.getRefNo());
            todo.setTitle(s.getTitle());
            todo.setProjectId(s.getProjectId());
            todo.setResponsibleUserId(s.getResponsibleUserId());
            todo.setResponsibleName(s.getResponsibleName());
            todo.setDueDate(DateTimeUtils.format(s.getDueDate()));
            todo.setOverdue(s.isOverdue());
            todo.setRefVersion(s.getRefVersion());
            todo.setBucket(bucketOf(s.getResponsibleUserId(), viewerId));
            todo.setActionUrl(actionUrlOf(s));
            todo.setReasons(new ArrayList<>());
            deduped.put(key, todo);
        }
        for (String reason : reasons) {
            if (reason != null && !todo.getReasons().contains(reason)) {
                todo.getReasons().add(reason);
            }
        }
        // 逾期工作日数按责任人真实工作日历计算（含请假/周末支援），取最坏（最大）值
        if (s.getDueDate() != null) {
            int overdueDays = workingDayCalculator.overdueWorkingDays(s.getDueDate(), today, s.getResponsibleUserId());
            Integer current = todo.getOverdueWorkingDays();
            if (current == null || overdueDays > current) {
                todo.setOverdueWorkingDays(overdueDays);
            }
            if (overdueDays > 0) {
                todo.setOverdue(true);
            }
        } else if (todo.getOverdueWorkingDays() == null) {
            todo.setOverdueWorkingDays(0);
        }
    }

    /**
     * 待办去重键（对外暴露：PM 待办通知的事件级去重也要按同一粒度，否则通知与看板会不同步）。
     */
    public static String todoKey(String objectType, Long refId, Long responsibleUserId) {
        return objectType + ":" + refId + ":"
                + (responsibleUserId == null ? UNASSIGNED_KEY_PART : responsibleUserId);
    }

    /**
     * 分桶：责任人就是登录人 → 待我处理；责任人是别人 → 等待他人；没有责任人 → 未指派。
     * <p>viewerId 为 null 时不可能「待我处理」，一律落到「等待他人 / 未指派」，
     * 不会因为拿不到登录人就把所有待办都算成自己的（与 A.2 的 fail-closed 口径一致）。
     */
    private String bucketOf(Long responsibleUserId, Long viewerId) {
        if (responsibleUserId == null) {
            return RdmConstants.TODO_BUCKET_UNASSIGNED;
        }
        return viewerId != null && viewerId.equals(responsibleUserId)
                ? RdmConstants.TODO_BUCKET_MINE
                : RdmConstants.TODO_BUCKET_WAITING_OTHERS;
    }

    /**
     * 按对象类型分流到<b>前端已注册</b>的路由。
     * <p>问题走问题页、交付项走交付项页、延期残余跳回它所属的问题页——绝不把问题套用交付项地址，
     * 也绝不拼未注册路径（历史上的 {@code /rdm/project/delivery/{id}} 点开即 404）。
     */
    private String actionUrlOf(TodoSeed s) {
        String objectType = s.getObjectType() == null ? "" : s.getObjectType();
        Long refId = s.getRefId();
        if (refId == null) {
            return RdmConstants.ROUTE_PROJECT_OVERVIEW;
        }
        switch (objectType) {
            case RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM:
                return RdmConstants.deliveryItemRoute(refId);
            case RdmConstants.NOTIFY_OBJECT_ISSUE:
                return RdmConstants.issueRoute(refId);
            case RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER:
                return s.getRefIssueId() == null
                        ? RdmConstants.ROUTE_PROJECT_OVERVIEW
                        : RdmConstants.issueRoute(s.getRefIssueId());
            case RdmConstants.NOTIFY_OBJECT_PROJECT:
            case RdmConstants.NOTIFY_OBJECT_PROJECT_TODO:
            case RdmConstants.NOTIFY_OBJECT_PROJECT_URGE:
                return RdmConstants.projectDetailRoute(refId);
            case RdmConstants.NOTIFY_OBJECT_TEST_BATCH:
                return RdmConstants.testBatchRoute(refId);
            case RdmConstants.NOTIFY_OBJECT_RELEASE_BATCH:
                return RdmConstants.releaseBatchRoute(refId);
            case RdmConstants.NOTIFY_OBJECT_REQUIREMENT:
                return RdmConstants.requirementRoute(refId);
            default:
                return RdmConstants.ROUTE_PROJECT_OVERVIEW;
        }
    }

    /* ==================== 内部工具 ==================== */

    private static TodoSeed seed(String objectType, Long refId, Long refIssueId, String refNo, String title,
                                 Long projectId, Long responsibleUserId, String responsibleName,
                                 LocalDate dueDate, boolean overdue, Integer refVersion) {
        TodoSeed s = new TodoSeed();
        s.setObjectType(objectType);
        s.setRefId(refId);
        s.setRefIssueId(refIssueId);
        s.setRefNo(refNo);
        s.setTitle(title);
        s.setProjectId(projectId);
        s.setResponsibleUserId(responsibleUserId);
        s.setResponsibleName(responsibleName);
        s.setDueDate(dueDate);
        s.setOverdue(overdue);
        s.setRefVersion(refVersion);
        return s;
    }

    private static Map<Long, Long> indexProjectIdByItemId(List<RdmFactVO.ItemFact> items) {
        Map<Long, Long> index = new HashMap<>();
        for (RdmFactVO.ItemFact item : nullSafe(items)) {
            if (item != null && item.getItemId() != null && item.getProjectId() != null) {
                index.put(item.getItemId(), item.getProjectId());
            }
        }
        return index;
    }

    /**
     * 解析问题的项目归属。
     * <p>{@code rdm_issue} 没有 project_id 列，只能：优先用事实服务回填的 issueId→projectId 索引；
     * 其次用问题所属交付项的 projectId。两者都拿不到就返回 null（<b>不猜</b>），
     * 待办依然成立，只是导出时项目列为空。
     */
    private static Long resolveProjectId(TodoInput input, RdmIssue issue, Map<Long, Long> projectIdByItemId) {
        if (issue != null) {
            Long byIndex = input.getProjectIdByIssueId() == null
                    ? null : input.getProjectIdByIssueId().get(issue.getId());
            if (byIndex != null) {
                return byIndex;
            }
            if (issue.getDeliveryItemId() != null) {
                return projectIdByItemId.get(issue.getDeliveryItemId());
            }
        }
        return input.getProjectId();
    }

    private static boolean isOverdueDate(LocalDate due, LocalDate today) {
        return due != null && due.isBefore(today);
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return LocalDate.parse(trimmed.substring(0, Math.min(10, trimmed.length())));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
