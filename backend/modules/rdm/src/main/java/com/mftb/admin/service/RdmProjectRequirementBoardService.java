package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.RdmProjectRequirementVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 项目详情「迭代 → 需求」视角聚合。
 *
 * <p><b>背景</b>：项目详情过去只按 {@code rdm_delivery_item} 展示交付清单与待办，
 * 而实际链路已是「项目 → 迭代 → 需求 → 任务」，交付项只是需求准入后系统自动生成的
 * 可验收批次（{@code getOrCreateDefaultItem}）。结果是项目挂着需求、甚至挂着待准入需求时，
 * 详情页仍显示「暫無交付項」——事实源选错了层级，而不是数据没进库。
 *
 * <p><b>口径</b>：
 * <ul>
 *   <li>需求归属 = {@code project_id = 项目} 或 {@code iteration_code ∈ 本项目迭代}；
 *       历史数据存在需求只挂迭代、主表 project_id 为空的行，两边都要认；</li>
 *   <li>交付项降为需求行上的完成度补充（未拆分显示 0/0，不再作为可见性前提）；</li>
 *   <li>待推进按需求/任务生成；问题与延期待裁决复用 {@link RdmProjectFactService#todoBoard}
 *       这一既有权威口径，不在这里另算一套。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmProjectRequirementBoardService {

    private static final String TASK_STATUS_CANCELLED = "cancelled";
    private static final String TASK_STATUS_BLOCKED = RdmConstants.TASK_BLOCKED;
    /** 单类待办最多返回条数：项目详情是概览页，全量明细应去需求/任务列表看 */
    private static final int MAX_TODOS_PER_TYPE = 50;

    /** 尚未进入交付流程：不参与「未排期/缺负责人」判定 */
    private static final Set<String> PENDING_REQ_STATUSES = Set.of(
            RdmConstants.STATUS_DRAFT,
            RdmConstants.STATUS_INTAKE_PENDING,
            RdmConstants.STATUS_INTAKE_REJECTED);
    /** 交付完成口径：上线(released)仍需验收，不算交付完成 */
    private static final Set<String> DELIVERED_REQ_STATUSES = Set.of(
            RdmConstants.STATUS_VERIFIED,
            RdmConstants.STATUS_CLOSED);

    private final RdmIterationMapper iterationMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmWorkTaskMapper taskMapper;
    /** 资源守卫与待裁决口径：与项目详情/待办看板同源，禁止在前端另拼 */
    private final RdmProjectFactService factService;

    /**
     * 项目需求视角。
     * <p>可见性沿用事实源守卫：未登录/越权他项目直接抛 {@code BusinessException}，
     * 与 {@link RdmProjectService#getProjectDetail} 完全一致。
     */
    public RdmProjectRequirementVO.Board getBoard(Long projectId, Long currentUserId) {
        RdmFactVO.ProjectFact fact = factService.projectFact(projectId, currentUserId);
        RdmProjectRequirementVO.Board board = new RdmProjectRequirementVO.Board();
        if (fact == null) {
            return board;
        }

        List<RdmIteration> iterations = iterationMapper.selectList(
                new LambdaQueryWrapper<RdmIteration>()
                        .eq(RdmIteration::getProjectId, projectId)
                        .orderByAsc(RdmIteration::getStartDate));
        Set<String> iterationCodes = iterations.stream()
                .map(RdmIteration::getCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        List<RdmRequirement> requirements = loadRequirements(projectId, iterationCodes);
        List<Long> reqIds = requirements.stream()
                .map(RdmRequirement::getId)
                .filter(Objects::nonNull)
                .toList();
        Map<Long, List<RdmDeliveryItem>> itemsByReq = loadItemsByReq(reqIds);
        List<RdmWorkTask> tasks = loadTasks(reqIds);
        Map<Long, RdmRequirement> reqById = requirements.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(RdmRequirement::getId, r -> r, (a, b) -> a));

        LocalDate today = LocalDate.now();
        Map<String, List<RdmRequirement>> byIteration = new LinkedHashMap<>();
        List<RdmRequirement> unplanned = new ArrayList<>();
        for (RdmRequirement req : requirements) {
            String code = req.getIterationCode();
            if (StringUtils.hasText(code) && iterationCodes.contains(code)) {
                byIteration.computeIfAbsent(code, k -> new ArrayList<>()).add(req);
            } else {
                unplanned.add(req);
            }
        }

        for (RdmIteration iteration : iterations) {
            if (!StringUtils.hasText(iteration.getCode())) {
                continue;
            }
            RdmProjectRequirementVO.IterationGroup group = new RdmProjectRequirementVO.IterationGroup();
            group.setIterationCode(iteration.getCode());
            group.setIterationName(iteration.getName());
            group.setStatus(iteration.getStatus());
            group.setStartDate(DateTimeUtils.format(iteration.getStartDate()));
            group.setEndDate(DateTimeUtils.format(iteration.getEndDate()));
            List<RdmProjectRequirementVO.RequirementRow> rows = new ArrayList<>();
            for (RdmRequirement req : byIteration.getOrDefault(iteration.getCode(), List.of())) {
                rows.add(toRow(req, itemsByReq.get(req.getId()), today));
            }
            group.setRequirements(rows);
            group.setRequirementTotal(rows.size());
            group.setRequirementDelivered((int) rows.stream().filter(r -> DELIVERED_REQ_STATUSES.contains(r.getStatus())).count());
            board.getIterations().add(group);
        }
        for (RdmRequirement req : unplanned) {
            board.getUnplanned().add(toRow(req, itemsByReq.get(req.getId()), today));
        }

        board.setTodos(buildTodos(requirements, tasks, reqById, fact, projectId, currentUserId, today));
        board.setSummary(buildSummary(iterations, requirements, tasks, fact));
        return board;
    }

    /** 需求归属：主表项目 或 迭代属于本项目（历史数据存在 project_id 为空、只挂迭代的需求） */
    private List<RdmRequirement> loadRequirements(Long projectId, Set<String> iterationCodes) {
        LambdaQueryWrapper<RdmRequirement> query = new LambdaQueryWrapper<>();
        query.and(w -> {
            w.eq(RdmRequirement::getProjectId, projectId);
            if (!iterationCodes.isEmpty()) {
                w.or().in(RdmRequirement::getIterationCode, iterationCodes);
            }
        }).orderByAsc(RdmRequirement::getId);
        List<RdmRequirement> list = requirementMapper.selectList(query);
        return list == null ? List.of() : list;
    }

    private Map<Long, List<RdmDeliveryItem>> loadItemsByReq(List<Long> reqIds) {
        if (reqIds.isEmpty()) {
            return Map.of();
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().in(RdmDeliveryItem::getReqId, reqIds));
        if (items == null || items.isEmpty()) {
            return Map.of();
        }
        return items.stream()
                .filter(i -> i != null && i.getReqId() != null)
                .collect(Collectors.groupingBy(RdmDeliveryItem::getReqId));
    }

    private List<RdmWorkTask> loadTasks(List<Long> reqIds) {
        if (reqIds.isEmpty()) {
            return List.of();
        }
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .in(RdmWorkTask::getReqId, reqIds)
                .ne(RdmWorkTask::getStatus, TASK_STATUS_CANCELLED));
        return tasks == null ? List.of() : tasks;
    }

    private RdmProjectRequirementVO.RequirementRow toRow(RdmRequirement req, List<RdmDeliveryItem> items, LocalDate today) {
        RdmProjectRequirementVO.RequirementRow row = new RdmProjectRequirementVO.RequirementRow();
        row.setId(req.getId());
        row.setReqNo(req.getReqNo());
        row.setTitle(req.getTitle());
        row.setStatus(req.getStatus());
        row.setRequirementKind(req.getRequirementKind());
        row.setIterationCode(req.getIterationCode());
        row.setPmName(req.getAssigneePmName());
        row.setDevOwnerName(req.getDevOwnerName());
        row.setPlanDevDate(DateTimeUtils.format(req.getPlanDevDate()));
        row.setPlanReleaseDate(DateTimeUtils.format(req.getPlanReleaseDate()));
        row.setProgress(req.getProgress());
        row.setBlocked(req.getBlockedFlag() != null && req.getBlockedFlag() == 1);
        row.setOverdue(isOverdue(req, today));
        List<RdmDeliveryItem> safeItems = items == null ? List.of() : items;
        row.setDeliveryItemTotal(safeItems.size());
        row.setDeliveryItemDone((int) safeItems.stream()
                .filter(i -> RdmConstants.DI_DONE.equals(i.getStatus()))
                .count());
        return row;
    }

    private boolean isOverdue(RdmRequirement req, LocalDate today) {
        if (DELIVERED_REQ_STATUSES.contains(req.getStatus())) {
            return false;
        }
        if (req.getOverdueFlag() != null && req.getOverdueFlag() == 1) {
            return true;
        }
        LocalDate plan = req.getPlanDevDate() != null ? req.getPlanDevDate() : req.getPlanReleaseDate();
        return plan != null && plan.isBefore(today);
    }

    private List<RdmProjectRequirementVO.Todo> buildTodos(List<RdmRequirement> requirements,
                                                         List<RdmWorkTask> tasks,
                                                         Map<Long, RdmRequirement> reqById,
                                                         RdmFactVO.ProjectFact fact,
                                                         Long projectId,
                                                         Long currentUserId,
                                                         LocalDate today) {
        List<RdmProjectRequirementVO.Todo> todos = new ArrayList<>();
        List<RdmProjectRequirementVO.Todo> intakePending = new ArrayList<>();
        List<RdmProjectRequirementVO.Todo> unplanned = new ArrayList<>();
        List<RdmProjectRequirementVO.Todo> overdue = new ArrayList<>();
        List<RdmProjectRequirementVO.Todo> noOwner = new ArrayList<>();
        for (RdmRequirement req : requirements) {
            String status = req.getStatus();
            if (RdmConstants.STATUS_INTAKE_PENDING.equals(status)) {
                intakePending.add(reqTodo("intake_pending", req, null,
                        req.getSubmitterName(), req.getExpectDate()));
            } else if (RdmConstants.STATUS_DRAFT.equals(status) || RdmConstants.STATUS_INTAKE_REJECTED.equals(status)) {
                // 草稿/驳回不催办：还没进入流程，催了也没有责任人可推进
                continue;
            } else if (!StringUtils.hasText(req.getIterationCode())) {
                unplanned.add(reqTodo("unplanned", req, "未排期，請在需求詳情排期時選擇迭代",
                        req.getAssigneePmName(), req.getPlanDevDate()));
            }
            if (isOverdue(req, today)) {
                LocalDate plan = req.getPlanDevDate() != null ? req.getPlanDevDate() : req.getPlanReleaseDate();
                overdue.add(reqTodo("overdue", req,
                        plan == null ? null : "計劃日期 " + plan + " 已過期",
                        req.getDevOwnerName(), plan));
            }
            if (!PENDING_REQ_STATUSES.contains(status) && !DELIVERED_REQ_STATUSES.contains(status)
                    && req.getDevOwnerUserId() == null) {
                noOwner.add(reqTodo("no_owner", req, "尚未指定研發負責人",
                        req.getAssigneePmName(), req.getPlanDevDate()));
            }
        }
        todos.addAll(limit(intakePending));
        todos.addAll(limit(unplanned));
        todos.addAll(limit(overdue));
        todos.addAll(limit(noOwner));

        List<RdmProjectRequirementVO.Todo> blocked = new ArrayList<>();
        for (RdmWorkTask task : tasks) {
            if (!TASK_STATUS_BLOCKED.equals(task.getStatus())) {
                continue;
            }
            RdmRequirement req = reqById.get(task.getReqId());
            RdmProjectRequirementVO.Todo todo = new RdmProjectRequirementVO.Todo();
            todo.setType("blocked_task");
            todo.setRefId(task.getId());
            todo.setReqId(task.getReqId());
            todo.setReqNo(req == null ? null : req.getReqNo());
            todo.setTitle(task.getTitle());
            todo.setDetail(task.getBlockedReason());
            todo.setResponsibleName(task.getOwnerName());
            todo.setDueDate(DateTimeUtils.format(task.getPlanFinishDate()));
            todo.setActionUrl(task.getId() == null ? null : RdmConstants.taskRoute(task.getId(), task.getReqId()));
            blocked.add(todo);
        }
        todos.addAll(limit(blocked));

        // 待裁决（未决问题/延期残余）：复用事实源待办，不另算一套
        List<RdmProjectRequirementVO.Todo> decisions = new ArrayList<>();
        RdmFactVO.TodoBoard factBoard = factService.todoBoard(projectId, currentUserId);
        if (factBoard != null && factBoard.getTodos() != null) {
            for (RdmFactVO.Todo t : factBoard.getTodos()) {
                if (t == null) {
                    continue;
                }
                boolean issueLike = RdmConstants.NOTIFY_OBJECT_ISSUE.equals(t.getObjectType())
                        || RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER.equals(t.getObjectType());
                if (!issueLike) {
                    continue;
                }
                RdmProjectRequirementVO.Todo todo = new RdmProjectRequirementVO.Todo();
                todo.setType("decision");
                todo.setRefId(t.getRefId());
                todo.setReqNo(t.getRefNo());
                todo.setTitle(t.getTitle());
                todo.setDetail(t.getReasons() == null || t.getReasons().isEmpty() ? null : String.join("；", t.getReasons()));
                todo.setResponsibleName(t.getResponsibleName());
                todo.setDueDate(t.getDueDate());
                todo.setActionUrl(t.getActionUrl());
                decisions.add(todo);
            }
        }
        todos.addAll(limit(decisions));
        return todos;
    }

    private RdmProjectRequirementVO.Todo reqTodo(String type, RdmRequirement req,
                                                 String detail, String responsibleName, LocalDate dueDate) {
        RdmProjectRequirementVO.Todo todo = new RdmProjectRequirementVO.Todo();
        todo.setType(type);
        todo.setRefId(req.getId());
        todo.setReqId(req.getId());
        todo.setReqNo(req.getReqNo());
        todo.setTitle(req.getTitle());
        todo.setDetail(detail);
        todo.setResponsibleName(responsibleName);
        todo.setDueDate(DateTimeUtils.format(dueDate));
        todo.setActionUrl(req.getId() == null ? null : RdmConstants.requirementRoute(req.getId()));
        return todo;
    }

    private List<RdmProjectRequirementVO.Todo> limit(List<RdmProjectRequirementVO.Todo> todos) {
        return todos.size() <= MAX_TODOS_PER_TYPE ? todos : todos.subList(0, MAX_TODOS_PER_TYPE);
    }

    private RdmProjectRequirementVO.Summary buildSummary(List<RdmIteration> iterations,
                                                         List<RdmRequirement> requirements,
                                                         List<RdmWorkTask> tasks,
                                                         RdmFactVO.ProjectFact fact) {
        RdmProjectRequirementVO.Summary summary = new RdmProjectRequirementVO.Summary();
        summary.setIterationTotal(iterations.size());
        summary.setRequirementTotal(requirements.size());
        int delivered = 0;
        int pending = 0;
        for (RdmRequirement req : requirements) {
            if (DELIVERED_REQ_STATUSES.contains(req.getStatus())) {
                delivered++;
            } else if (PENDING_REQ_STATUSES.contains(req.getStatus())) {
                pending++;
            }
        }
        summary.setRequirementDelivered(delivered);
        summary.setRequirementPending(pending);
        summary.setRequirementInProgress(Math.max(0, requirements.size() - delivered - pending));
        summary.setBlockedTaskCount((int) tasks.stream().filter(t -> TASK_STATUS_BLOCKED.equals(t.getStatus())).count());
        summary.setPendingDecisionCount(fact.getPendingDecisionCount());
        summary.setPendingAcceptanceCount(fact.getDeliveryItemPendingAcceptance());
        summary.setDeliveryItemTotal(fact.getDeliveryItemTotal());
        summary.setDeliveryItemDone(fact.getDeliveryItemCompleted());
        return summary;
    }
}
