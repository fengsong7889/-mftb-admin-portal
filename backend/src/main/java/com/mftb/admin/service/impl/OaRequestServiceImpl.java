package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestQuery;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.OaProcess;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.EamPurchaseRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.WorkflowConfig;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import com.mftb.admin.mapper.OaProcessMapper;
import com.mftb.admin.mapper.OaRequestMapper;
import com.mftb.admin.mapper.WorkflowConfigMapper;
import com.mftb.admin.service.ApproverResolverService;
import com.mftb.admin.service.EamPurchaseService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OA流程事项服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaRequestServiceImpl implements OaRequestService {

    private static final String FLOW_DRAFT = "draft";
    private static final String FLOW_PENDING = "pending";
    private static final String FLOW_APPROVED = "approved";
    private static final String FLOW_REJECTED = "rejected";
    private static final String FLOW_CANCELLED = "cancelled";

    private final OaRequestMapper oaRequestMapper;
    private final OaApprovalTaskMapper oaApprovalTaskMapper;
    private final OaProcessMapper oaProcessMapper;
    private final WorkflowConfigMapper workflowConfigMapper;
    private final OperatorResolver operatorResolver;
    private final ApproverResolverService approverResolverService;
    private final BizSeqService bizSeqService;
    private final EamPurchaseService eamPurchaseService;
    private final EamPurchaseRequestMapper eamPurchaseRequestMapper;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<OaRequestVO> page(OaRequestQuery query) {
        LambdaQueryWrapper<OaRequest> wrapper = new LambdaQueryWrapper<>();

        if (StringUtils.hasText(query.getFlowNo())) {
            wrapper.like(OaRequest::getFlowNo, query.getFlowNo());
        }
        if (StringUtils.hasText(query.getProcessCode())) {
            wrapper.eq(OaRequest::getProcessCode, query.getProcessCode());
        }
        if (StringUtils.hasText(query.getApplicant())) {
            wrapper.like(OaRequest::getApplicant, query.getApplicant());
        }
        if (StringUtils.hasText(query.getFlowStatus())) {
            wrapper.eq(OaRequest::getFlowStatus, query.getFlowStatus());
        }
        if (query.applyFromTime() != null) {
            wrapper.ge(OaRequest::getApplyTime, query.applyFromTime());
        }
        if (query.applyToTime() != null) {
            wrapper.lt(OaRequest::getApplyTime, query.applyToTime());
        }
        wrapper.orderByDesc(OaRequest::getApplyTime);

        Page<OaRequest> page = new Page<>(
                PageResult.normalizePage(query.getPage()),
                PageResult.normalizeSize(query.getSize()));
        Page<OaRequest> result = oaRequestMapper.selectPage(page, wrapper);

        List<OaRequestVO> records = result.getRecords().stream()
                .map(OaRequestVO::from)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public OaRequestVO detail(String flowNo) {
        OaRequest request = requireRequest(flowNo);
        OaRequestVO vo = OaRequestVO.from(request);

        // 补充流程类型名称
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, request.getProcessCode()));
        if (process != null) {
            vo.setProcessName(process.getProcessName());
        }

        // 查询审批任务节点
        List<OaApprovalTask> tasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getRequestId, request.getId())
                        .orderByAsc(OaApprovalTask::getSortOrder));
        vo.setApprovalTasks(tasks.stream().map(OaRequestVO.OaApprovalTaskVO::from).toList());

        return vo;
    }

    /* ==================== 发起流程 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submit(OaRequestCreateDTO request) {
        if (!StringUtils.hasText(request.getProcessCode())) {
            throw new BusinessException("请选择流程类型");
        }
        if (!StringUtils.hasText(request.getTitle())) {
            throw new BusinessException("请填写流程标题");
        }

        // 查找流程定义
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, request.getProcessCode())
                        .eq(OaProcess::getStatus, 1));
        if (process == null) {
            throw new BusinessException("流程类型不存在或已停用: " + request.getProcessCode());
        }

        SysUser current = operatorResolver.currentUser();
        String applicant = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 生成流程编号（采购申请使用专用 CG 编号规则）
        String flowRuleKey = "oa_purchase".equals(request.getProcessCode())
                ? BizSeqService.RULE_EAM_PURCHASE_REQUEST
                : BizSeqService.RULE_OA_REQUEST;
        String flowNo = bizSeqService.next(flowRuleKey);

        // 创建流程实例
        OaRequest oaRequest = new OaRequest();
        oaRequest.setFlowNo(flowNo);
        oaRequest.setProcessCode(request.getProcessCode());
        oaRequest.setTitle(request.getTitle());
        oaRequest.setFormData(request.getFormData());
        oaRequest.setApplicant(applicant);
        oaRequest.setApplyTime(now);
        // 判断是否为草稿保存
        boolean isDraft = FLOW_DRAFT.equals(request.getFlowStatus());
        oaRequest.setFlowStatus(isDraft ? FLOW_DRAFT : FLOW_PENDING);
        oaRequest.setCreatedAt(now);
        oaRequest.setUpdatedAt(now);
        oaRequestMapper.insert(oaRequest);

        // 草稿状态不创建审批任务
        if (!isDraft) {
            resolveAndCreateTasks(oaRequest, process, current);
        }

        log.info("OA流程已发起: flowNo={}, processCode={}, applicant={}", flowNo, request.getProcessCode(), applicant);
        return flowNo;
    }

    /**
     * 解析审批节点并创建审批任务
     * 复用 WorkflowConfig 的动态节点模型；如果未配置动态节点则创建默认单节点审批
     */
    private void resolveAndCreateTasks(OaRequest oaRequest, OaProcess process, SysUser initiator) {
        String workflowType = process.getWorkflowType();
        List<OaApprovalTask> tasks = new ArrayList<>();

        if (StringUtils.hasText(workflowType)) {
            // 尝试从 workflowConfig 读取动态节点配置
            WorkflowConfig config = workflowConfigMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowConfig>()
                            .eq(WorkflowConfig::getFlowType, workflowType));

            if (config != null && config.getNodesConfig() != null && config.getRoutingRules() != null) {
                tasks = resolveDynamicNodes(config, initiator);
            }
        }

        if (tasks.isEmpty()) {
            // 降级：创建默认单节点审批（审批人=当前管理员或发起人主管）
            OaApprovalTask defaultTask = new OaApprovalTask();
            defaultTask.setRequestId(oaRequest.getId());
            defaultTask.setNodeName("主管審批");
            defaultTask.setSortOrder(1);
            defaultTask.setApprovalRule("any");
            defaultTask.setTaskStatus(FLOW_PENDING);

            // 尝试解析发起人主管
            Long deptId = initiator != null ? initiator.getDepartmentId() : null;
            if (deptId != null) {
                var approvers = approverResolverService.resolve("initiator_leader", null, deptId);
                if (!approvers.isEmpty()) {
                    defaultTask.setApprover(approvers.stream()
                            .map(a -> a.getName())
                            .reduce((a, b) -> a + "," + b)
                            .orElse(""));
                }
            }
            tasks.add(defaultTask);
        }

        // 批量插入审批任务
        for (OaApprovalTask task : tasks) {
            oaApprovalTaskMapper.insert(task);
        }

        // 设置当前待审节点名称
        String firstNodeName = tasks.stream()
                .filter(t -> FLOW_PENDING.equals(t.getTaskStatus()))
                .findFirst()
                .map(OaApprovalTask::getNodeName)
                .orElse(null);
        oaRequestMapper.update(null,
                new LambdaUpdateWrapper<OaRequest>()
                        .eq(OaRequest::getId, oaRequest.getId())
                        .set(OaRequest::getCurrentNodeName, firstNodeName));
    }

    /**
     * 动态节点解析：读取流程配置 → 匹配路由规则 → 解析审批人
     * 复用 FinApprovalServiceImpl 相同的动态节点模型
     */
    private List<OaApprovalTask> resolveDynamicNodes(WorkflowConfig config, SysUser initiator) {
        List<Map<String, Object>> nodesConfig = JsonUtils.parseMapList(config.getNodesConfig());
        List<Map<String, Object>> routingRules = JsonUtils.parseMapList(config.getRoutingRules());
        if (nodesConfig.isEmpty() || routingRules.isEmpty()) {
            return List.of();
        }

        // 匹配路由规则（按优先级排序取第一条）
        Map<String, Object> matchedRule = routingRules.stream()
                .sorted((a, b) -> {
                    int pa = a.get("priority") instanceof Number ? ((Number) a.get("priority")).intValue() : 999;
                    int pb = b.get("priority") instanceof Number ? ((Number) b.get("priority")).intValue() : 999;
                    return Integer.compare(pa, pb);
                })
                .findFirst().orElse(null);

        if (matchedRule == null) {
            return List.of();
        }

        @SuppressWarnings("unchecked")
        List<String> activatedNodeIds = (List<String>) matchedRule.get("activatedNodeIds");
        if (activatedNodeIds == null || activatedNodeIds.isEmpty()) {
            return List.of();
        }

        Long initiatorDeptId = initiator != null ? initiator.getDepartmentId() : null;
        List<OaApprovalTask> tasks = new ArrayList<>();
        int order = 1;

        for (String nodeId : activatedNodeIds) {
            Map<String, Object> nodeConfig = nodesConfig.stream()
                    .filter(n -> nodeId.equals(n.get("id")))
                    .findFirst().orElse(null);
            if (nodeConfig == null) continue;

            @SuppressWarnings("unchecked")
            Map<String, Object> approverConfig = (Map<String, Object>) nodeConfig.get("approverConfig");
            if (approverConfig == null) continue;

            // 取默认审批人配置（OA流程不按品牌区分）
            @SuppressWarnings("unchecked")
            Map<String, Object> setting = (Map<String, Object>) approverConfig.get("default");
            if (setting == null) continue;

            String approverType = (String) setting.get("approverType");
            @SuppressWarnings("unchecked")
            List<String> approverIds = (List<String>) setting.get("approverIds");
            String approvalRule = (String) setting.get("approvalRule");

            var approvers = approverResolverService.resolve(approverType, approverIds, initiatorDeptId);
            String approverNames = approvers.stream()
                    .map(a -> a.getName())
                    .reduce((a, b) -> a + "," + b)
                    .orElse("");

            OaApprovalTask task = new OaApprovalTask();
            task.setRequestId(null); // 稍后在 submit 中设置
            task.setNodeName((String) nodeConfig.get("name"));
            task.setSortOrder(order++);
            task.setApprovalRule(approvalRule != null ? approvalRule : "any");
            task.setApprover(approverNames);
            task.setTaskStatus(FLOW_PENDING);
            tasks.add(task);
        }

        return tasks;
    }

    /* ==================== 审批流转 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApproveResultVO approve(String flowNo, String comment, String formData) {
        OaRequest request = requireRequest(flowNo);
        if (!FLOW_PENDING.equals(request.getFlowStatus())) {
            throw new BusinessException("该流程不在审批中");
        }

        // 找到当前待审节点（sort_order 最小的 pending 任务）
        OaApprovalTask currentTask = findCurrentPendingTask(request.getId());
        if (currentTask == null) {
            throw new BusinessException("该流程没有待审批节点");
        }

        SysUser current = operatorResolver.currentUser();
        String approver = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 标记当前节点为已通过
        currentTask.setTaskStatus(FLOW_APPROVED);
        currentTask.setApprover(approver);
        currentTask.setApproveTime(now);
        currentTask.setComment(comment);
        oaApprovalTaskMapper.updateById(currentTask);

        // AI 申请审批：更新 formData 并处理审批即授权
        if ("ai_access".equals(request.getProcessCode()) && formData != null) {
            oaRequestMapper.update(null,
                    new LambdaUpdateWrapper<OaRequest>()
                            .eq(OaRequest::getId, request.getId())
                            .set(OaRequest::getFormData, formData));
            // TODO: 处理审批即授权逻辑（下发放型权限和额度）
            log.info("AI 申请审批数据已更新：flowNo={}", flowNo);
        }

        // 查找下一个待审节点
        OaApprovalTask nextTask = findNextPendingTask(request.getId(), currentTask.getSortOrder());

        if (nextTask == null) {
            // 所有节点已通过 → 流程完成
            oaRequestMapper.update(null,
                    new LambdaUpdateWrapper<OaRequest>()
                            .eq(OaRequest::getId, request.getId())
                            .set(OaRequest::getFlowStatus, FLOW_APPROVED)
                            .set(OaRequest::getCompleteTime, now)
                            .set(OaRequest::getCurrentNodeName, null));

            // P0-2: 审批通过 → 自动创建采购订单
            if ("oa_purchase".equals(request.getProcessCode())) {
                try {
                    handlePurchaseApprovalCallback(request);
                } catch (Exception e) {
                    log.error("采购申请审批回调失败: flowNo={}, error={}", flowNo, e.getMessage(), e);
                }
            }

            return ApproveResultVO.of(currentTask.getNodeName(), true, null);
        } else {
            // 推进到下一节点
            oaRequestMapper.update(null,
                    new LambdaUpdateWrapper<OaRequest>()
                            .eq(OaRequest::getId, request.getId())
                            .set(OaRequest::getCurrentNodeName, nextTask.getNodeName()));
            return ApproveResultVO.of(currentTask.getNodeName(), false, nextTask.getNodeName());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String reject(String flowNo, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("请填写驳回原因");
        }

        OaRequest request = requireRequest(flowNo);
        if (!FLOW_PENDING.equals(request.getFlowStatus())) {
            throw new BusinessException("该流程不在审批中");
        }

        OaApprovalTask currentTask = findCurrentPendingTask(request.getId());
        if (currentTask == null) {
            throw new BusinessException("该流程没有待审批节点");
        }

        SysUser current = operatorResolver.currentUser();
        String approver = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 标记当前节点为已驳回
        currentTask.setTaskStatus(FLOW_REJECTED);
        currentTask.setApprover(approver);
        currentTask.setApproveTime(now);
        currentTask.setComment(reason);
        oaApprovalTaskMapper.updateById(currentTask);

        // 更新流程状态为已驳回
        oaRequestMapper.update(null,
                new LambdaUpdateWrapper<OaRequest>()
                        .eq(OaRequest::getId, request.getId())
                        .set(OaRequest::getFlowStatus, FLOW_REJECTED)
                        .set(OaRequest::getRejectReason, reason)
                        .set(OaRequest::getCurrentNodeName, null));

        log.info("OA流程已驳回: flowNo={}, node={}, reason={}", flowNo, currentTask.getNodeName(), reason);
        return currentTask.getNodeName();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String flowNo) {
        OaRequest request = requireRequest(flowNo);
        if (!FLOW_PENDING.equals(request.getFlowStatus())) {
            throw new BusinessException("仅审批中的流程可以撤销");
        }

        // 申请人本人才能撤销
        SysUser current = operatorResolver.currentUser();
        String applicant = operatorResolver.operatorSignature(current);
        if (!applicant.equals(request.getApplicant()) && !operatorResolver.isAdmin(current)) {
            throw new BusinessException("仅申请人或管理员可以撤销流程");
        }

        LocalDateTime now = LocalDateTime.now();

        // 更新流程状态
        oaRequestMapper.update(null,
                new LambdaUpdateWrapper<OaRequest>()
                        .eq(OaRequest::getId, request.getId())
                        .set(OaRequest::getFlowStatus, FLOW_CANCELLED)
                        .set(OaRequest::getCancelTime, now)
                        .set(OaRequest::getCurrentNodeName, null));

        // 将所有待审任务标记为已驳回（撤销）
        oaApprovalTaskMapper.update(null,
                new LambdaUpdateWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getRequestId, request.getId())
                        .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING)
                        .set(OaApprovalTask::getTaskStatus, FLOW_REJECTED)
                        .set(OaApprovalTask::getComment, "申請人撤銷"));

        log.info("OA流程已撤销: flowNo={}", flowNo);
    }

    /* ==================== 内部方法 ==================== */

    private OaRequest requireRequest(String flowNo) {
        OaRequest request = oaRequestMapper.selectOne(
                new LambdaQueryWrapper<OaRequest>()
                        .eq(OaRequest::getFlowNo, flowNo));
        if (request == null) {
            throw new BusinessException("流程不存在: " + flowNo);
        }
        return request;
    }

    private OaApprovalTask findCurrentPendingTask(Long requestId) {
        return oaApprovalTaskMapper.selectOne(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getRequestId, requestId)
                        .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING)
                        .orderByAsc(OaApprovalTask::getSortOrder)
                        .last("LIMIT 1"));
    }

    private OaApprovalTask findNextPendingTask(Long requestId, int afterSortOrder) {
        return oaApprovalTaskMapper.selectOne(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getRequestId, requestId)
                        .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING)
                        .gt(OaApprovalTask::getSortOrder, afterSortOrder)
                        .orderByAsc(OaApprovalTask::getSortOrder)
                        .last("LIMIT 1"));
    }

    /**
     * P0-2 回調：採購申請審批通過 → 創建採購申請記錄 → 自動生成採購訂單
     */
    private void handlePurchaseApprovalCallback(OaRequest oaRequest) {
        Map<String, Object> formData = JsonUtils.parseMap(oaRequest.getFormData());
        if (formData.isEmpty()) {
            log.warn("採購申請 formData 為空，跳過回調: flowNo={}", oaRequest.getFlowNo());
            return;
        }

        // 創建採購申請記錄（flowNo 即 CG 編號，直接作為 reqNo）
        EamPurchaseRequest pr = new EamPurchaseRequest();
        pr.setFlowNo(oaRequest.getFlowNo());
        pr.setReqNo(oaRequest.getFlowNo());
        pr.setTitle(oaRequest.getTitle());
        pr.setDepartment(str(formData, "department"));
        pr.setDepartmentId(toLong(formData.get("departmentId"), null));
        pr.setApplicant(str(formData, "applicant"));
        pr.setApplicantEmpId(str(formData, "applicantEmpId"));
        pr.setReason(str(formData, "reason"));
        pr.setStatus("approved");

        // 計算預算（items 合計）
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) formData.get("items");
        java.math.BigDecimal budget = java.math.BigDecimal.ZERO;
        if (items != null) {
            for (Map<String, Object> it : items) {
                int qty = it.get("qty") instanceof Number n ? n.intValue() : 0;
                java.math.BigDecimal price = it.get("estPrice") instanceof Number n
                        ? java.math.BigDecimal.valueOf(n.doubleValue()) : java.math.BigDecimal.ZERO;
                budget = budget.add(price.multiply(java.math.BigDecimal.valueOf(qty)));
            }
        }
        pr.setBudget(budget);
        eamPurchaseRequestMapper.insert(pr);

        // 自動創建採購訂單
        long orderId = eamPurchaseService.createOrderFromRequest(pr.getId());
        log.info("採購申請審批回調完成: flowNo={}, orderId={}",
                oaRequest.getFlowNo(), orderId);
    }

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }

    private static Long toLong(Object v, Long def) {
        if (v == null) return def;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return def; }
    }
}
