package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.RdmChangeRequest;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmChangeRequestMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmReviewMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RDM 交付过程服务实现（M2）。
 * <p>两条口径必须钉住：
 * <ol>
 *   <li>需求主状态推进只走 {@link RdmRequirementService#transition}，由 {@code rdm_transition}
 *       决定能不能推、谁能推；交付过程不另写状态机；</li>
 *   <li>任务上报是"事实录入"，状态联动失败不回滚任务变更，只记日志并保留需求原状态
 *       （否则会出现"研发已完工但被流程守卫挡住，连工时都填不进去"的死锁）。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmDeliveryServiceImpl implements RdmDeliveryService {

    /** 编号规则键 */
    private static final String SEQ_PRD = "rdm_prd";
    private static final String SEQ_REVIEW = "rdm_review";
    private static final String SEQ_TASK = "rdm_work_task";
    private static final String SEQ_CHANGE = "rdm_change";

    /** 任务状态 */
    private static final String TASK_TODO = "todo";
    private static final String TASK_DOING = "doing";
    private static final String TASK_DONE = "done";
    private static final String TASK_BLOCKED = "blocked";

    /** 评审结论 */
    private static final String REVIEW_PENDING = "pending";
    private static final String REVIEW_PASSED = "passed";
    private static final String REVIEW_REJECTED = "rejected";

    /** PRD 状态 */
    private static final String PRD_DRAFT = "draft";
    private static final String PRD_REVIEWING = "reviewing";
    private static final String PRD_APPROVED = "approved";
    private static final String PRD_REJECTED = "rejected";

    private final RdmPrdMapper prdMapper;
    private final RdmReviewMapper reviewMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmIterationMapper iterationMapper;
    private final RdmChangeRequestMapper changeMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final RdmConfigService configService;
    private final RdmNotifyService notifyService;
    private final RdmRequirementService requirementService;
    private final OaRequestService oaRequestService;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== PRD ==================== */

    @Override
    public List<RdmDeliveryVO.Prd> listPrds(Long reqId) {
        return prdMapper.selectList(prdQuery(reqId)).stream().map(this::toPrdVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Prd savePrd(RdmDeliveryDTO.Prd dto) {
        if (dto == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請填寫 PRD 標題");
        }
        SysUser current = operatorResolver.currentUser();
        RdmPrd prd;
        if (dto.getId() != null) {
            prd = requirePrd(dto.getId());
        } else {
            if (dto.getReqId() == null) {
                throw new BusinessException("PRD 必須掛在一条業務需求下");
            }
            RdmRequirement req = requireRequirement(dto.getReqId());
            prd = new RdmPrd();
            prd.setPrdNo(bizSeqService.next(SEQ_PRD));
            prd.setReqId(req.getId());
            prd.setStatus(PRD_DRAFT);
            prd.setVersionNo("v1.0");
            prd.setAuthorUserId(current == null ? null : current.getId());
            prd.setAuthorName(current == null ? req.getAssigneePmName() : current.getName());
            prd.setCreatedBy(operatorResolver.operatorSignature(current));
        }
        prd.setParentPrdId(dto.getParentPrdId());
        prd.setTitle(dto.getTitle().trim());
        prd.setTargetUsers(dto.getTargetUsers());
        prd.setFeatureList(dto.getFeatureList());
        prd.setAcceptanceCriteria(dto.getAcceptanceCriteria());
        prd.setContentRich(dto.getContentRich());
        prd.setPrototypeUrl(dto.getPrototypeUrl());
        prd.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (prd.getId() == null) {
            prdMapper.insert(prd);
        } else {
            prdMapper.updateById(prd);
        }

        // 拆 PRD 即代表需求进入「PRD設計中」；状态不可流转时静默跳过（由详情页按钮显式推进）
        if (prd.getId() != null && !Boolean.FALSE.equals(dto.getAdvanceRequirement())) {
            tryTransition(prd.getReqId(), RdmConstants.ACTION_PRD_START, null);
        }
        return toPrdVO(prdMapper.selectById(prd.getId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePrd(Long id) {
        RdmPrd prd = requirePrd(id);
        if (!PRD_DRAFT.equals(prd.getStatus())) {
            throw new BusinessException("僅草稿狀態的 PRD 可刪除，已評審的請走需求變更");
        }
        prdMapper.deleteById(id);
    }

    /* ==================== 评审 ==================== */

    @Override
    public List<RdmDeliveryVO.Review> listReviews(Long reqId) {
        return reviewMapper.selectList(new LambdaQueryWrapper<RdmReview>()
                        .eq(RdmReview::getReqId, reqId).orderByDesc(RdmReview::getId))
                .stream().map(this::toReviewVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Review createReview(RdmDeliveryDTO.Review dto) {
        if (dto == null || dto.getReqId() == null) {
            throw new BusinessException("請選擇要評審的需求");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        if (!StringUtils.hasText(dto.getReviewType())) {
            throw new BusinessException("請選擇評審類型");
        }
        SysUser current = operatorResolver.currentUser();
        List<Long> participants = dto.getParticipantIds() == null ? List.of() : dto.getParticipantIds();
        RdmReview review = new RdmReview();
        review.setReviewNo(bizSeqService.next(SEQ_REVIEW));
        review.setReqId(req.getId());
        review.setPrdId(dto.getPrdId());
        review.setReviewType(dto.getReviewType());
        review.setReviewTime(parseDateTime(dto.getReviewTime()));
        review.setParticipants(joinNames(participants));
        review.setParticipantIds(joinIds(participants));
        review.setConclusion(REVIEW_PENDING);
        review.setConclusionDesc(dto.getConclusionDesc());
        review.setAffectsScheduleFlag(0);
        review.setCreatedBy(operatorResolver.operatorSignature(current));
        review.setUpdatedBy(review.getCreatedBy());
        reviewMapper.insert(review);

        if (dto.getPrdId() != null) {
            RdmPrd prd = requirePrd(dto.getPrdId());
            prd.setStatus(PRD_REVIEWING);
            prdMapper.updateById(prd);
        }
        tryTransition(req.getId(), RdmConstants.ACTION_REVIEW_START, null);
        notifyService.notifyUserIds(RdmConstants.EVENT_REVIEW_TODO, req, participants,
                "需求評審邀約", "### 📝 需求評審邀約\n\n- **編號**: " + req.getReqNo()
                        + "\n- **標題**: " + req.getTitle()
                        + "\n- **評審類型**: " + reviewTypeLabel(dto.getReviewType())
                        + "\n- **發起人**: " + (current == null ? "-" : current.getName())
                        + "\n\n請按時參加並預先閱覽 PRD。");
        return toReviewVO(reviewMapper.selectById(review.getId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Review decideReview(Long id, RdmDeliveryDTO.ReviewDecision dto) {
        RdmReview review = reviewMapper.selectById(id);
        if (review == null) {
            throw new BusinessException("評審記錄不存在");
        }
        if (!REVIEW_PENDING.equals(review.getConclusion())) {
            throw new BusinessException("該評審已出結論，不能重復錄入");
        }
        boolean passed = Boolean.TRUE.equals(dto.getPassed());
        if (!passed && !StringUtils.hasText(dto.getRemark())) {
            throw new BusinessException("評審退回必須填寫退回原因");
        }
        SysUser current = operatorResolver.currentUser();
        review.setConclusion(passed ? REVIEW_PASSED : REVIEW_REJECTED);
        review.setConclusionDesc(StringUtils.hasText(dto.getConclusionDesc()) ? dto.getConclusionDesc() : dto.getRemark());
        review.setReviewTime(review.getReviewTime() == null ? LocalDateTime.now() : review.getReviewTime());
        review.setUpdatedBy(operatorResolver.operatorSignature(current));
        reviewMapper.updateById(review);

        if (review.getPrdId() != null) {
            RdmPrd prd = prdMapper.selectById(review.getPrdId());
            if (prd != null) {
                prd.setStatus(passed ? PRD_APPROVED : PRD_REJECTED);
                prd.setReviewTime(LocalDateTime.now());
                prd.setReviewConclusion(review.getConclusionDesc());
                prdMapper.updateById(prd);
            }
        }
        tryTransition(review.getReqId(),
                passed ? RdmConstants.ACTION_REVIEW_PASS : RdmConstants.ACTION_REVIEW_REJECT,
                passed ? null : remarkOnly(review.getConclusionDesc()));
        return toReviewVO(reviewMapper.selectById(id));
    }

    /* ==================== 执行任务与工时 ==================== */

    @Override
    public List<RdmDeliveryVO.Task> listTasks(Long reqId) {
        return taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .eq(RdmWorkTask::getReqId, reqId).orderByAsc(RdmWorkTask::getId))
                .stream().map(t -> toTaskVO(t, null)).toList();
    }

    @Override
    public List<RdmDeliveryVO.Task> myTasks(String status) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            return List.of();
        }
        LambdaQueryWrapper<RdmWorkTask> wrapper = new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, current.getId())
                .orderByAsc(RdmWorkTask::getPlanFinishDate)
                .orderByDesc(RdmWorkTask::getId);
        if (StringUtils.hasText(status)) {
            wrapper.eq(RdmWorkTask::getStatus, status);
        } else {
            wrapper.in(RdmWorkTask::getStatus, List.of(TASK_TODO, TASK_DOING, TASK_BLOCKED));
        }
        List<RdmWorkTask> tasks = taskMapper.selectList(wrapper.last("LIMIT 100"));
        List<RdmDeliveryVO.Task> list = new ArrayList<>();
        for (RdmWorkTask t : tasks) {
            RdmRequirement req = requirementMapper.selectById(t.getReqId());
            list.add(toTaskVO(t, req));
        }
        return list;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Task saveTask(RdmDeliveryDTO.Task dto) {
        if (dto == null || dto.getReqId() == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請選擇需求並填寫任務標題");
        }
        if (!StringUtils.hasText(dto.getTaskType())) {
            throw new BusinessException("請選擇任務類型");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        SysUser current = operatorResolver.currentUser();
        SysUser owner = dto.getOwnerUserId() == null ? null : userMapper.selectById(dto.getOwnerUserId());

        RdmWorkTask task = dto.getId() == null ? new RdmWorkTask() : requireTask(dto.getId());
        if (task.getId() == null) {
            task.setTaskNo(bizSeqService.next(SEQ_TASK));
            task.setReqId(req.getId());
            task.setStatus(TASK_TODO);
            task.setProgress(0);
            task.setCreatedBy(operatorResolver.operatorSignature(current));
        }
        task.setPrdId(dto.getPrdId());
        task.setTaskType(dto.getTaskType());
        task.setTitle(dto.getTitle().trim());
        task.setContent(dto.getContent());
        task.setOwnerUserId(owner == null ? null : owner.getId());
        task.setOwnerEmpNo(owner == null ? null : owner.getEmpId());
        task.setOwnerName(owner == null ? null : owner.getName());
        task.setRoleCode(roleOfTaskType(dto.getTaskType()));
        task.setPlanHours(dto.getPlanHours());
        task.setPlanStartDate(parseDate(dto.getPlanStartDate()));
        task.setPlanFinishDate(parseDate(dto.getPlanFinishDate()));
        task.setIterationCode(dto.getIterationCode());
        task.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (task.getId() == null) {
            taskMapper.insert(task);
        } else {
            taskMapper.updateById(task);
        }
        // 任务负责人自动成为需求参与人，否则他在详情页看不到任何可执行动作
        bindParticipant(req.getId(), owner, task.getRoleCode());
        if (owner != null && task.getId() != null) {
            notifyService.notifyUserIds(RdmConstants.EVENT_TASK_ASSIGNED, req, List.of(owner.getId()),
                    "新任務已指派給你", "### 🧩 新任務待處理\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **任務**: " + task.getTitle()
                            + "\n- **類型**: " + taskTypeLabel(task.getTaskType())
                            + (task.getPlanFinishDate() == null ? "" : "\n- **計劃完成**: " + task.getPlanFinishDate()));
        }
        return toTaskVO(taskMapper.selectById(task.getId()), req);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Task updateTaskProgress(Long id, RdmDeliveryDTO.TaskProgress dto) {
        RdmWorkTask task = requireTask(id);
        SysUser current = operatorResolver.currentUser();
        if (current != null && !operatorResolver.isAdmin(current)
                && task.getOwnerUserId() != null && !task.getOwnerUserId().equals(current.getId())) {
            throw new BusinessException("僅任務負責人可上報該任務進度");
        }
        String action = dto.getAction() == null ? "" : dto.getAction();
        LocalDateTime now = LocalDateTime.now();
        switch (action) {
            case "start" -> {
                task.setStatus(TASK_DOING);
                task.setActualStartTime(task.getActualStartTime() == null ? now : task.getActualStartTime());
                if (dto.getProgress() != null) {
                    task.setProgress(dto.getProgress());
                }
            }
            case "done" -> {
                task.setStatus(TASK_DONE);
                task.setProgress(100);
                task.setActualFinishTime(now);
                task.setBlockedReason(null);
            }
            case "block" -> {
                if (!StringUtils.hasText(dto.getRemark())) {
                    throw new BusinessException("標記阻塞必須填寫阻塞原因");
                }
                task.setStatus(TASK_BLOCKED);
                task.setBlockedReason(dto.getRemark());
            }
            case "unblock" -> {
                task.setStatus(TASK_DOING);
                task.setBlockedReason(null);
            }
            default -> throw new BusinessException("不支持的進度動作: " + action);
        }
        if (dto.getActualHours() != null) {
            task.setActualHours(dto.getActualHours());
        } else if (TASK_DONE.equals(task.getStatus()) && task.getActualHours() == null) {
            // 完成却未报工时：按 1 工日兜底，避免产出统计出现空洞
            task.setActualHours(BigDecimal.ONE);
        }
        task.setUpdatedBy(operatorResolver.operatorSignature(current));
        taskMapper.updateById(task);

        RdmRequirement req = requirementMapper.selectById(task.getReqId());
        if (req != null) {
            syncRequirementByTasks(req, task);
            syncBlockedFlag(req);
        }
        return toTaskVO(taskMapper.selectById(id), req);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteTask(Long id) {
        RdmWorkTask task = requireTask(id);
        if (TASK_DONE.equals(task.getStatus())) {
            throw new BusinessException("已完成任務含工時數據，不允許刪除（如計錯請先修正工時）");
        }
        taskMapper.deleteById(id);
    }

    @Override
    public RdmDeliveryVO.DeliverySummary summary(Long reqId) {
        RdmRequirement req = requireRequirement(reqId);
        RdmDeliveryVO.DeliverySummary summary = new RdmDeliveryVO.DeliverySummary();
        summary.setReqId(reqId);
        summary.setStatus(req.getStatus());
        summary.setPrds(listPrds(reqId));
        summary.setReviews(listReviews(reqId));
        summary.setChanges(listChanges(reqId));
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId).orderByAsc(RdmWorkTask::getId));
        summary.setTasks(tasks.stream().map(t -> toTaskVO(t, req)).toList());
        summary.setTaskTotal(tasks.size());
        summary.setTaskDone((int) tasks.stream().filter(t -> TASK_DONE.equals(t.getStatus())).count());
        summary.setTaskBlocked((int) tasks.stream().filter(t -> TASK_BLOCKED.equals(t.getStatus())).count());
        summary.setOverallProgress(tasks.isEmpty() ? 0
                : (int) Math.round(tasks.stream().mapToInt(t -> t.getProgress() == null ? 0 : t.getProgress()).average().orElse(0)));
        summary.setPlanHoursTotal(sum(tasks, RdmWorkTask::getPlanHours));
        summary.setActualHoursTotal(sum(tasks, RdmWorkTask::getActualHours));
        Map<String, BigDecimal> hours = new LinkedHashMap<>();
        for (RdmWorkTask t : tasks) {
            BigDecimal actual = t.getActualHours() == null ? BigDecimal.ZERO : t.getActualHours();
            hours.merge(taskTypeLabel(t.getTaskType()), actual, BigDecimal::add);
        }
        hours.forEach((name, value) -> summary.getHoursByType().add(new RdmDeliveryVO.NameValue(name, value.doubleValue())));
        return summary;
    }

    /* ==================== 迭代 ==================== */

    @Override
    public List<RdmDeliveryVO.Iteration> listIterations() {
        List<RdmIteration> iterations = iterationMapper.selectList(new LambdaQueryWrapper<RdmIteration>()
                .orderByDesc(RdmIteration::getStartDate).last("LIMIT 50"));
        List<RdmDeliveryVO.Iteration> list = new ArrayList<>();
        for (RdmIteration it : iterations) {
            RdmDeliveryVO.Iteration vo = new RdmDeliveryVO.Iteration();
            vo.setId(it.getId());
            vo.setCode(it.getCode());
            vo.setName(it.getName());
            vo.setIterationType(it.getIterationType());
            vo.setStartDate(DateTimeUtils.format(it.getStartDate()));
            vo.setEndDate(DateTimeUtils.format(it.getEndDate()));
            vo.setCapacityHours(it.getCapacityHours());
            vo.setOwnerUserId(it.getOwnerUserId());
            vo.setOwnerName(it.getOwnerName());
            vo.setStatus(it.getStatus());
            vo.setRemark(it.getRemark());
            vo.setReqCount(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND iteration_code = ?",
                    Integer.class, it.getCode()));
            Map<String, Object> taskStat = jdbcTemplate.queryForList(
                            "SELECT COUNT(*) AS task_cnt, COALESCE(SUM(COALESCE(actual_hours, plan_hours)), 0) AS hours "
                                    + "FROM rdm_work_task WHERE deleted = 0 AND iteration_code = ?", it.getCode())
                    .stream().findFirst().orElse(Map.of());
            vo.setTaskCount(toInt(taskStat.get("task_cnt")));
            Object hours = taskStat.get("hours");
            vo.setTaskHours(hours == null ? BigDecimal.ZERO : new BigDecimal(hours.toString()));
            list.add(vo);
        }
        return list;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Iteration saveIteration(RdmDeliveryDTO.Iteration dto) {
        if (dto == null || !StringUtils.hasText(dto.getCode()) || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("迭代編碼與名稱必填");
        }
        LocalDate start = parseDate(dto.getStartDate());
        LocalDate end = parseDate(dto.getEndDate());
        if (start == null || end == null || end.isBefore(start)) {
            throw new BusinessException("迭代起止日期不正確");
        }
        SysUser current = operatorResolver.currentUser();
        SysUser owner = dto.getOwnerUserId() == null ? null : userMapper.selectById(dto.getOwnerUserId());
        RdmIteration entity;
        if (dto.getId() == null) {
            Long dup = iterationMapper.selectCount(new LambdaQueryWrapper<RdmIteration>()
                    .eq(RdmIteration::getCode, dto.getCode().trim()));
            if (dup != null && dup > 0) {
                throw new BusinessException("迭代編碼已存在: " + dto.getCode());
            }
            entity = new RdmIteration();
            entity.setCreatedBy(operatorResolver.operatorSignature(current));
        } else {
            entity = iterationMapper.selectById(dto.getId());
            if (entity == null) {
                throw new BusinessException("迭代不存在");
            }
        }
        entity.setCode(dto.getCode().trim());
        entity.setName(dto.getName().trim());
        entity.setIterationType(StringUtils.hasText(dto.getIterationType()) ? dto.getIterationType() : "sprint");
        entity.setStartDate(start);
        entity.setEndDate(end);
        entity.setCapacityHours(dto.getCapacityHours() == null ? 0 : dto.getCapacityHours());
        entity.setOwnerUserId(owner == null ? null : owner.getId());
        entity.setOwnerName(owner == null ? null : owner.getName());
        entity.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "planning");
        entity.setRemark(dto.getRemark());
        entity.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (entity.getId() == null) {
            iterationMapper.insert(entity);
        } else {
            iterationMapper.updateById(entity);
        }
        return listIterations().stream().filter(i -> i.getId().equals(entity.getId())).findFirst()
                .orElseThrow(() -> new BusinessException("迭代保存後讀取失敗"));
    }

    /* ==================== 需求变更 ==================== */

    @Override
    public List<RdmDeliveryVO.Change> listChanges(Long reqId) {
        return changeMapper.selectList(new LambdaQueryWrapper<RdmChangeRequest>()
                        .eq(RdmChangeRequest::getReqId, reqId).orderByDesc(RdmChangeRequest::getId))
                .stream().map(this::toChangeVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Change applyChange(RdmDeliveryDTO.Change dto) {
        if (dto == null || dto.getReqId() == null) {
            throw new BusinessException("請選擇要變更的需求");
        }
        if (!StringUtils.hasText(dto.getAfterContent()) || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("變更內容與變更原因必填");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        boolean affectsSchedule = Boolean.TRUE.equals(dto.getAffectsSchedule());
        if (affectsSchedule && parseDate(dto.getNewPlanReleaseDate()) == null) {
            throw new BusinessException("影響排期的變更需填寫變更後的計劃上線日期");
        }
        SysUser current = operatorResolver.currentUser();

        RdmChangeRequest change = new RdmChangeRequest();
        change.setChangeNo(bizSeqService.next(SEQ_CHANGE));
        change.setReqId(req.getId());
        change.setPrdId(dto.getPrdId());
        change.setChangeType(StringUtils.hasText(dto.getChangeType()) ? dto.getChangeType() : "scope");
        change.setBeforeSnapshot(changeSnapshot(req));
        change.setAfterContent(dto.getAfterContent());
        change.setReason(dto.getReason());
        change.setImpactDesc(dto.getImpactDesc());
        change.setAffectsScheduleFlag(affectsSchedule ? 1 : 0);
        change.setAddedHours(dto.getAddedHours());
        change.setApprovalStatus(REVIEW_PENDING);
        change.setApplicantUserId(current == null ? null : current.getId());
        change.setApplicantName(current == null ? null : current.getName());
        change.setApplyTime(LocalDateTime.now());
        change.setCreatedBy(operatorResolver.operatorSignature(current));
        change.setUpdatedBy(change.getCreatedBy());

        OaRequestCreateDTO flow = new OaRequestCreateDTO();
        flow.setProcessCode(RdmConstants.CHANGE_PROCESS_CODE);
        flow.setTitle("需求變更：" + req.getTitle());
        Map<String, Object> form = new LinkedHashMap<>();
        form.put("changeNo", change.getChangeNo());
        form.put("reqNo", req.getReqNo());
        form.put("reqId", req.getId());
        form.put("changeType", change.getChangeType());
        form.put("afterContent", change.getAfterContent());
        form.put("reason", change.getReason());
        form.put("impactDesc", change.getImpactDesc());
        form.put("affectsSchedule", affectsSchedule);
        form.put("newPlanReleaseDate", dto.getNewPlanReleaseDate());
        flow.setFormData(JsonUtils.toJson(form));
        change.setFlowNo(oaRequestService.submit(flow));
        changeMapper.insert(change);

        List<Long> receivers = new ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_CHANGE_TODO, req, receivers,
                "需求變更待審批", "### 🔃 需求變更申請\n\n- **編號**: " + change.getChangeNo()
                        + "\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **申請人**: " + change.getApplicantName()
                        + "\n- **變更內容**: " + change.getAfterContent()
                        + "\n- **原因**: " + change.getReason()
                        + (affectsSchedule ? "\n\n**注意：本次變更影響排期，審批後請同步更新計劃時間。**" : ""));
        return toChangeVO(changeMapper.selectById(change.getId()));
    }

    /* ==================== 内部辅助 ==================== */

    /**
     * 尝试推进需求状态：当前状态下没有该流转配置就跳过；
     * 角色/必填不满足时只记日志，不回滚交付过程的数据录入。
     */
    private void tryTransition(Long reqId, String actionCode, RdmTransitionDTO payload) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            return;
        }
        if (configService.findTransition(req.getStatus(), actionCode) == null) {
            return;
        }
        try {
            RdmTransitionDTO dto = payload == null ? new RdmTransitionDTO() : payload;
            dto.setActionCode(actionCode);
            requirementService.transition(req.getId(), dto);
        } catch (BusinessException e) {
            log.warn("交付過程聯動需求狀態未成功（不影響任務數據）: reqNo={}, action={}, reason={}",
                    req.getReqNo(), actionCode, e.getMessage());
        }
    }

    /** 任务完成后联动需求：设计完成→转开发、开发全完成→转测试、测试完成→转验收 */
    private void syncRequirementByTasks(RdmRequirement req, RdmWorkTask task) {
        if (!TASK_DONE.equals(task.getStatus())) {
            return;
        }
        List<RdmWorkTask> siblings = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId()));
        switch (task.getTaskType() == null ? "" : task.getTaskType()) {
            case "design" -> {
                if (allDone(siblings, "design")) {
                    tryTransition(req.getId(), RdmConstants.ACTION_DESIGN_DONE, null);
                }
            }
            case "frontend", "backend", "data" -> {
                if (allDone(siblings, "frontend") && allDone(siblings, "backend")) {
                    tryTransition(req.getId(), RdmConstants.ACTION_DEV_DONE, null);
                }
            }
            case "qa" -> {
                if (allDone(siblings, "qa")) {
                    tryTransition(req.getId(), RdmConstants.ACTION_TEST_DONE, null);
                    if (allDone(siblings, null)) {
                        tryTransition(req.getId(), RdmConstants.ACTION_SUBMIT_UAT, null);
                    }
                }
            }
            default -> {
                // 未知任务类型不做联动，由需求详情页按钮显式推进
            }
        }
    }

    /** 任一任务阻塞则需求标记阻塞（风险雷达与逾期判定的输入） */
    private void syncBlockedFlag(RdmRequirement req) {
        Long blocking = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId()).eq(RdmWorkTask::getStatus, TASK_BLOCKED));
        boolean blocked = blocking != null && blocking > 0;
        if ((req.getBlockedFlag() == null ? 0 : req.getBlockedFlag()) != (blocked ? 1 : 0)) {
            RdmRequirement patch = new RdmRequirement();
            patch.setId(req.getId());
            patch.setBlockedFlag(blocked ? 1 : 0);
            patch.setBlockedReason(blocked ? firstBlockedReason(req.getId()) : null);
            requirementMapper.updateById(patch);
        }
    }

    private String firstBlockedReason(Long reqId) {
        return taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .eq(RdmWorkTask::getReqId, reqId).eq(RdmWorkTask::getStatus, TASK_BLOCKED)
                        .orderByAsc(RdmWorkTask::getId).last("LIMIT 1"))
                .stream().findFirst().map(RdmWorkTask::getBlockedReason).orElse(null);
    }

    private static boolean allDone(List<RdmWorkTask> tasks, String taskType) {
        List<RdmWorkTask> scoped = taskType == null ? tasks
                : tasks.stream().filter(t -> taskType.equals(t.getTaskType())).toList();
        return !scoped.isEmpty() && scoped.stream().allMatch(t -> TASK_DONE.equals(t.getStatus()));
    }

    private void bindParticipant(Long reqId, SysUser user, String roleCode) {
        if (reqId == null || user == null || !StringUtils.hasText(roleCode)) {
            return;
        }
        Long exists = roleMapper.selectCount(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getUserId, user.getId())
                .eq(RdmRequirementRole::getRoleCode, roleCode));
        if (exists != null && exists > 0) {
            return;
        }
        RdmRequirementRole role = new RdmRequirementRole();
        role.setReqId(reqId);
        role.setUserId(user.getId());
        role.setEmpNo(user.getEmpId());
        role.setEmpName(user.getName());
        role.setRoleCode(roleCode);
        role.setIsActive(1);
        role.setJoinTime(LocalDateTime.now());
        roleMapper.insert(role);
    }

    private static String roleOfTaskType(String taskType) {
        return switch (taskType == null ? "" : taskType) {
            case "design" -> RdmConstants.ROLE_DESIGNER;
            case "qa" -> RdmConstants.ROLE_QA;
            default -> RdmConstants.ROLE_DEV;
        };
    }

    private static String taskTypeLabel(String taskType) {
        return switch (taskType == null ? "" : taskType) {
            case "design" -> "UI 設計";
            case "frontend" -> "前端開發";
            case "backend" -> "後端開發";
            case "qa" -> "測試";
            case "data" -> "數據";
            default -> taskType;
        };
    }

    private static String reviewTypeLabel(String reviewType) {
        return switch (reviewType == null ? "" : reviewType) {
            case "requirement" -> "需求評審";
            case "dev" -> "研發評審";
            case "ui" -> "UI 評審";
            case "test" -> "測試評審";
            default -> reviewType;
        };
    }

    private String joinNames(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return null;
        }
        return userMapper.selectBatchIds(userIds).stream().map(SysUser::getName).reduce((a, b) -> a + "、" + b).orElse(null);
    }

    private static String joinIds(List<Long> userIds) {
        return userIds == null || userIds.isEmpty() ? null : StringUtils.collectionToCommaDelimitedString(userIds);
    }

    private static List<Long> splitIds(String csv) {
        if (!StringUtils.hasText(csv)) {
            return List.of();
        }
        return Arrays.stream(csv.split(",")).map(String::trim).filter(StringUtils::hasText)
                .map(Long::valueOf).toList();
    }

    private String changeSnapshot(RdmRequirement req) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("status", req.getStatus());
        snapshot.put("priority", req.getPriority());
        snapshot.put("complexity", req.getComplexity());
        snapshot.put("expectResult", req.getExpectResult());
        snapshot.put("planReleaseDate", req.getPlanReleaseDate() == null ? null : req.getPlanReleaseDate().toString());
        return JsonUtils.toJson(snapshot);
    }

    private RdmDeliveryVO.Prd toPrdVO(RdmPrd prd) {
        RdmDeliveryVO.Prd vo = new RdmDeliveryVO.Prd();
        vo.setId(prd.getId());
        vo.setPrdNo(prd.getPrdNo());
        vo.setReqId(prd.getReqId());
        vo.setParentPrdId(prd.getParentPrdId());
        vo.setTitle(prd.getTitle());
        vo.setTargetUsers(prd.getTargetUsers());
        vo.setFeatureList(prd.getFeatureList());
        vo.setAcceptanceCriteria(prd.getAcceptanceCriteria());
        vo.setContentRich(prd.getContentRich());
        vo.setPrototypeUrl(prd.getPrototypeUrl());
        vo.setStatus(prd.getStatus());
        vo.setVersionNo(prd.getVersionNo());
        vo.setAuthorName(prd.getAuthorName());
        vo.setReviewTime(DateTimeUtils.format(prd.getReviewTime()));
        vo.setReviewConclusion(prd.getReviewConclusion());
        vo.setCreatedAt(DateTimeUtils.format(prd.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(prd.getUpdatedAt()));
        return vo;
    }

    private RdmDeliveryVO.Review toReviewVO(RdmReview review) {
        RdmDeliveryVO.Review vo = new RdmDeliveryVO.Review();
        vo.setId(review.getId());
        vo.setReviewNo(review.getReviewNo());
        vo.setReqId(review.getReqId());
        vo.setPrdId(review.getPrdId());
        vo.setReviewType(review.getReviewType());
        vo.setReviewTime(DateTimeUtils.format(review.getReviewTime()));
        vo.setParticipants(review.getParticipants());
        vo.setParticipantIdList(splitIds(review.getParticipantIds()));
        vo.setConclusion(review.getConclusion());
        vo.setConclusionDesc(review.getConclusionDesc());
        vo.setAffectsSchedule(review.getAffectsScheduleFlag() != null && review.getAffectsScheduleFlag() == 1);
        vo.setCreatedBy(review.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(review.getCreatedAt()));
        if (review.getPrdId() != null) {
            RdmPrd prd = prdMapper.selectById(review.getPrdId());
            vo.setPrdTitle(prd == null ? null : prd.getTitle());
        }
        return vo;
    }

    private RdmDeliveryVO.Task toTaskVO(RdmWorkTask task, RdmRequirement req) {
        RdmDeliveryVO.Task vo = new RdmDeliveryVO.Task();
        vo.setId(task.getId());
        vo.setTaskNo(task.getTaskNo());
        vo.setReqId(task.getReqId());
        vo.setPrdId(task.getPrdId());
        vo.setTaskType(task.getTaskType());
        vo.setTitle(task.getTitle());
        vo.setContent(task.getContent());
        vo.setOwnerUserId(task.getOwnerUserId());
        vo.setOwnerName(task.getOwnerName());
        vo.setOwnerEmpNo(task.getOwnerEmpNo());
        vo.setRoleCode(task.getRoleCode());
        vo.setStatus(task.getStatus());
        vo.setProgress(task.getProgress());
        vo.setPlanHours(task.getPlanHours());
        vo.setActualHours(task.getActualHours());
        vo.setPlanStartDate(DateTimeUtils.format(task.getPlanStartDate()));
        vo.setPlanFinishDate(DateTimeUtils.format(task.getPlanFinishDate()));
        vo.setActualStartTime(DateTimeUtils.format(task.getActualStartTime()));
        vo.setActualFinishTime(DateTimeUtils.format(task.getActualFinishTime()));
        vo.setBlockedReason(task.getBlockedReason());
        vo.setIterationCode(task.getIterationCode());
        vo.setCreatedAt(DateTimeUtils.format(task.getCreatedAt()));
        boolean unfinished = !TASK_DONE.equals(task.getStatus());
        vo.setOverdue(unfinished && task.getPlanFinishDate() != null
                && task.getPlanFinishDate().isBefore(LocalDate.now()));
        if (req != null) {
            vo.setReqNo(req.getReqNo());
            vo.setReqTitle(req.getTitle());
            vo.setReqStatus(req.getStatus());
        }
        return vo;
    }

    private RdmDeliveryVO.Change toChangeVO(RdmChangeRequest change) {
        RdmDeliveryVO.Change vo = new RdmDeliveryVO.Change();
        vo.setId(change.getId());
        vo.setChangeNo(change.getChangeNo());
        vo.setReqId(change.getReqId());
        vo.setPrdId(change.getPrdId());
        vo.setChangeType(change.getChangeType());
        vo.setAfterContent(change.getAfterContent());
        vo.setReason(change.getReason());
        vo.setImpactDesc(change.getImpactDesc());
        vo.setAffectsSchedule(change.getAffectsScheduleFlag() != null && change.getAffectsScheduleFlag() == 1);
        vo.setAddedHours(change.getAddedHours());
        vo.setFlowNo(change.getFlowNo());
        vo.setApprovalStatus(change.getApprovalStatus());
        vo.setApplicantName(change.getApplicantName());
        vo.setApplyTime(DateTimeUtils.format(change.getApplyTime()));
        vo.setDecideTime(DateTimeUtils.format(change.getDecideTime()));
        vo.setDecideRemark(change.getDecideRemark());
        return vo;
    }

    private LambdaQueryWrapper<RdmPrd> prdQuery(Long reqId) {
        return new LambdaQueryWrapper<RdmPrd>().eq(RdmPrd::getReqId, reqId).orderByAsc(RdmPrd::getId);
    }

    private RdmPrd requirePrd(Long id) {
        RdmPrd prd = id == null ? null : prdMapper.selectById(id);
        if (prd == null) {
            throw new BusinessException("PRD 不存在");
        }
        return prd;
    }

    private RdmWorkTask requireTask(Long id) {
        RdmWorkTask task = id == null ? null : taskMapper.selectById(id);
        if (task == null) {
            throw new BusinessException("任務不存在");
        }
        return task;
    }

    private RdmRequirement requireRequirement(Long id) {
        RdmRequirement req = id == null ? null : requirementMapper.selectById(id);
        if (req == null) {
            throw new BusinessException("需求不存在");
        }
        return req;
    }

    private static RdmTransitionDTO remarkOnly(String remark) {
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setRemark(remark);
        return dto;
    }

    private static BigDecimal sum(List<RdmWorkTask> tasks, java.util.function.Function<RdmWorkTask, BigDecimal> getter) {
        BigDecimal total = BigDecimal.ZERO;
        for (RdmWorkTask t : tasks) {
            BigDecimal value = getter.apply(t);
            if (value != null) {
                total = total.add(value);
            }
        }
        return total;
    }

    private static LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (Exception e) {
            throw new BusinessException("日期格式不正確: " + value);
        }
    }

    private static LocalDateTime parseDateTime(String value) {
        if (!StringUtils.hasText(value)) {
            return LocalDateTime.now();
        }
        try {
            String cleaned = value.trim().replace('T', ' ');
            return LocalDateTime.parse(cleaned.length() >= 19 ? cleaned.substring(0, 19) : cleaned + ":00");
        } catch (Exception e) {
            return LocalDateTime.now();
        }
    }

    private static int toInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}
