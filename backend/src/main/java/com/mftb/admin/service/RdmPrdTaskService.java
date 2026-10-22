package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 产品经理 PRD 任务：把「承诺出 PRD 日期」变成一条真实任务。
 *
 * <p>为什么需要独立服务：受理动作在 {@link com.mftb.admin.service.impl.RdmRequirementServiceImpl}，
 * PRD 提交/评审结论在 {@link com.mftb.admin.service.impl.RdmDeliveryServiceImpl}，
 * 两边都要维护同一条任务的生命周期。抽到这里可以保证任务口径只有一份，
 * 也避免把任务表写入散落到两个业务服务里。
 *
 * <p>任务口径：
 * <ul>
 *   <li>受理时创建：负责人=产品经理，计划完成日=承诺出 PRD 日期，类型={@code prd}；</li>
 *   <li>PRD 提交评审时完成：承诺兑现的时点是「PRD 已输出」，不是评审通过；</li>
 *   <li>评审退回时重新打开：返工说明 PRD 还需要继续改；</li>
 *   <li>改派产品经理时同步负责人，但已完成的历史任务不改写。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmPrdTaskService {

    /** 与 rdm_task_type_config.code 同源；字典停用不影响存量任务解析 */
    public static final String TASK_TYPE_PRD = "prd";
    /** 任务标题：写清交付物与完成动作，避免只写「PRD」看不出要做什么 */
    public static final String PRD_TASK_TITLE = "產出 PRD 並提交評審";

    private final RdmWorkTaskMapper taskMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /**
     * 幂等创建/同步 PRD 任务。
     * <p>受理、PRD 保存、存量补建都会调用；已有未完成任务时只同步负责人与承诺日期，
     * 已完成/已取消的历史任务保持原样。
     */
    @Transactional(rollbackFor = Exception.class)
    public void ensureTask(RdmRequirement req, SysUser actor) {
        if (req == null || req.getId() == null || req.getPromisedPrdDate() == null) {
            return;
        }
        SysUser owner = resolveOwner(req, actor);
        RdmWorkTask existing = taskMapper.selectOne(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId())
                .eq(RdmWorkTask::getTaskType, TASK_TYPE_PRD)
                .ne(RdmWorkTask::getStatus, "cancelled")
                .orderByDesc(RdmWorkTask::getId)
                .last("LIMIT 1"));
        if (existing != null) {
            if ("done".equals(existing.getStatus())) {
                return;
            }
            LambdaUpdateWrapper<RdmWorkTask> update = new LambdaUpdateWrapper<RdmWorkTask>()
                    .eq(RdmWorkTask::getId, existing.getId())
                    .set(RdmWorkTask::getPlanFinishDate, req.getPromisedPrdDate())
                    .set(RdmWorkTask::getIterationCode, req.getIterationCode())
                    .set(RdmWorkTask::getUpdatedBy, operatorResolver.operatorSignature(actor));
            if (owner != null) {
                update.set(RdmWorkTask::getOwnerUserId, owner.getId())
                        .set(RdmWorkTask::getOwnerName, owner.getName())
                        .set(RdmWorkTask::getOwnerEmpNo, owner.getEmpId());
            }
            taskMapper.update(null, update);
            return;
        }
        RdmWorkTask task = new RdmWorkTask();
        task.setTaskNo(bizSeqService.next(BizSeqService.RULE_RDM_WORK_TASK));
        task.setReqId(req.getId());
        task.setTaskType(TASK_TYPE_PRD);
        task.setTitle(PRD_TASK_TITLE);
        task.setContent("需求受理時承諾 " + req.getPromisedPrdDate() + " 前產出 PRD；提交評審後本任務自動完成。");
        task.setOwnerUserId(owner == null ? req.getAssigneePmUserId() : owner.getId());
        task.setOwnerName(owner == null ? req.getAssigneePmName() : owner.getName());
        task.setOwnerEmpNo(owner == null ? req.getAssigneePmEmpNo() : owner.getEmpId());
        task.setRoleCode(RdmConstants.ROLE_PM);
        task.setStatus("todo");
        task.setProgress(0);
        // 承诺日期是产品经理给的交付时点；开始日期用受理日，缺失时退回承诺日，保证甘特有可画区间
        LocalDate start = req.getAcceptTime() == null ? req.getPromisedPrdDate() : req.getAcceptTime().toLocalDate();
        task.setPlanStartDate(start);
        task.setPlanFinishDate(req.getPromisedPrdDate());
        task.setIterationCode(req.getIterationCode());
        task.setPlanVersion(1);
        task.setCreatedBy(operatorResolver.operatorSignature(actor));
        task.setUpdatedBy(task.getCreatedBy());
        taskMapper.insert(task);
        log.info("RDM PRD 任務已生成: reqNo={}, taskNo={}, owner={}, promised={}",
                req.getReqNo(), task.getTaskNo(), task.getOwnerName(), req.getPromisedPrdDate());
    }

    /** PRD 提交评审 = 承诺兑现；返回受影响行数便于调用方判断是否真的收口 */
    @Transactional(rollbackFor = Exception.class)
    public int completeTask(Long reqId, SysUser actor) {
        if (reqId == null) {
            return 0;
        }
        int affected = taskMapper.update(null, new LambdaUpdateWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId)
                .eq(RdmWorkTask::getTaskType, TASK_TYPE_PRD)
                .in(RdmWorkTask::getStatus, "todo", "doing", "blocked")
                .set(RdmWorkTask::getStatus, "done")
                .set(RdmWorkTask::getProgress, 100)
                .set(RdmWorkTask::getBlockedReason, null)
                .set(RdmWorkTask::getActualFinishTime, LocalDateTime.now())
                .set(RdmWorkTask::getUpdatedBy, operatorResolver.operatorSignature(actor)));
        if (affected > 0) {
            log.info("RDM PRD 任務已完成: reqId={}, affected={}, operator={}", reqId, affected,
                    operatorResolver.operatorSignature(actor));
        }
        return affected;
    }

    /** 评审退回：PRD 仍需返工，任务重新打开（已完成的才动，避免把进行中的进度重置） */
    @Transactional(rollbackFor = Exception.class)
    public int reopenTask(Long reqId, SysUser actor) {
        if (reqId == null) {
            return 0;
        }
        int affected = taskMapper.update(null, new LambdaUpdateWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId)
                .eq(RdmWorkTask::getTaskType, TASK_TYPE_PRD)
                .eq(RdmWorkTask::getStatus, "done")
                .set(RdmWorkTask::getStatus, "doing")
                .set(RdmWorkTask::getProgress, 50)
                .set(RdmWorkTask::getActualFinishTime, null)
                .set(RdmWorkTask::getUpdatedBy, operatorResolver.operatorSignature(actor)));
        if (affected > 0) {
            log.info("RDM PRD 任務已重新打開: reqId={}, operator={}", reqId,
                    operatorResolver.operatorSignature(actor));
        }
        return affected;
    }

    /** 改派产品经理：只同步未完成任务的负责人，已完成任务保留历史归属 */
    @Transactional(rollbackFor = Exception.class)
    public int syncOwner(RdmRequirement req, SysUser newPm, SysUser actor) {
        if (req == null || req.getId() == null || newPm == null) {
            return 0;
        }
        return taskMapper.update(null, new LambdaUpdateWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId())
                .eq(RdmWorkTask::getTaskType, TASK_TYPE_PRD)
                .in(RdmWorkTask::getStatus, "todo", "doing", "blocked")
                .set(RdmWorkTask::getOwnerUserId, newPm.getId())
                .set(RdmWorkTask::getOwnerName, newPm.getName())
                .set(RdmWorkTask::getOwnerEmpNo, newPm.getEmpId())
                .set(RdmWorkTask::getUpdatedBy, operatorResolver.operatorSignature(actor)));
    }

    /** 负责人以需求受理人为准；受理人查不到时退回操作人，保证任务至少有可追溯的人 */
    private SysUser resolveOwner(RdmRequirement req, SysUser actor) {
        if (req.getAssigneePmUserId() == null) {
            return actor;
        }
        SysUser pm = userMapper.selectById(req.getAssigneePmUserId());
        if (pm == null) {
            log.warn("RDM PRD 任務負責人 {} 不存在或已刪除，退回操作人: reqId={}",
                    req.getAssigneePmUserId(), req.getId());
        }
        return pm == null ? actor : pm;
    }
}
