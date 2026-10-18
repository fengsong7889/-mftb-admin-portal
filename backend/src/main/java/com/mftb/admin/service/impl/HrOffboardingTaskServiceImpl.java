package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.dto.EamHandoverSaveDTO;
import com.mftb.admin.dto.EamHandoverVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.HrOffboardingTask;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.HrOffboardingTaskMapper;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamHandoverService;
import com.mftb.admin.service.HrOffboardingTaskService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 离职联动任务实现。
 * <p>
 * 三条不能让步的口径：
 * <ol>
 *   <li><b>重试不重复建单</b>：终态任务（DONE/SKIPPED）拒绝再次执行；已在 targetRef 里留了
 *       EAM 交接单号，重放同一条任务不会长出第二张交接单。</li>
 *   <li><b>不自动无限重试</b>：定时任务只拾取 PENDING，FAILED 必须人工重试。
 *       自动重跑一个每晚都失败的交接，等于每天刷一次同一份错账。</li>
 *   <li><b>接收人不由代码猜</b>：没有指定接收人时任务停在等待态并给出可读原因，
 *       不默认转给直属上级 —— 那会让人以为交接是被授权的。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrOffboardingTaskServiceImpl implements HrOffboardingTaskService {

    /** 资产「在 use 中」状态字面量（与 EamBorrowServiceImpl 写入值同源）：只交接在人手里的那些 */
    private static final String ASSET_STATUS_IN_USE = "in_use";
    /** OA 待办节点状态 */
    private static final String TASK_STATUS_PENDING = "pending";
    private static final int MAX_REF_LENGTH = 64;
    private static final int MAX_SUMMARY_LENGTH = 500;
    private static final int MAX_ERROR_LENGTH = 480;

    private final HrOffboardingTaskMapper taskMapper;
    private final HrLifecycleRequestMapper lifecycleRequestMapper;
    private final SysUserMapper sysUserMapper;
    private final EamAssetMapper assetMapper;
    private final EamHandoverService handoverService;
    private final OaApprovalTaskMapper approvalTaskMapper;
    private final OperatorResolver operatorResolver;
    private final OrgScopeService orgScopeService;

    @Override
    @Transactional
    public void scheduleForDimission(HrLifecycleRequest request, LocalDate effectiveDate, String operator) {
        if (request == null || request.getId() == null) {
            throw new BusinessException("離職單據缺失，無法登記聯動任務");
        }
        for (String taskType : List.of(HrOffboardingTask.TYPE_ASSET_HANDOVER,
                HrOffboardingTask.TYPE_OA_TODO_TRANSFER)) {
            HrOffboardingTask existing = findByType(request.getId(), taskType);
            if (existing != null) {
                // 回调重入/人工重试都走这里：终态不动，未完成的只把到期日对齐
                if (!HrOffboardingTask.TERMINAL_STATUSES.contains(existing.getStatus())
                        && effectiveDate != null && !effectiveDate.equals(existing.getEffectiveDate())) {
                    existing.setEffectiveDate(effectiveDate);
                    existing.setUpdatedBy(operator);
                    taskMapper.updateById(existing);
                }
                continue;
            }
            HrOffboardingTask task = new HrOffboardingTask();
            task.setRequestId(request.getId());
            task.setReqNo(request.getReqNo());
            task.setUserId(request.getUserId());
            task.setEmpNo(request.getEmpNo());
            task.setTaskType(taskType);
            task.setStatus(HrOffboardingTask.STATUS_PENDING);
            task.setAttempts(0);
            task.setEffectiveDate(effectiveDate);
            task.setCreatedBy(operator);
            task.setUpdatedBy(operator);
            taskMapper.insert(task);
        }
        log.info("离职联动任务已登记: reqNo={}, userId={}", request.getReqNo(), request.getUserId());
    }

    @Override
    public List<HrOffboardingTask> listByRequest(Long requestId) {
        if (requestId == null) {
            return List.of();
        }
        return taskMapper.selectList(new LambdaQueryWrapper<HrOffboardingTask>()
                .eq(HrOffboardingTask::getRequestId, requestId)
                .orderByAsc(HrOffboardingTask::getTaskType));
    }

    @Override
    public List<HrOffboardingTask> dueTasks(LocalDate today) {
        return taskMapper.selectList(new LambdaQueryWrapper<HrOffboardingTask>()
                .eq(HrOffboardingTask::getStatus, HrOffboardingTask.STATUS_PENDING)
                .le(HrOffboardingTask::getEffectiveDate, today == null ? LocalDate.now() : today)
                .orderByAsc(HrOffboardingTask::getEffectiveDate));
    }

    @Override
    @Transactional
    public boolean execute(Long taskId, String operator) {
        HrOffboardingTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException("聯動任務不存在");
        }
        if (HrOffboardingTask.TERMINAL_STATUSES.contains(task.getStatus())) {
            // 终态拒绝重跑：这是「重试不得重复生成业务单」的最后一道闸（§7.4）
            throw new BusinessException("該任務已結束（" + task.getStatus() + "），不能重複執行");
        }
        // 人工重试时校离职人归属；定时任务没有 SecurityContext，requireVisibleUser 按「不限制」放行
        orgScopeService.requireVisibleUser(task.getUserId());

        SysUser receiver = resolveReceiver(task.getRequestId());
        if (receiver == null) {
            markFailed(task, "尚未指定交接接收人，請先在離職單據指定接收人後重試", operator);
            return false;
        }
        if (receiver.getId().equals(task.getUserId())) {
            markFailed(task, "交接接收人不能是離職人本人", operator);
            return false;
        }

        task.setStatus(HrOffboardingTask.STATUS_RUNNING);
        task.setAttempts((task.getAttempts() == null ? 0 : task.getAttempts()) + 1);
        task.setUpdatedBy(operator);
        taskMapper.updateById(task);

        try {
            Outcome outcome = switch (task.getTaskType()) {
                case HrOffboardingTask.TYPE_ASSET_HANDOVER -> handoverAssets(task, receiver, operator);
                case HrOffboardingTask.TYPE_OA_TODO_TRANSFER -> transferPendingTodos(task, receiver, operator);
                default -> throw new BusinessException("未知聯動任務類型: " + task.getTaskType());
            };
            task.setStatus(outcome.skipReason != null
                    ? HrOffboardingTask.STATUS_SKIPPED : HrOffboardingTask.STATUS_DONE);
            task.setResultSummary(truncate(outcome.summary, MAX_SUMMARY_LENGTH));
            task.setTargetRef(truncate(outcome.targetRef, MAX_REF_LENGTH));
            task.setLastError(null);
            task.setUpdatedBy(operator);
            taskMapper.updateById(task);
            log.info("离职联动任务完成: type={}, reqNo={}, status={}, summary={}",
                    task.getTaskType(), task.getReqNo(), task.getStatus(), task.getResultSummary());
            return true;
        } catch (Exception e) {
            markFailed(task, e.getMessage(), operator);
            log.warn("离职联动任务失败: type={}, reqNo={}, error={}",
                    task.getTaskType(), task.getReqNo(), e.getMessage());
            return false;
        }
    }

    @Override
    @Transactional
    public void assignReceiver(Long requestId, Long receiverUserId, String operator) {
        HrLifecycleRequest request = lifecycleRequestMapper.selectById(requestId);
        if (request == null) {
            throw new BusinessException("離職單據不存在");
        }
        // 离职人必须在操作者人员范围内：否则就是拿着别人的单据改别人的交接
        orgScopeService.requireVisibleUser(request.getUserId());
        if (receiverUserId == null) {
            throw new BusinessException("請選擇交接接收人");
        }
        SysUser receiver = sysUserMapper.selectById(receiverUserId);
        if (receiver == null) {
            throw new BusinessException("交接接收人不存在");
        }
        // 接收人同样要在范围内：把资产与待办转给一个自己管不到的人，等于把数据递出边界
        orgScopeService.requireVisibleUser(receiver.getId());
        if (BuiltinAccounts.isSystemAccount(receiver.getUsername())) {
            // 系统服务账号不是员工：把资产与待办交给它等于交给一个没人登录的邮箱
            throw new BusinessException("交接接收人必須是在職員工，不能是系統服務賬號");
        }
        if (receiverUserId.equals(request.getUserId())) {
            throw new BusinessException("交接接收人不能是離職人本人");
        }
        request.setHandoverToUserId(receiver.getId());
        request.setHandoverToName(receiver.getName());
        request.setUpdatedBy(operator);
        lifecycleRequestMapper.updateById(request);

        // 把等待接收人的任务退回待执行：否则它们停在 FAILED，指定了人也照样没人推进
        List<HrOffboardingTask> tasks = listByRequest(requestId);
        for (HrOffboardingTask task : tasks) {
            if (HrOffboardingTask.STATUS_FAILED.equals(task.getStatus())) {
                task.setStatus(HrOffboardingTask.STATUS_PENDING);
                task.setLastError(null);
                task.setUpdatedBy(operator);
                taskMapper.updateById(task);
            }
        }
        log.info("离职交接接收人已指定: reqNo={}, receiver={}", request.getReqNo(), receiver.getName());
    }

    // ==================== 两类任务的执行 ====================

    /** EAM 资产交接：只为「确实在本人手里」的资产发起交接单 */
    private Outcome handoverAssets(HrOffboardingTask task, SysUser receiver, String operator) {
        SysUser leaving = sysUserMapper.selectById(task.getUserId());
        if (leaving == null) {
            throw new BusinessException("離職員工不存在，無法核對名下資產");
        }
        List<EamAsset> assets = assetMapper.selectList(new LambdaQueryWrapper<EamAsset>()
                .eq(EamAsset::getCurrentHolderId, leaving.getId())
                .eq(EamAsset::getStatus, ASSET_STATUS_IN_USE));
        if (assets.isEmpty()) {
            // SKIPPED 而不是 DONE：让界面能区分「本来就没资产」和「交接已完成」
            return Outcome.skipped("本人名下無在冊使用中的資產");
        }
        List<Long> assetIds = assets.stream().map(EamAsset::getId).toList();

        EamHandoverSaveDTO dto = new EamHandoverSaveDTO();
        dto.setFromUserName(leaving.getName());
        dto.setFromDepartment(leaving.getDepartment());
        dto.setToUserName(receiver.getName());
        dto.setToDepartment(receiver.getDepartment());
        dto.setReceiverType("employee");
        dto.setHandoverDate(String.valueOf(task.getEffectiveDate() == null ? LocalDate.now() : task.getEffectiveDate()));
        dto.setAssetIds(assetIds);
        dto.setReason("resign");
        dto.setOperatorName(operator);
        dto.setRemark("離職單據 " + task.getReqNo() + " 聯動自動發起");
        long handoverId = handoverService.register(dto);

        // 回读交接单号：targetRef 存业务单号而不是内部 id，人事侧的人看得懂
        String handoverNo = String.valueOf(handoverId);
        EamHandoverVO detail = handoverService.detail(handoverId);
        if (detail != null && StringUtils.hasText(detail.getHandoverNo())) {
            handoverNo = detail.getHandoverNo();
        }
        return Outcome.done("已發起資產交接：" + assetIds.size() + " 項 → " + receiver.getName(), handoverNo);
    }

    /**
     * OA 待办改派：只动 pending 节点，并把离职人的审批人签名整体替换成接收人。
     * <p>按 token 精确比对而不是 LIKE 命中即用：签名形如「張三(MF0001)」，
     * 子串匹配会把「張三(MF00011)」也改派掉，那是别人的待办。
     */
    private Outcome transferPendingTodos(HrOffboardingTask task, SysUser receiver, String operator) {
        SysUser leaving = sysUserMapper.selectById(task.getUserId());
        if (leaving == null) {
            throw new BusinessException("離職員工不存在，無法核對待辦");
        }
        String leavingSignature = operatorResolver.operatorSignature(leaving);
        String receiverSignature = operatorResolver.operatorSignature(receiver);
        if (!StringUtils.hasText(leavingSignature)) {
            throw new BusinessException("離職員工簽名無法解析，跳過待辦改派");
        }

        List<OaApprovalTask> candidates = approvalTaskMapper.selectList(new LambdaQueryWrapper<OaApprovalTask>()
                .eq(OaApprovalTask::getTaskStatus, TASK_STATUS_PENDING)
                .like(OaApprovalTask::getApprover, leavingSignature));
        List<OaApprovalTask> owned = candidates.stream()
                .filter(t -> hasToken(t.getApprover(), leavingSignature))
                .toList();
        if (owned.isEmpty()) {
            return Outcome.skipped("本人無待辦審批節點");
        }
        List<String> ids = new ArrayList<>();
        for (OaApprovalTask pending : owned) {
            // 同长度替换：会签(all)模式按 approvedBy 数量判断是否审完，
            // 删除 token 会让审批人变少、剩余人一批次就凑够「全员已审」而提前通过
            pending.setApprover(replaceToken(pending.getApprover(), leavingSignature, receiverSignature));
            approvalTaskMapper.updateById(pending);
            ids.add(String.valueOf(pending.getId()));
        }
        return Outcome.done("已改派待辦 " + owned.size() + " 個節點 → " + receiver.getName(), String.join(",", ids));
    }

    // ==================== 小工具 ====================

    private HrOffboardingTask findByType(Long requestId, String taskType) {
        return taskMapper.selectOne(new LambdaQueryWrapper<HrOffboardingTask>()
                .eq(HrOffboardingTask::getRequestId, requestId)
                .eq(HrOffboardingTask::getTaskType, taskType)
                .last("LIMIT 1"));
    }

    private SysUser resolveReceiver(Long requestId) {
        if (requestId == null) {
            return null;
        }
        HrLifecycleRequest request = lifecycleRequestMapper.selectById(requestId);
        if (request == null || request.getHandoverToUserId() == null) {
            return null;
        }
        return sysUserMapper.selectById(request.getHandoverToUserId());
    }

    private void markFailed(HrOffboardingTask task, String error, String operator) {
        task.setStatus(HrOffboardingTask.STATUS_FAILED);
        task.setAttempts((task.getAttempts() == null ? 0 : task.getAttempts()) + 1);
        task.setLastError(truncate(StringUtils.hasText(error) ? error : "未知錯誤", MAX_ERROR_LENGTH));
        task.setUpdatedBy(operator);
        taskMapper.updateById(task);
    }

    /** 审批人字段是逗号分隔的签名列表，必须按整段 token 比对 */
    private static boolean hasToken(String approver, String signature) {
        if (!StringUtils.hasText(approver)) {
            return false;
        }
        return Arrays.stream(approver.split(",")).map(String::trim).anyMatch(signature::equals);
    }

    private static String replaceToken(String approver, String from, String to) {
        return Arrays.stream(approver.split(",")).map(String::trim)
                .map(token -> token.equals(from) ? to : token)
                .reduce((a, b) -> a + "," + b)
                .orElse(approver);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    /** 执行结果：skipReason 非空表示「无事可做」，落到 SKIPPED 而不是 DONE */
    private record Outcome(String summary, String targetRef, String skipReason) {
        private static Outcome done(String summary, String targetRef) {
            return new Outcome(summary, targetRef, null);
        }

        private static Outcome skipped(String reason) {
            return new Outcome(reason, null, reason);
        }
    }
}
