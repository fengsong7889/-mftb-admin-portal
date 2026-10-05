package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 需求准入审批回调：OA 引擎审完 → 回写需求状态。
 * <p>与 HR 入转调离回调同口径——办理失败只记日志、不回滚审批流转，
 * 单据停在原状态，下次审批或人工重试可再推。
 * <p>此处不复用 {@code RdmRequirementService.transition}：审批人权限已由 OA 引擎校验过，
 * 再走一遍状态机角色守卫会形成「审批通过但状态机拒绝」的死锁；本回调只负责落状态与留痕。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmIntakeCallbackService {

    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final RdmStatusLogMapper statusLogMapper;
    private final RdmConfigService configService;
    private final RdmNotifyService notifyService;

    /** 是否需求准入流程 */
    public boolean isIntakeProcess(String processCode) {
        return RdmConstants.INTAKE_PROCESS_CODE.equals(processCode);
    }

    /** 审批全部通过 → 需求进入需求池（等技术负责人分配） */
    public void onFlowApproved(String flowNo) {
        RdmRequirement req = findByFlow(flowNo);
        if (req == null) {
            log.warn("需求准入回調未找到需求: flowNo={}", flowNo);
            return;
        }
        if (!RdmConstants.STATUS_INTAKE_PENDING.equals(req.getStatus())) {
            log.info("需求准入回調跳過（狀態已變更）: reqNo={}, status={}", req.getReqNo(), req.getStatus());
            return;
        }
        moveToPool(req, RdmConstants.ACTION_APPROVE_INTAKE, "審批通過，進入需求池");
        notifyService.notifyUserIds(RdmConstants.EVENT_INTAKE_PASS, req, List.of(req.getSubmitterUserId()),
                "需求已通過准入", "### ✅ 需求准入通過\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: "
                        + req.getTitle() + "\n\n已進入需求池，等待技術部分配產品經理。");
        // 需求池是新需求的落点，同步提醒技术负责人，避免需求在池里静默积压
        notifyService.notifyUsers(RdmConstants.EVENT_ASSIGNED, req, List.of(),
                "需求池新增待分配需求", "### 📥 需求池待分配\n\n- **編號**: " + req.getReqNo()
                        + "\n- **標題**: " + req.getTitle() + "\n- **提出人**: " + req.getSubmitterName()
                        + "\n- **優先級**: " + req.getPriority() + "\n\n請盡快分配產品經理（超時將升級提醒）。");
    }

    /** 审批驳回 → 需求回到「审批驳回」，提出人可修改后重提 */
    public void onFlowRejected(String flowNo, String reason) {
        RdmRequirement req = findByFlow(flowNo);
        if (req == null) {
            log.warn("需求准入駁回回調未找到需求: flowNo={}", flowNo);
            return;
        }
        String fromStatus = req.getStatus();
        LocalDateTime now = LocalDateTime.now();
        req.setStatus(RdmConstants.STATUS_INTAKE_REJECTED);
        req.setStatusEnterTime(now);
        req.setCurrentHandlerName(req.getSubmitterName());
        req.setRejectReason(StringUtils.hasText(reason) ? reason : "需求未通過准入審批");
        req.setRejectCount((req.getRejectCount() == null ? 0 : req.getRejectCount()) + 1);
        requirementMapper.updateById(req);

        closeOpenLog(req.getId(), now);
        appendLog(req, fromStatus, RdmConstants.ACTION_REJECT_INTAKE, req.getRejectReason());

        notifyService.notifyUserIds(RdmConstants.EVENT_INTAKE_REJECT, req, List.of(req.getSubmitterUserId()),
                "需求被駁回", "### ⛔ 需求未通過准入\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: "
                        + req.getTitle() + "\n- **駁回理由**: " + req.getRejectReason()
                        + "\n\n可修改後重新提交，或與審批人當面對齊。");
        log.info("需求准入已駁回: reqNo={}, reason={}", req.getReqNo(), req.getRejectReason());
    }

    private RdmRequirement findByFlow(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        return requirementMapper.selectOne(new LambdaQueryWrapper<RdmRequirement>()
                .eq(RdmRequirement::getIntakeFlowNo, flowNo)
                .orderByDesc(RdmRequirement::getId)
                .last("LIMIT 1"));
    }

    /** 状态推进到需求池（分配环节由技术负责人接手，产品经理尚未确定） */
    private void moveToPool(RdmRequirement req, String actionCode, String remark) {
        String fromStatus = req.getStatus();
        LocalDateTime now = LocalDateTime.now();
        req.setStatus(RdmConstants.STATUS_POOL);
        req.setStatusEnterTime(now);
        req.setCurrentHandlerName("技術負責人");
        req.setOverdueFlag(0);
        requirementMapper.updateById(req);
        closeOpenLog(req.getId(), now);
        appendLog(req, fromStatus, actionCode, remark);
        log.info("需求已進入需求池: reqNo={}, 之前狀態={}", req.getReqNo(), fromStatus);
    }

    private void appendLog(RdmRequirement req, String fromStatus, String actionCode, String remark) {
        RdmStatusLog entry = new RdmStatusLog();
        entry.setReqId(req.getId());
        entry.setFromStatus(fromStatus);
        entry.setToStatus(req.getStatus());
        entry.setActionCode(actionCode);
        entry.setOperatorName("審批引擎");
        entry.setOperatorRole(RdmConstants.ROLE_APPROVER);
        entry.setRemark(remark);
        entry.setEnterTime(req.getStatusEnterTime());
        entry.setIsOverdue(0);
        statusLogMapper.insert(entry);
    }

    private void closeOpenLog(Long reqId, LocalDateTime now) {
        List<RdmStatusLog> open = statusLogMapper.selectList(new LambdaQueryWrapper<RdmStatusLog>()
                .eq(RdmStatusLog::getReqId, reqId).isNull(RdmStatusLog::getLeaveTime)
                .orderByDesc(RdmStatusLog::getId).last("LIMIT 1"));
        for (RdmStatusLog log : open) {
            log.setLeaveTime(now);
            log.setDurationSeconds(log.getEnterTime() == null
                    ? 0L : Duration.between(log.getEnterTime(), now).getSeconds());
            statusLogMapper.updateById(log);
        }
    }

    /** 需求池责任人（用于超时升级提醒） */
    public List<RdmRequirementRole> dispatcherRoles(Long reqId) {
        return roleMapper.selectList(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getRoleCode, RdmConstants.ROLE_DISPATCHER)
                .eq(RdmRequirementRole::getIsActive, 1));
    }

    /** 状态名称（通知文案用） */
    public String statusLabel(String status) {
        return configService.statusLabelMap().getOrDefault(status, status);
    }

    /** 流转动作名称 */
    public String actionName(String fromStatus, String actionCode) {
        RdmConfigVO.Transition rule = configService.findTransition(fromStatus, actionCode);
        return rule == null ? actionCode : rule.getActionName();
    }

    /** 时间格式统一（通知文案） */
    public static String formatTime(LocalDateTime time) {
        return DateTimeUtils.format(time);
    }
}
