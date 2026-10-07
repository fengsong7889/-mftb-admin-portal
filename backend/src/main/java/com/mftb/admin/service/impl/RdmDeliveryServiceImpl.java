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
import com.mftb.admin.entity.RdmMilestone;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmPrdSnapshot;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.RdmWorkLog;
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
import com.mftb.admin.service.RdmAccessGuard;
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
import java.util.Set;
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
    /** 已取消：不参与阶段门槛判定（取消本身已表达「这活不做了」） */
    private static final String TASK_CANCELLED = "cancelled";

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
    /** 需求级访问守卫：交付子资源必须反查所属需求后校验数据范围与角色 */
    private final RdmAccessGuard accessGuard;
    /** 阶段 3：里程碑（五节点计划/基线） */
    private final com.mftb.admin.mapper.RdmMilestoneMapper milestoneMapper;
    /** 阶段 3：工时明细（实际工时的唯一事实） */
    private final com.mftb.admin.mapper.RdmWorkLogMapper workLogMapper;
    /** 阶段 3：PRD 定稿快照 */
    private final com.mftb.admin.mapper.RdmPrdSnapshotMapper prdSnapshotMapper;
    /** 任务负责人资格校验用：派给无交付权限的人，他会收到待办却上报不了进度 */
    private final com.mftb.admin.service.PermissionService permissionService;

    /* ==================== PRD ==================== */

    @Override
    public List<RdmDeliveryVO.Prd> listPrds(Long reqId) {
        accessGuard.requireVisible(reqId, "查看 PRD");
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
            // 改已有 PRD 必须反查所属需求再裁决：只按 id 放行等于任何持菜单编辑权的人都能改别人的交付物
            accessGuard.requireDeliveryWriter(prd.getReqId(), "編輯 PRD");
            /*
             * 评审中/已通过的 PRD 不得原地改正文：那份内容已经是评审结论与验收标准的事实，
             * 改了就变成「开发按新版做、验收按旧版查」。要改只能开新版本，并留下变更原因。
             */
            if (isFrozen(prd.getStatus())) {
                if (!Boolean.TRUE.equals(dto.getNewVersion())) {
                    throw new BusinessException("PRD「" + prd.getVersionNo() + "」已"
                            + (PRD_APPROVED.equals(prd.getStatus()) ? "評審通過" : "正在評審")
                            + "，內容不可原地修改；請以新版本修改並填寫原因");
                }
                if (!StringUtils.hasText(dto.getChangeReason())) {
                    throw new BusinessException("以新版本修改必須填寫變更原因，它會進版本鏈");
                }
                prd = forkVersion(prd, dto, current);
            }
        } else {
            if (dto.getReqId() == null) {
                throw new BusinessException("PRD 必須掛在一条業務需求下");
            }
            accessGuard.requireDeliveryWriter(dto.getReqId(), "編寫 PRD");
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
        accessGuard.requireDeliveryWriter(prd.getReqId(), "刪除 PRD");
        if (!PRD_DRAFT.equals(prd.getStatus())) {
            throw new BusinessException("僅草稿狀態的 PRD 可刪除，已評審的請走需求變更");
        }
        prdMapper.deleteById(id);
    }

    /* ==================== 评审 ==================== */

    @Override
    public List<RdmDeliveryVO.Review> listReviews(Long reqId) {
        accessGuard.requireVisible(reqId, "查看評審記錄");
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
        accessGuard.requireDeliveryWriter(req.getId(), "發起評審");
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
        // 参与人字段原先只用来发通知，录结论时不看，等于任何人都能给别人的评审签字
        accessGuard.requireReviewParticipant(review, "録入評審結論");
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
                // 结论落定的同时冻结一版：事后能回答「这次评审通过的到底是哪一版内容」
                snapshotPrd(prd, review, passed, current);
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
        accessGuard.requireVisible(reqId, "查看任務清單");
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
        }
        /*
         * 不传 status 就是真的全部：之前默认退化成“未完成”，导致工作台「全部」页签
         * 永远看不到已完成任务（端到端测试实测）。该页默认视图就是未完成，
         * 是由前端 filter 保证的，服务端不应替调用方做这个决定。
         */
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
        accessGuard.requireDeliveryWriter(req.getId(), "指派/維護任務");
        validateTaskForm(dto);
        SysUser current = operatorResolver.currentUser();
        SysUser owner = dto.getOwnerUserId() == null ? null : userMapper.selectById(dto.getOwnerUserId());
        if (dto.getOwnerUserId() != null && owner == null) {
            throw new BusinessException("任務負責人不存在或已停用");
        }
        if (owner != null) {
            requireTaskOwnerEligible(owner);
        }

        RdmWorkTask task = dto.getId() == null ? new RdmWorkTask() : requireTask(dto.getId());
        if (task.getId() != null) {
            // 改已有任务时以任务上的需求为准，不信前端传的 reqId（否则可以把任务挂到别人需求下）
            accessGuard.requireDeliveryWriter(task.getReqId(), "編輯任務");
        }
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
        accessGuard.requireVisible(task.getReqId(), "查看任務");
        // 上报进度的合法人群：任务负责人本人，或 PM/研发负责人/PMO 与全量授权者。
        // 原先只认负责人：owner 为空时反而任何人都能改，且负责人离职后没人能更正
        accessGuard.requireTaskOperator(task.getReqId(), task.getOwnerUserId(), "上報任務進度");
        if (dto.getProgress() != null && (dto.getProgress() < 0 || dto.getProgress() > 100)) {
            throw new BusinessException("進度只能在 0-100 之間");
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
                /*
                 * 完成必须留下一句交付说明或交付物链接：「100%」本身不是证据，
                 * 没有它一旦出问题根本无法复盘当时交的是什么。
                 */
                if (!StringUtils.hasText(dto.getRemark())) {
                    throw new BusinessException("完成任務必須填寫交付說明或交付物連結");
                }
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
            // 实际工时不再直写任务列，而是落成当日明细后回算汇总：
            // 任务上那个孤立数字既不能区分谁投入，也不能支撑负载与估时偏差
            recordWorkLog(task, dto.getActualHours(), StringUtils.hasText(dto.getRemark()) ? dto.getRemark() : "進度上報時帶入", current, LocalDate.now());
        }
        task.setActualHours(sumWorkHours(task.getId()));
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
        accessGuard.requireDeliveryWriter(task.getReqId(), "刪除任務");
        /*
         * 已完成且有工时事实的任务不能删（否则产出与负载会被静默抹掉）；
         * 但已完成却从未填报过任何工时的任务可以删：不删它会永久卡在
         * 「實際工時已填報」这道上线闸门里，而它本来就没有任何可保留的事实。
         */
        BigDecimal reported = sumWorkHours(task.getId());
        boolean hasEffortFact = (reported != null && reported.signum() > 0)
                || (task.getActualHours() != null && task.getActualHours().signum() > 0)
                || (task.getActualFinishTime() != null && reported != null);
        if (TASK_DONE.equals(task.getStatus()) && hasEffortFact) {
            throw new BusinessException("已完成且已填報工時的任務不允許刪除（如計錯請先修正工時）");
        }
        taskMapper.deleteById(id);
    }

    @Override
    public RdmDeliveryVO.DeliverySummary summary(Long reqId) {
        // 汇总页只裁决一次：下面的明细方法自己也会校，但汇总已经拿到位需求，重复查角色没意义
        RdmRequirement req = accessGuard.requireVisible(reqId, "查看交付過程");
        RdmDeliveryVO.DeliverySummary summary = new RdmDeliveryVO.DeliverySummary();
        summary.setReqId(reqId);
        summary.setStatus(req.getStatus());
        summary.setPrds(prdMapper.selectList(prdQuery(reqId)).stream().map(this::toPrdVO).toList());
        summary.setReviews(reviewMapper.selectList(new LambdaQueryWrapper<RdmReview>()
                        .eq(RdmReview::getReqId, reqId).orderByDesc(RdmReview::getId))
                .stream().map(this::toReviewVO).toList());
        summary.setChanges(changeMapper.selectList(new LambdaQueryWrapper<RdmChangeRequest>()
                        .eq(RdmChangeRequest::getReqId, reqId).orderByDesc(RdmChangeRequest::getId))
                .stream().map(this::toChangeVO).toList());
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
        summary.setMilestones(milestones(reqId));
        summary.setUnreportedHoursTasks((int) tasks.stream()
                .filter(t -> TASK_DONE.equals(t.getStatus()))
                .filter(t -> t.getActualHours() == null || t.getActualHours().signum() == 0)
                .count());
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
        accessGuard.requireVisible(reqId, "查看需求變更");
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
        accessGuard.requireDeliveryWriter(req.getId(), "提交需求變更");
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
        /*
         * 阶段联动按「这条需求实际存在的任务类型」判定，而不是写死前端+后端都要有：
         * 纯后端、纯 APP、只含数据任务的需求以前永远推不到「开发完成」，只能靠人手点流转。
         */
        String type = task.getTaskType() == null ? "" : task.getTaskType();
        if ("design".equals(type) && allDone(siblings, "design")) {
            tryTransition(req.getId(), RdmConstants.ACTION_DESIGN_DONE, null);
        }
        if (DEV_TYPES.contains(type) && allExistingDone(siblings, DEV_TYPES)) {
            tryTransition(req.getId(), RdmConstants.ACTION_DEV_DONE, null);
        }
        if ("qa".equals(type) && allExistingDone(siblings, Set.of("qa"))) {
            tryTransition(req.getId(), RdmConstants.ACTION_TEST_DONE, null);
            // 转验收需一切非取消状态的任务都已完成，否则测试完了但开发未交也能进验收
            if (allExistingDone(siblings, null)) {
                tryTransition(req.getId(), RdmConstants.ACTION_SUBMIT_UAT, null);
            }
        }
    }

    /** 开发阶段的任务类型（含 APP 与数据；实际存在哪几种就要求哪几种完成） */
    private static final Set<String> DEV_TYPES = Set.of("frontend", "app", "backend", "data");

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

    /**
     * 只看「本需求实际存在的类型」：已取消的任务不参与门槛判定。
     * <p>旧逻辑用 allDone(siblings, null) 要求一切任务都已完成，一张被取消的任务
     * 就能把需求永久卡在测试阶段，而取消本身已经表达了「这活不做了」。
     */
    private static boolean allExistingDone(List<RdmWorkTask> tasks, Set<String> types) {
        List<RdmWorkTask> scoped = tasks.stream()
                .filter(t -> !TASK_CANCELLED.equals(t.getStatus()))
                .filter(t -> types == null || types.contains(t.getTaskType()))
                .toList();
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
            case "app" -> "APP 開發";
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
        // 缺报不等于 0：把未填报当成没发生，负载与估时偏差会一起被做得好看
        vo.setActualHoursReported(task.getActualHours() != null && task.getActualHours().signum() > 0);
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
        // 解析失败不能再默默返回 now：页面选的评审时间会被当成没传，
        // 而界面看上去完全正常（以前就因此把约好的评审时间全记成了“刚刚”）
        try {
            return parseDateTimeStrict(value);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("時間格式不正確：" + value + "（應為 YYYY-MM-DD HH:mm）");
        }
    }

    /**
     * 兼容 ISO（带 T）与前端常见的空格格式，升分钟精度补秒。
     * <p>LocalDateTime.parse 只认 ISO 的 'T' 分隔，直接把空格换成 T 才能进解析器。
     * <p>包内可见：时间格式是高频回归点，需要能直接拿用例钉住。
     */
    static LocalDateTime parseDateTimeStrict(String value) {
        String cleaned = value.trim().replace(' ', 'T');
        if (cleaned.length() == 16) {
            cleaned = cleaned + ":00";
        }
        if (cleaned.length() > 19) {
            cleaned = cleaned.substring(0, 19);
        }
        return LocalDateTime.parse(cleaned);
    }

    /* ==================== 阶段 3：里程碑与工时明细 ==================== */

    /** 五个关键节点（名称快照与顺序） */
    private static final Map<String, String> MILESTONE_NAMES = Map.of(
            RdmMilestone.CODE_PRD_REVIEW, "需求評審",
            RdmMilestone.CODE_DESIGN_DONE, "設計完成",
            RdmMilestone.CODE_DEV_START, "研發啟動",
            RdmMilestone.CODE_DEV_DONE, "開發完成",
            RdmMilestone.CODE_RELEASE, "上線交付");

    /** 节点顺序 */
    private static final List<String> MILESTONE_ORDER = List.of(
            RdmMilestone.CODE_PRD_REVIEW, RdmMilestone.CODE_DESIGN_DONE,
            RdmMilestone.CODE_DEV_START, RdmMilestone.CODE_DEV_DONE, RdmMilestone.CODE_RELEASE);

    /** 单任务单日工地上限（人时）：超过一个自然日小数的录入几乎一定是录错 */
    private static final BigDecimal MAX_DAILY_HOURS = new BigDecimal("24");

    /** 允许改计划的状态：进入验收/上线后再改计划已无意义，走需求变更 */
    private static final Set<String> PLAN_EDITABLE_STATUS = Set.of(
            RdmConstants.STATUS_ACCEPTED, RdmConstants.STATUS_PRD_DESIGNING, RdmConstants.STATUS_REVIEWING,
            RdmConstants.STATUS_REVIEW_PASSED, RdmConstants.STATUS_SCHEDULED, RdmConstants.STATUS_DESIGNING,
            RdmConstants.STATUS_DEVELOPING, RdmConstants.STATUS_INTEGRATION);

    /** 允许冻结基线的状态：评审通过后、交付中之前 */
    private static final Set<String> BASELINE_FREEZE_STATUS = Set.of(
            RdmConstants.STATUS_REVIEW_PASSED, RdmConstants.STATUS_SCHEDULED,
            RdmConstants.STATUS_DESIGNING, RdmConstants.STATUS_DEVELOPING);

    @Override
    public List<RdmDeliveryVO.Milestone> milestones(Long reqId) {
        accessGuard.requireVisible(reqId, "查看里程碑");
        return milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                        .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder))
                .stream().map(RdmDeliveryServiceImpl::toMilestoneVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.Milestone> saveMilestones(Long reqId, List<RdmDeliveryDTO.Milestone> list) {
        RdmRequirement req = accessGuard.requireDeliveryWriter(reqId, "規劃里程碑");
        if (!PLAN_EDITABLE_STATUS.contains(req.getStatus())) {
            throw new BusinessException("当前階段不允許修改節點計劃（已進入驗證或交付），請走需求變更");
        }
        if (list == null || list.isEmpty()) {
            throw new BusinessException("請填寫節點計劃");
        }
        SysUser current = operatorResolver.currentUser();
        String signature = operatorResolver.operatorSignature(current);
        List<Long> newlyAssignedOwners = new ArrayList<>();
        for (RdmDeliveryDTO.Milestone item : list) {
            if (item == null || !StringUtils.hasText(item.getCode())) {
                continue;
            }
            String code = item.getCode().trim().toUpperCase();
            if (!MILESTONE_NAMES.containsKey(code)) {
                throw new BusinessException("不認識的節點編碼: " + item.getCode());
            }
            RdmMilestone existing = milestoneMapper.selectOne(new LambdaQueryWrapper<RdmMilestone>()
                    .eq(RdmMilestone::getReqId, reqId).eq(RdmMilestone::getCode, code).last("LIMIT 1"));
            String status = StringUtils.hasText(item.getStatus()) ? item.getStatus().trim() : RdmMilestone.STATUS_PENDING;
            if (!List.of(RdmMilestone.STATUS_PENDING, RdmMilestone.STATUS_DONE, RdmMilestone.STATUS_NOT_APPLICABLE).contains(status)) {
                throw new BusinessException("不支援的節點狀態: " + status);
            }
            if (RdmMilestone.STATUS_NOT_APPLICABLE.equals(status) && !StringUtils.hasText(item.getNaReason())) {
                throw new BusinessException("「" + MILESTONE_NAMES.get(code) + "」標為不適用時必須寫明原因");
            }
            if (existing != null && existing.getBaselineDate() != null
                    && item.getPreliminaryDate() != null
                    && !existing.getPreliminaryDate().equals(parseDate(item.getPreliminaryDate()))) {
                // 基线已冻结：初步计划是历史事实，要改只能改「预测」
                throw new BusinessException("「" + MILESTONE_NAMES.get(code)
                        + "」基線已凍結，初步計劃不可改；如需延期請調整預測日期");
            }
            RdmMilestone row = existing == null ? new RdmMilestone() : existing;
            row.setReqId(reqId);
            row.setCode(code);
            row.setName(StringUtils.hasText(item.getName()) ? item.getName().trim() : MILESTONE_NAMES.get(code));
            row.setSortOrder(MILESTONE_ORDER.indexOf(code) + 1);
            row.setStatus(status);
            row.setNaReason(RdmMilestone.STATUS_NOT_APPLICABLE.equals(status) ? item.getNaReason().trim() : null);
            boolean firstAssignment = row.getOwnerUserId() == null && item.getOwnerUserId() != null;
            applyMilestoneOwner(row, item, code, reqId);
            LocalDate preliminary = parseDate(item.getPreliminaryDate());
            LocalDate forecast = parseDate(item.getForecastDate());
            if (preliminary != null && row.getBaselineDate() != null && preliminary.isAfter(row.getBaselineDate())) {
                throw new BusinessException("初步計劃不得晚於已凍結基線：" + row.getName());
            }
            // 未冻结基线时，初步计划同时作为默认预测；已冻结后只能单独改 forecast
            row.setPreliminaryDate(preliminary != null ? preliminary : row.getPreliminaryDate());
            if (row.getBaselineDate() == null && preliminary != null) {
                row.setForecastDate(preliminary);
            }
            if (forecast != null) {
                row.setForecastDate(forecast);
            }
            if (row.getId() == null) {
                row.setCreatedBy(signature);
                milestoneMapper.insert(row);
            } else {
                row.setUpdatedBy(signature);
                milestoneMapper.updateById(row);
            }
            if (firstAssignment && item.getOwnerUserId() != null) {
                newlyAssignedOwners.add(item.getOwnerUserId());
            }
        }
        // 计划确定后联动相关研发：不通知的话节点只是纸面上的日期
        notifyMilestoneOwners(req, newlyAssignedOwners, current);
        return milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                        .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder))
                .stream().map(RdmDeliveryServiceImpl::toMilestoneVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.Milestone> freezeMilestoneBaseline(Long reqId) {
        RdmRequirement req = accessGuard.requireDeliveryWriter(reqId, "凍結基線");
        if (!BASELINE_FREEZE_STATUS.contains(req.getStatus())) {
            throw new BusinessException("只有「評審通過」到「開發中」之間可凍結基線，當前狀態："
                    + (req.getStatus() == null ? "-" : req.getStatus()));
        }
        List<RdmMilestone> rows = milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder));
        if (rows.isEmpty()) {
            throw new BusinessException("尚未規劃節點計劃，無從凍結基線");
        }
        List<RdmMilestone> missing = rows.stream()
                .filter(r -> !RdmMilestone.STATUS_NOT_APPLICABLE.equals(r.getStatus()))
                .filter(r -> r.getBaselineDate() == null)
                .filter(r -> r.getForecastDate() == null && r.getPreliminaryDate() == null)
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException("節點「" + missing.get(0).getName() + "」還未給出計劃日期，請先補全");
        }
        boolean frozenAny = false;
        for (RdmMilestone row : rows) {
            if (row.getBaselineDate() != null) {
                continue;
            }
            LocalDate base = row.getForecastDate() != null ? row.getForecastDate() : row.getPreliminaryDate();
            if (RdmMilestone.STATUS_NOT_APPLICABLE.equals(row.getStatus())) {
                // 不适用的节点不占基线，否则上线后会出现一个虚假的「延期 0 天」分母
                continue;
            }
            row.setBaselineDate(base);
            row.setUpdatedBy(operatorResolver.operatorSignature(operatorResolver.currentUser()));
            milestoneMapper.updateById(row);
            frozenAny = true;
        }
        if (!frozenAny) {
            throw new BusinessException("基線已凍結，無需重複操作");
        }
        log.info("里程碑基線已凍結: reqNo={}, nodes={}", req.getReqNo(), rows.size());
        return milestones(reqId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.WorkLog> saveWorkLogs(Long taskId, List<RdmDeliveryDTO.WorkLog> logs) {
        RdmWorkTask task = requireTask(taskId);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        // 实际工时只能由本人填：它同时是负载与估时偏差的事实底稿，代填会两项一起做假
        if (!operatorResolver.isAdmin(current) && !current.getId().equals(task.getOwnerUserId())) {
            throw new BusinessException("僅任務負責人本人可填報工時");
        }
        if (logs == null || logs.isEmpty()) {
            throw new BusinessException("請填寫工時明細");
        }
        String signature = operatorResolver.operatorSignature(current);
        for (RdmDeliveryDTO.WorkLog item : logs) {
            if (item == null || item.getHours() == null) {
                continue;
            }
            if (item.getHours().signum() <= 0 || item.getHours().compareTo(MAX_DAILY_HOURS) > 0) {
                throw new BusinessException("單日工時必須大於 0 且不超過 24 人時");
            }
            LocalDate workDate = parseDate(item.getWorkDate());
            if (workDate == null) {
                throw new BusinessException("請選擇工作日期");
            }
            if (workDate.isAfter(LocalDate.now())) {
                throw new BusinessException("工作日期不能是未來");
            }
            if (task.getPlanStartDate() != null && workDate.isBefore(task.getPlanStartDate())) {
                throw new BusinessException("工作日期不能早於任務計劃開始日 " + task.getPlanStartDate());
            }
            recordWorkLog(task, item.getHours(), item.getRemark(), current, workDate);
        }
        BigDecimal total = sumWorkHours(taskId);
        RdmWorkTask patch = new RdmWorkTask();
        patch.setId(taskId);
        patch.setActualHours(total);
        patch.setUpdatedBy(signature);
        taskMapper.updateById(patch);
        return workLogs(taskId);
    }

    @Override
    public List<RdmDeliveryVO.PrdSnapshot> prdSnapshots(Long prdId) {
        RdmPrd prd = requirePrd(prdId);
        accessGuard.requireVisible(prd.getReqId(), "查看 PRD 版本");
        return prdSnapshotMapper.selectList(new LambdaQueryWrapper<RdmPrdSnapshot>()
                        .eq(RdmPrdSnapshot::getPrdId, prdId).orderByDesc(RdmPrdSnapshot::getSnapshotTime))
                .stream().map(row -> {
                    RdmDeliveryVO.PrdSnapshot vo = new RdmDeliveryVO.PrdSnapshot();
                    vo.setId(row.getId());
                    vo.setPrdId(row.getPrdId());
                    vo.setVersionNo(row.getVersionNo());
                    vo.setTitle(row.getTitle());
                    vo.setConclusion(row.getConclusion());
                    vo.setConclusionDesc(row.getConclusionDesc());
                    vo.setReviewerNames(namesOfIds(row.getReviewerIds()));
                    vo.setSnapshotTime(DateTimeUtils.format(row.getSnapshotTime()));
                    return vo;
                }).toList();
    }

    /** 某任务的工时明细（供任务表单与工时展示复用） */
    private List<RdmDeliveryVO.WorkLog> workLogs(Long taskId) {
        return workLogMapper.selectList(new LambdaQueryWrapper<RdmWorkLog>()
                        .eq(RdmWorkLog::getTaskId, taskId).orderByDesc(RdmWorkLog::getWorkDate))
                .stream().map(row -> {
                    RdmDeliveryVO.WorkLog vo = new RdmDeliveryVO.WorkLog();
                    vo.setId(row.getId());
                    vo.setTaskId(row.getTaskId());
                    vo.setUserId(row.getUserId());
                    vo.setUserName(row.getUserName());
                    vo.setWorkDate(DateTimeUtils.format(row.getWorkDate()));
                    vo.setHours(row.getHours());
                    vo.setRemark(row.getRemark());
                    vo.setUpdatedBy(row.getUpdatedBy());
                    return vo;
                }).toList();
    }

    /** 登记或修订当日工时明细（同人同任务同日为一条，修订保留最后修改人与时间） */
    private void recordWorkLog(RdmWorkTask task, BigDecimal hours, String remark, SysUser user, LocalDate day) {
        RdmWorkLog existing = workLogMapper.selectOne(new LambdaQueryWrapper<RdmWorkLog>()
                .eq(RdmWorkLog::getTaskId, task.getId())
                .eq(RdmWorkLog::getUserId, user.getId())
                .eq(RdmWorkLog::getWorkDate, day).last("LIMIT 1"));
        String signature = operatorResolver.operatorSignature(user);
        if (existing == null) {
            RdmWorkLog log = new RdmWorkLog();
            log.setTaskId(task.getId());
            log.setReqId(task.getReqId());
            log.setUserId(user.getId());
            log.setUserName(user.getName());
            log.setWorkDate(day);
            log.setHours(hours);
            log.setRemark(remark);
            log.setCreatedBy(signature);
            log.setUpdatedBy(signature);
            workLogMapper.insert(log);
            return;
        }
        // 进度上报会多次带入工时：同日累加而不是覆盖，否则一天多次上报只剩最后一条
        existing.setHours(existing.getHours() == null ? hours : existing.getHours().add(hours));
        existing.setRemark(remark);
        existing.setUpdatedBy(signature);
        workLogMapper.updateById(existing);
    }

    /** 任务实际工时 = 明细汇总（没有明细就是 null，不拿 0 冒充“报过”） */
    private BigDecimal sumWorkHours(Long taskId) {
        List<RdmWorkLog> rows = workLogMapper.selectList(new LambdaQueryWrapper<RdmWorkLog>()
                .eq(RdmWorkLog::getTaskId, taskId));
        if (rows.isEmpty()) {
            return null;
        }
        return rows.stream().map(RdmWorkLog::getHours).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 计划确定/变更后提醒节点负责人：不然节点只是 PM 自己选的日期 */
    private void notifyMilestoneOwners(RdmRequirement req, List<Long> ownerIds, SysUser operator) {
        if (ownerIds == null || ownerIds.isEmpty()) {
            return;
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_TASK_ASSIGNED, req, ownerIds, "你被排入需求關鍵節點",
                "### 📅 節點計劃已確定\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **排期人**: " + (operator == null ? "-" : operator.getName())
                        + "\n\n请在「交付工作台」确认自己的工时与起止日期，不一致请尽早提出。");
    }

    private void applyMilestoneOwner(RdmMilestone row, RdmDeliveryDTO.Milestone item, String code, Long reqId) {
        if (item.getOwnerUserId() == null) {
            return;
        }
        SysUser owner = userMapper.selectById(item.getOwnerUserId());
        if (owner == null) {
            throw new BusinessException("節點負責人不存在或已停用");
        }
        requireTaskOwnerEligible(owner);
        row.setOwnerUserId(owner.getId());
        row.setOwnerName(owner.getName());
        // 节点负责人同时成为需求参与人，否则他在详情页看不到自己的节点
        bindParticipant(reqId, owner, roleOfTaskType(taskTypeOfMilestone(code)));
    }

    /** 节点→任务类型（只用于推断参与角色，不参与阶段门槛判定） */
    private static String taskTypeOfMilestone(String code) {
        return switch (code) {
            case RdmMilestone.CODE_DESIGN_DONE -> "design";
            case RdmMilestone.CODE_DEV_START, RdmMilestone.CODE_DEV_DONE -> "backend";
            default -> "qa";
        };
    }

    private static RdmDeliveryVO.Milestone toMilestoneVO(RdmMilestone row) {
        RdmDeliveryVO.Milestone vo = new RdmDeliveryVO.Milestone();
        vo.setId(row.getId());
        vo.setCode(row.getCode());
        vo.setName(StringUtils.hasText(row.getName()) ? row.getName() : RdmMilestone.CODE_RELEASE.equals(row.getCode()) ? "上線交付" : row.getCode());
        vo.setOwnerUserId(row.getOwnerUserId());
        vo.setOwnerName(row.getOwnerName());
        vo.setPreliminaryDate(DateTimeUtils.format(row.getPreliminaryDate()));
        vo.setBaselineDate(DateTimeUtils.format(row.getBaselineDate()));
        vo.setForecastDate(DateTimeUtils.format(row.getForecastDate()));
        vo.setActualDate(DateTimeUtils.format(row.getActualDate()));
        vo.setStatus(row.getStatus());
        vo.setNaReason(row.getNaReason());
        vo.setSortOrder(row.getSortOrder());
        vo.setBaselineLocked(row.getBaselineDate() != null);
        LocalDate against = row.getBaselineDate() != null ? row.getBaselineDate()
                : (row.getForecastDate() != null ? row.getForecastDate() : row.getPreliminaryDate());
        LocalDate real = row.getActualDate() != null ? row.getActualDate()
                : (RdmMilestone.STATUS_DONE.equals(row.getStatus()) ? LocalDate.now() : null);
        if (against != null && real != null) {
            vo.setSlipDays((int) java.time.temporal.ChronoUnit.DAYS.between(against, real));
        }
        return vo;
    }

    /* ==================== 阶段 3 校验与版本辅助 ==================== */

    /** 评审中与已通过的 PRD 都是「已定稿内容」，不可原地修改 */
    private static boolean isFrozen(String prdStatus) {
        return PRD_APPROVED.equals(prdStatus) || PRD_REVIEWING.equals(prdStatus);
    }

    /**
     * 以新版本方式修改定稿 PRD：复制一行新草稿，版本号递增，父指向原版本。
     * <p>原版本及其定稿快照一行不改地留着，这样事后能看出「哪一版被谁批过」。
     */
    private RdmPrd forkVersion(RdmPrd origin, RdmDeliveryDTO.Prd dto, SysUser current) {
        RdmPrd copy = new RdmPrd();
        /*
         * 新版本必须拿自己的单号：rdm_prd 上有 uk_rdm_prd_no，沿用原编号会直接撞唯一索引，
         * 让「以新版本修改」100% 失败（深度测试实测：报成“数据已存在，请刷新重试”会误导用户反复重试）。
         */
        copy.setPrdNo(bizSeqService.next(SEQ_PRD));
        copy.setReqId(origin.getReqId());
        copy.setParentPrdId(origin.getId());
        copy.setTitle(origin.getTitle());
        copy.setTargetUsers(origin.getTargetUsers());
        copy.setFeatureList(origin.getFeatureList());
        copy.setAcceptanceCriteria(origin.getAcceptanceCriteria());
        copy.setContentRich(origin.getContentRich());
        copy.setPrototypeUrl(origin.getPrototypeUrl());
        copy.setStatus(PRD_DRAFT);
        copy.setVersionNo(nextVersion(prdMapper.selectList(new LambdaQueryWrapper<RdmPrd>()
                .eq(RdmPrd::getReqId, origin.getReqId()))));
        copy.setAuthorUserId(current == null ? origin.getAuthorUserId() : current.getId());
        copy.setAuthorName(current == null ? origin.getAuthorName() : current.getName());
        copy.setCreatedBy(operatorResolver.operatorSignature(current));
        prdMapper.insert(copy);
        log.info("PRD 已開新版本: prdNo={}, {} -> {}, reason={}",
                copy.getPrdNo(), origin.getVersionNo(), copy.getVersionNo(), dto.getChangeReason());
        return copy;
    }

    /**
     * 版本号递增（v1.2 → v1.3）。
     * <p>必须看同一需求下已有的最高版本，而不是只加父版本的号：
     * 同一父版本改两次会得到两个 v1.1，列表上根分不清先后（深度测试实测）。
     */
    private static String nextVersion(java.util.Collection<RdmPrd> siblings) {
        int maxMinor = 0;
        String maxMajor = "0";
        boolean found = false;
        for (RdmPrd sibling : siblings) {
            String body = sibling.getVersionNo() == null ? "" : (sibling.getVersionNo().startsWith("v")
                    ? sibling.getVersionNo().substring(1) : sibling.getVersionNo());
            String[] parts = body.split("\\.");
            if (parts.length != 2) {
                continue;
            }
            try {
                String major = parts[0];
                int minor = Integer.parseInt(parts[1]);
                if (!found || minor > maxMinor) {
                    maxMinor = minor;
                    maxMajor = major;
                    found = true;
                }
            } catch (NumberFormatException ignored) {
                log.debug("PRD 版本号脏数据，不参与递增计算: {}", sibling.getVersionNo());
            }
        }
        return found ? "v" + maxMajor + "." + (maxMinor + 1) : "v1.1";
    }

    /** 评审结论落定时冻结一版内容快照（通过与否都记，退回也要能查到当时被退回的是哪一版） */
    private void snapshotPrd(RdmPrd prd, RdmReview review, boolean passed, SysUser current) {
        RdmPrdSnapshot snapshot = new RdmPrdSnapshot();
        snapshot.setPrdId(prd.getId());
        snapshot.setReqId(prd.getReqId());
        snapshot.setVersionNo(prd.getVersionNo());
        snapshot.setTitle(prd.getTitle());
        snapshot.setFeatureList(prd.getFeatureList());
        snapshot.setAcceptanceCriteria(prd.getAcceptanceCriteria());
        snapshot.setContentRich(prd.getContentRich());
        snapshot.setPrototypeUrl(prd.getPrototypeUrl());
        snapshot.setReviewId(review.getId());
        snapshot.setConclusion(passed ? REVIEW_PASSED : REVIEW_REJECTED);
        snapshot.setConclusionDesc(review.getConclusionDesc());
        snapshot.setReviewerIds(review.getParticipantIds());
        snapshot.setSnapshotTime(LocalDateTime.now());
        snapshot.setCreatedBy(operatorResolver.operatorSignature(current));
        snapshot.setUpdatedBy(snapshot.getCreatedBy());
        prdSnapshotMapper.insert(snapshot);
    }

    /** 任务表单硬校验：这些都不拦的话，负载与产能对账会拿到永远对不上的数 */
    private static void validateTaskForm(RdmDeliveryDTO.Task dto) {
        if (dto.getTitle() != null && dto.getTitle().length() > 200) {
            throw new BusinessException("任務標題最長 200 字");
        }
        if (!List.of("design", "frontend", "app", "backend", "qa", "data").contains(dto.getTaskType())) {
            throw new BusinessException("不支援的任務類型: " + dto.getTaskType());
        }
        if (dto.getPlanHours() != null
                && (dto.getPlanHours().signum() < 0 || dto.getPlanHours().compareTo(new BigDecimal("999")) > 0)) {
            throw new BusinessException("計劃工時必須在 0-999 人時之間");
        }
        LocalDate start = parseDate(dto.getPlanStartDate());
        LocalDate finish = parseDate(dto.getPlanFinishDate());
        if (start != null && finish != null && start.isAfter(finish)) {
            throw new BusinessException("計劃開始日不能晚於計劃完成日");
        }
    }

    /**
     * 任务负责人资格：在职启用且能进交付工作台（或持有需求处理权）。
     * <p>不校这一条时，任务可以派给一个打开页面只会看到“无权”的人，待办照发但没人能干活。
     */
    private void requireTaskOwnerEligible(SysUser owner) {
        if (owner.getStatus() != null && owner.getStatus() == 0) {
            throw new BusinessException("任務負責人「" + owner.getName() + "」已離職或停用，請改派他人");
        }
        boolean able = permissionService.hasPermission(owner, RdmConstants.MENU_DELIVERY_BOARD, "edit")
                || permissionService.hasPermission(owner, RdmConstants.MENU_REQUIREMENT, "edit");
        if (!able) {
            throw new BusinessException("「" + owner.getName() + "」當前無研發交付權限，無法上報進度，請先在授權中心配置");
        }
    }

    /** 参与人ID串 → 姓名串（快照展示用，不泄露多余字段） */
    private String namesOfIds(String ids) {
        if (!StringUtils.hasText(ids)) {
            return null;
        }
        List<String> names = new ArrayList<>();
        for (String part : ids.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                SysUser user = userMapper.selectById(Long.valueOf(trimmed));
                if (user != null) {
                    names.add(user.getName());
                }
            } catch (NumberFormatException ignored) {
                log.debug("快照參與人字段存在非数字脏数据: {}", trimmed);
            }
        }
        return names.isEmpty() ? null : String.join("、", names);
    }

    private static int toInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}
