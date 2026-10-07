package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
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
 * <p>不复用 {@code RdmRequirementService.transition}：审批人权限已由 OA 引擎校验过，
 * 再走一遍状态机角色守卫会形成「审批通过但状态机拒绝」的死锁；本回调只负责落状态与留痕。
 * <p>阶段 2B 补上的两条硬约束：
 * <ol>
 *   <li><b>幂等</b>：先用轮次的 pending 作为闸门（UPDATE ... WHERE decision='pending'），
 *       抢不到就不推需求，避免重复回调重复计数/重复通知；</li>
 *   <li><b>旧轮不能推动新轮</b>：回调查到的轮次必须是需求的当前轮，
 *       否则一张被驳回后已重提的需求会被迟到的旧单结果直接抬进需求池。</li>
 * </ol>
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
    private final RdmIntakeRoundService roundService;
    private final SysUserMapper userMapper;

    /** 是否需求准入流程 */
    public boolean isIntakeProcess(String processCode) {
        return RdmConstants.INTAKE_PROCESS_CODE.equals(processCode);
    }

    /** 审批全部通过 → 有指定 PM 且仍有效则直达受理，否则进需求池等技术负责人分配 */
    public void onFlowApproved(String flowNo) {
        RdmIntakeRoundService.Round round = roundService.findByFlow(flowNo);
        // 轮次是闸门：拿不到 pending 就表示这一轮已被处理过（或属于已重提的旧轮），不能再看推需求
        if (round != null && !roundService.isCurrentPending(flowNo)) {
            log.info("准入回調被忽略（非当前待审轮次）: flowNo={}, round={}, decision={}",
                    flowNo, round.getRoundNo(), round.getDecision());
            return;
        }
        if (round != null && !roundService.markDecided(flowNo, RdmIntakeRoundService.DECISION_APPROVED, "審批引擎")) {
            log.info("准入回調幂等跳过（轮次已审结）: flowNo={}", flowNo);
            return;
        }
        RdmRequirement req = round != null ? requirementMapper.selectById(round.getReqId()) : findByFlow(flowNo);
        if (req == null) {
            log.warn("需求准入回調未找到需求: flowNo={}", flowNo);
            if (round != null) {
                // 轮次已标终态但需求丢了，必须留下可追查的线索
                log.error("准入輪次已標通過但需求不可用: reqId={}, flowNo={}", round.getReqId(), flowNo);
            }
            return;
        }
        if (!RdmConstants.STATUS_INTAKE_PENDING.equals(req.getStatus())) {
            log.info("需求准入回調跳過（狀態已變更）: reqNo={}, status={}", req.getReqNo(), req.getStatus());
            return;
        }
        boolean dispatched = applyIntentPm(req);
        if (dispatched) {
            moveToAssigned(req);
        } else {
            moveToPool(req, RdmConstants.ACTION_APPROVE_INTAKE, "審批通過，進入需求池");
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_INTAKE_PASS, req, List.of(req.getSubmitterUserId()),
                "需求已通過准入", "### ✅ 需求准入通過\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: "
                        + req.getTitle() + "\n\n" + (dispatched
                        ? "已按提交時指定的產品經理直送受理，無需再經需求池分配。"
                        : "已進入需求池，等待技術部分配產品經理。"));
        if (!dispatched) {
            // 需求池是新需求的落点，同步提醒技术负责人，避免需求在池里静默积压
            notifyService.notifyUsers(RdmConstants.EVENT_ASSIGNED, req, List.of(),
                    "需求池新增待分配需求", "### 📥 需求池待分配\n\n- **編號**: " + req.getReqNo()
                            + "\n- **標題**: " + req.getTitle() + "\n- **提出人**: " + req.getSubmitterName()
                            + "\n- **優先級**: " + req.getPriority() + "\n\n請盡快分配產品經理（超時將升級提醒）。"
            );
        }
    }

    /** 审批驳回 → 需求回到「审批驳回」，提出人可修改后重提 */
    public void onFlowRejected(String flowNo, String reason) {
        RdmIntakeRoundService.Round round = roundService.findByFlow(flowNo);
        if (round != null && !roundService.isCurrentPending(flowNo)) {
            log.info("准入駁回回調被忽略（非当前待审轮次）: flowNo={}, round={}, decision={}",
                    flowNo, round.getRoundNo(), round.getDecision());
            return;
        }
        if (round != null && !roundService.markDecided(flowNo, RdmIntakeRoundService.DECISION_REJECTED, "審批引擎")) {
            log.info("准入駁回回調幂等跳过（轮次已审结）: flowNo={}", flowNo);
            return;
        }
        RdmRequirement req = round != null ? requirementMapper.selectById(round.getReqId()) : findByFlow(flowNo);
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
        // 驳回后旧的受理意向已不代表本轮结论，重提时会重新裁决
        req.setIntakeFlowNo(null);
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

    /**
     * 审批通过后按提交时的意向直送产品经理受理。
     * <p>意向失效（离职/停用）时返回 false，需求回需求池等技术负责人分配，
     * 不能让一张无人受理的单停在「已分配」。
     */
    private boolean applyIntentPm(RdmRequirement req) {
        if (req.getIntentPmUserId() == null) {
            return false;
        }
        SysUser pm = userMapper.selectById(req.getIntentPmUserId());
        if (pm == null || (pm.getStatus() != null && pm.getStatus() == 0)) {
            log.info("意向產品經理已不可用，需求改回需求池分配: reqNo={}, intentPmUserId={}",
                    req.getReqNo(), req.getIntentPmUserId());
            return false;
        }
        req.setAssigneePmUserId(pm.getId());
        req.setAssigneePmEmpNo(pm.getEmpId());
        req.setAssigneePmName(pm.getName());
        req.setDistributeTime(LocalDateTime.now());
        bindPmRole(req.getId(), pm);
        return true;
    }

    /** 审批通过且已有受理人 → 直接进「已分配·待受理」，不再占需求池队列 */
    private void moveToAssigned(RdmRequirement req) {
        String fromStatus = req.getStatus();
        LocalDateTime now = LocalDateTime.now();
        req.setStatus(RdmConstants.STATUS_ASSIGNED);
        req.setStatusEnterTime(now);
        req.setCurrentHandlerName(req.getAssigneePmName());
        req.setOverdueFlag(0);
        requirementMapper.updateById(req);
        closeOpenLog(req.getId(), now);
        appendLog(req, fromStatus, RdmConstants.ACTION_APPROVE_INTAKE,
                "審批通過，按提交時指定的產品經理直送受理：" + req.getAssigneePmName());
        log.info("需求已按意向直送受理: reqNo={}, pm={}", req.getReqNo(), req.getAssigneePmName());
    }

    /** 把意向产品经理登记为需求参与人，否则他在详情页没有可执行动作 */
    private void bindPmRole(Long reqId, SysUser pm) {
        Long exists = roleMapper.selectCount(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getUserId, pm.getId())
                .eq(RdmRequirementRole::getRoleCode, RdmConstants.ROLE_PM)
                .eq(RdmRequirementRole::getIsActive, 1));
        if (exists != null && exists > 0) {
            return;
        }
        RdmRequirementRole role = new RdmRequirementRole();
        role.setReqId(reqId);
        role.setUserId(pm.getId());
        role.setEmpNo(pm.getEmpId());
        role.setEmpName(pm.getName());
        role.setRoleCode(RdmConstants.ROLE_PM);
        role.setIsActive(1);
        role.setJoinTime(LocalDateTime.now());
        roleMapper.insert(role);
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
