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
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.WorkflowConfig;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import com.mftb.admin.mapper.OaProcessMapper;
import com.mftb.admin.mapper.OaRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.WorkflowConfigMapper;
import com.mftb.admin.service.ApproverResolverService;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.EamPurchaseService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.ConvertUtils;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final OperatorResolver operatorResolver;
    private final ApproverResolverService approverResolverService;
    private final BizSeqService bizSeqService;
    private final EamPurchaseService eamPurchaseService;
    private final EamPurchaseRequestMapper eamPurchaseRequestMapper;
    private final DingTalkService dingTalkService;
    private final DataScopeService dataScopeService;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<OaRequestVO> page(OaRequestQuery query) {
        LambdaQueryWrapper<OaRequest> wrapper = new LambdaQueryWrapper<>();

        // ── 通用过滤 ──
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

        // ── Scope 范围过滤 ──
        String scope = query.getScope();
        String userName = operatorResolver.currentOperatorName();
        boolean isApprovalScope = false; // 标记是否为审批相关 scope（用于后续补充 myApprovalTime）

        if ("my_applied".equals(scope)) {
            // 我发起的：按申请人过滤
            if (StringUtils.hasText(userName)) {
                wrapper.like(OaRequest::getApplicant, userName);
            }
        } else if ("pending_my_approval".equals(scope)) {
            // 待我审批：approver 包含当前用户 + taskStatus=pending，排除会签已审
            isApprovalScope = true;
            List<Long> pendingIds = resolvePendingMyApproval(userName);
            if (pendingIds.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(OaRequest::getId, pendingIds);
        } else if ("my_approved".equals(scope)) {
            // 我已审批的：当前用户已审批的流程
            isApprovalScope = true;
            List<Long> approvedIds = resolveMyApproved(userName);
            if (approvedIds.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(OaRequest::getId, approvedIds);
        } else if ("department_all".equals(scope)) {
            // 全部流程：超管看全公司，部门负责人看本部门，非负责人看自己相关的
            // 超管判定：role=admin 或 functionRoles 绑定 sys_admin 角色
            Set<String> authGroups = dataScopeService.resolveAuthorizedGroupCodes();
            if (authGroups == null) {
                // 超管 → 不加任何过滤，返回全公司所有流程
            } else {
                List<Long> deptIds = resolveDeptLeaderScope(userName);
                if (deptIds.isEmpty()) {
                    // 非部门负责人 → 自己提交的 + 待自己审批的 + 自己已审批的
                    List<Long> pendingIds = resolvePendingMyApproval(userName);
                    List<Long> approvedIds = resolveMyApproved(userName);
                    wrapper.and(w -> {
                        if (StringUtils.hasText(userName)) {
                            w.like(OaRequest::getApplicant, userName);
                        }
                        if (!pendingIds.isEmpty()) {
                            w.or().in(OaRequest::getId, pendingIds);
                        }
                        if (!approvedIds.isEmpty()) {
                            w.or().in(OaRequest::getId, approvedIds);
                        }
                    });
                } else {
                    // 部门负责人 → 查看本部门所有成员流程
                    List<String> memberNames = sysUserMapper.selectList(
                            new LambdaQueryWrapper<SysUser>()
                                    .in(SysUser::getDepartmentId, deptIds))
                            .stream().map(SysUser::getName).distinct().toList();
                    if (memberNames.isEmpty()) {
                        return new PageResult<>(List.of(), 0L);
                    }
                    wrapper.and(w -> {
                        for (int i = 0; i < memberNames.size(); i++) {
                            String name = memberNames.get(i);
                            if (i == 0) {
                                w.like(OaRequest::getApplicant, name);
                            } else {
                                w.or().like(OaRequest::getApplicant, name);
                            }
                        }
                    });
                }
            }
        }

        wrapper.orderByDesc(OaRequest::getApplyTime);

        Page<OaRequest> page = new Page<>(
                PageResult.normalizePage(query.getPage()),
                PageResult.normalizeSize(query.getSize()));
        Page<OaRequest> result = oaRequestMapper.selectPage(page, wrapper);

        List<OaRequestVO> records = result.getRecords().stream()
                .map(OaRequestVO::from)
                .toList();

        // ── 批量补充字段 ──
        List<Long> requestIds = result.getRecords().stream().map(OaRequest::getId).toList();
        if (!requestIds.isEmpty()) {
            // 1. 待审任务 → 补充 currentApprover
            List<OaApprovalTask> pendingTasks = oaApprovalTaskMapper.selectList(
                    new LambdaQueryWrapper<OaApprovalTask>()
                            .in(OaApprovalTask::getRequestId, requestIds)
                            .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING));
            Map<Long, String> approverMap = pendingTasks.stream()
                    .collect(java.util.stream.Collectors.groupingBy(
                            OaApprovalTask::getRequestId,
                            java.util.stream.Collectors.collectingAndThen(
                                    java.util.stream.Collectors.toList(),
                                    tasks -> tasks.stream()
                                            .map(OaApprovalTask::getApprover)
                                            .filter(a -> a != null && !a.isEmpty())
                                            .distinct()
                                            .reduce((a, b) -> a + "," + b)
                                            .orElse(""))));
            for (OaRequestVO vo : records) {
                if (vo.getId() != null && !StringUtils.hasText(vo.getCurrentApprover())) {
                    String approver = approverMap.get(vo.getId());
                    if (approver != null) {
                        vo.setCurrentApprover(approver);
                    }
                }
            }

            // 2. 审批相关 scope → 补充 myApprovalTime
            if (isApprovalScope && StringUtils.hasText(userName)) {
                enrichMyApprovalTime(records, requestIds, userName);
            }
        }

        return new PageResult<>(records, result.getTotal());
    }

    /** 查找当前用户待审批的 requestId 集合（排除会签已审） */
    private List<Long> resolvePendingMyApproval(String userName) {
        if (!StringUtils.hasText(userName)) return List.of();
        List<OaApprovalTask> userTasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .like(OaApprovalTask::getApprover, userName)
                        .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING));
        // 排除会签模式下用户已审批的（approvedBy 包含用户）
        return userTasks.stream()
                .filter(t -> {
                    if (t.getApprovedBy() == null) return true;
                    String[] approved = t.getApprovedBy().split(",");
                    for (String a : approved) {
                        if (a.trim().contains(userName) || userName.contains(a.trim())) return false;
                    }
                    return true;
                })
                .map(OaApprovalTask::getRequestId)
                .distinct()
                .toList();
    }

    /** 查找当前用户已审批的 requestId 集合 */
    private List<Long> resolveMyApproved(String userName) {
        if (!StringUtils.hasText(userName)) return List.of();
        // approvedBy 记录实际审批人（或签/会签均适用）：
        // - 或签模式：只有实际审批的那一个人
        // - 会签模式：所有已审批的人
        List<OaApprovalTask> tasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .like(OaApprovalTask::getApprovedBy, userName));
        return tasks.stream()
                .map(OaApprovalTask::getRequestId)
                .distinct()
                .toList();
    }

    /** 查找当前用户作为部门 leader 的部门 ID 列表 */
    private List<Long> resolveDeptLeaderScope(String userName) {
        if (!StringUtils.hasText(userName)) return List.of();
        return sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .like(SysDepartment::getLeader, userName)
                        .eq(SysDepartment::getStatus, 1))
                .stream().map(SysDepartment::getId).distinct().toList();
    }

    /** 补充 myApprovalTime 字段 */
    private void enrichMyApprovalTime(List<OaRequestVO> records, List<Long> requestIds, String userName) {
        Map<Long, String> myTimeMap = new HashMap<>();
        // 或签模式：任务已 approved，approveTime 有值
        List<OaApprovalTask> approvedTasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .in(OaApprovalTask::getRequestId, requestIds)
                        .like(OaApprovalTask::getApprover, userName)
                        .isNotNull(OaApprovalTask::getApproveTime));
        for (OaApprovalTask t : approvedTasks) {
            myTimeMap.putIfAbsent(t.getRequestId(), DateTimeUtils.format(t.getApproveTime()));
        }
        // 会签模式：任务仍 pending，但 approvedBy 包含用户
        List<OaApprovalTask> allModeTasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .in(OaApprovalTask::getRequestId, requestIds)
                        .like(OaApprovalTask::getApprovedBy, userName)
                        .eq(OaApprovalTask::getTaskStatus, FLOW_PENDING));
        for (OaApprovalTask t : allModeTasks) {
            if (!myTimeMap.containsKey(t.getRequestId()) && t.getApprovedTimes() != null) {
                String[] times = t.getApprovedTimes().split(",");
                myTimeMap.put(t.getRequestId(), times[times.length - 1].trim());
            }
        }
        for (OaRequestVO vo : records) {
            if (vo.getId() != null && myTimeMap.containsKey(vo.getId())) {
                vo.setMyApprovalTime(myTimeMap.get(vo.getId()));
            }
        }
    }

    /** 检查当前用户是否为部门 leader（超管始终视为 leader） */
    public Map<String, Object> checkDeptLeader(String userName) {
        Map<String, Object> result = new HashMap<>();
        if (!StringUtils.hasText(userName)) {
            result.put("isLeader", false);
            result.put("departmentName", null);
            return result;
        }
        // 超管判定：role=admin 或 functionRoles 绑定 sys_admin 角色 → 始终视为 leader
        Set<String> authGroups = dataScopeService.resolveAuthorizedGroupCodes();
        if (authGroups == null) {
            result.put("isLeader", true);
            result.put("departmentName", "全公司");
            return result;
        }
        List<SysDepartment> depts = sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .like(SysDepartment::getLeader, userName)
                        .eq(SysDepartment::getStatus, 1));
        if (depts.isEmpty()) {
            result.put("isLeader", false);
            result.put("departmentName", null);
        } else {
            result.put("isLeader", true);
            result.put("departmentName", depts.get(0).getName());
        }
        return result;
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

        // 从最新流程配置刷新待审任务的审批人，保证配置修改后立即在前端生效
        SysUser initiator = resolveInitiator(request.getApplicant());
        tasks.stream()
                .filter(t -> FLOW_PENDING.equals(t.getTaskStatus()))
                .forEach(t -> refreshTaskApproverFromConfig(t, request, initiator));

        vo.setApprovalTasks(tasks.stream().map(OaRequestVO.OaApprovalTaskVO::from).toList());

        // 补充当前待审节点审批人（从任务列表中提取，避免 OaRequest 表字段为空）
        if (!StringUtils.hasText(vo.getCurrentApprover())) {
            String pendingApprover = tasks.stream()
                    .filter(t -> FLOW_PENDING.equals(t.getTaskStatus()))
                    .map(OaApprovalTask::getApprover)
                    .filter(a -> a != null && !a.isEmpty())
                    .reduce((a, b) -> a + "," + b)
                    .orElse(null);
            if (pendingApprover != null) {
                vo.setCurrentApprover(pendingApprover);
            }
        }

        return vo;
    }

    /* ==================== 发起流程 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submit(OaRequestCreateDTO request) {
        if (!StringUtils.hasText(request.getProcessCode())) {
            throw new BusinessException("請選擇流程類型");
        }
        if (!StringUtils.hasText(request.getTitle())) {
            throw new BusinessException("請填寫流程標題");
        }

        // 查找流程定义
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, request.getProcessCode())
                        .eq(OaProcess::getStatus, 1));
        if (process == null) {
            throw new BusinessException("流程類型不存在或已停用: " + request.getProcessCode());
        }

        SysUser current = operatorResolver.currentUser();
        String applicant = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 生成流程编号（采购申请使用 CG 编号规则，AI 申请使用 AI 编号规则）
        String flowRuleKey = switch (request.getProcessCode()) {
            case "oa_purchase" -> BizSeqService.RULE_EAM_PURCHASE_REQUEST;
            case "ai_access" -> BizSeqService.RULE_AI_ACCESS_REQUEST;
            default -> BizSeqService.RULE_OA_REQUEST;
        };
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

        // 钉钉通知：通知第一个审批人
        if (!isDraft) {
            try {
                OaApprovalTask firstTask = findCurrentPendingTask(oaRequest.getId());
                if (firstTask != null) {
                    String text = String.format("### 📝 新的待审批流程\n\n"
                                    + "- **流程编号**: %s\n- **流程类型**: %s\n- **标题**: %s\n- **申请人**: %s\n\n"
                                    + "请及时处理。",
                            flowNo, process.getProcessName(), request.getTitle(), applicant);
                    sendDingTalkAfterCommit("新的待审批流程", text, null, false);
                }
            } catch (Exception e) {
                log.warn("OA流程钉钉通知发送失败: {}", e.getMessage());
            }
        }

        return flowNo;
    }

    /**
     * 解析审批节点并创建审批任务（懒创建：仅创建第一个节点）
     * 复用 WorkflowConfig 的动态节点模型；后续节点在当前节点审批通过时才实时创建，
     * 保证流程配置中途修改后，后续节点读取到最新的审批人配置，且未到的节点信息不提前暴露
     */
    private void resolveAndCreateTasks(OaRequest oaRequest, OaProcess process, SysUser initiator) {
        List<OaApprovalTask> tasks = resolveAllNodes(oaRequest, process, initiator);
    
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
    
        // 懒创建：仅插入第一个节点任务，其余节点待当前节点通过后再实时解析创建
        OaApprovalTask first = tasks.get(0);
        first.setRequestId(oaRequest.getId());
        oaApprovalTaskMapper.insert(first);
    
        // 设置当前待审节点名称
        oaRequestMapper.update(null,
                new LambdaUpdateWrapper<OaRequest>()
                        .eq(OaRequest::getId, oaRequest.getId())
                        .set(OaRequest::getCurrentNodeName, first.getNodeName()));
    }
    
    /**
     * 解析全部动态节点（不落库），供懒创建取指定位置节点
     */
    private List<OaApprovalTask> resolveAllNodes(OaRequest oaRequest, OaProcess process, SysUser initiator) {
        String workflowType = process.getWorkflowType();
    
        if (StringUtils.hasText(workflowType)) {
            // 尝试从 workflowConfig 读取动态节点配置
            WorkflowConfig config = workflowConfigMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowConfig>()
                            .eq(WorkflowConfig::getFlowType, workflowType));
    
            if (config != null && config.getNodesConfig() != null && config.getRoutingRules() != null) {
                return resolveDynamicNodes(config, initiator);
            }
        }
        return new ArrayList<>();
    }
    
    /**
     * 审批通过后实时创建下一节点任务（懒创建）
     * 每次推进都重新读取最新流程配置并重新解析审批人，保证读到最新的审批配置；
     * 解析不到下一节点（已是最后节点/配置被删/无匹配规则）时返回 null，由调用方结束流程
     */
    private OaApprovalTask createNextTaskLazily(OaRequest request, int nextSortOrder) {
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, request.getProcessCode()));
        if (process == null) {
            return null;
        }
    
        // 从申请人签名（如「冯松(MF00002)」）恢复发起人，节点解析依赖发起人部门
        SysUser initiator = resolveInitiator(request.getApplicant());
        List<OaApprovalTask> allNodes = resolveAllNodes(request, process, initiator);
        if (allNodes.isEmpty() || nextSortOrder > allNodes.size()) {
            return null;
        }
    
        OaApprovalTask next = allNodes.get(nextSortOrder - 1);
        next.setRequestId(request.getId());
        next.setSortOrder(nextSortOrder);
        oaApprovalTaskMapper.insert(next);
        return next;
    }
    
    /**
     * 从申请人签名（如「冯松(MF00002)」）恢复发起人用户对象
     */
    private SysUser resolveInitiator(String applicantSignature) {
        if (!StringUtils.hasText(applicantSignature)) {
            return null;
        }
        String empId = applicantSignature;
        int start = applicantSignature.indexOf('(');
        int end = applicantSignature.indexOf(')');
        if (start >= 0 && end > start) {
            empId = applicantSignature.substring(start + 1, end);
        }
        return sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getEmpId, empId));
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
            throw new BusinessException("該流程不在審批中");
        }

        // 找到当前待审节点（sort_order 最小的 pending 任务）
        OaApprovalTask currentTask = findCurrentPendingTask(request.getId());
        if (currentTask == null) {
            throw new BusinessException("該流程沒有待審批節點");
        }

        // 从最新流程配置刷新当前节点审批人，保证配置修改后立即可生效
        SysUser initiator = resolveInitiator(request.getApplicant());
        refreshTaskApproverFromConfig(currentTask, request, initiator);

        SysUser current = operatorResolver.currentUser();
        String approver = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 校验审批人身份：当前用户必须是当前节点的指定审批人（或管理员）
        if (!operatorResolver.isAdmin(current)
                && currentTask.getApprover() != null
                && !currentTask.getApprover().contains(approver)) {
            throw new BusinessException("您不是當前節點的審批人，無法審批");
        }

        // 判断审批模式：any（或签）/ all（会签）
        boolean isAllMode = "all".equals(currentTask.getApprovalRule());

        if (isAllMode) {
            // ── 会签模式：追加审批记录，所有人审完才算通过 ──
            String existingApprovedBy = currentTask.getApprovedBy() != null ? currentTask.getApprovedBy() : "";
            String existingApprovedTimes = currentTask.getApprovedTimes() != null ? currentTask.getApprovedTimes() : "";

            String newApprovedBy = existingApprovedBy.isEmpty() ? approver : existingApprovedBy + "," + approver;
            String newApprovedTimes = existingApprovedTimes.isEmpty()
                    ? DateTimeUtils.format(now) : existingApprovedTimes + "," + DateTimeUtils.format(now);

            currentTask.setApprovedBy(newApprovedBy);
            currentTask.setApprovedTimes(newApprovedTimes);
            currentTask.setComment(comment);

            // 检查是否所有人都已审批
            String[] allApprovers = currentTask.getApprover().split(",");
            String[] approvedArr = newApprovedBy.split(",");
            boolean allApproved = approvedArr.length >= allApprovers.length;

            if (allApproved) {
                // 所有人已审完 → 任务完成
                currentTask.setTaskStatus(FLOW_APPROVED);
                currentTask.setApproveTime(now);
            }
            oaApprovalTaskMapper.updateById(currentTask);

            if (!allApproved) {
                // 还有人未审 → 任务保持 pending，不推进节点
                int remaining = allApprovers.length - approvedArr.length;
                return ApproveResultVO.of(currentTask.getNodeName(), false, null);
            }
            // 会签完成，继续往下走查找下一节点
        } else {
            // ── 或签模式：一人审批即通过，保留原始审批人列表 ──
            currentTask.setTaskStatus(FLOW_APPROVED);
            currentTask.setApproveTime(now);
            currentTask.setComment(comment);
            currentTask.setApprovedBy(approver);
            currentTask.setApprovedTimes(DateTimeUtils.format(now));
            // 注意：不再覆写 approver 字段，保留原始审批人列表用于审计追踪
            oaApprovalTaskMapper.updateById(currentTask);
        }

        // AI 申请审批：更新 formData 并处理审批即授权
        if ("ai_access".equals(request.getProcessCode()) && formData != null) {
            oaRequestMapper.update(null,
                    new LambdaUpdateWrapper<OaRequest>()
                            .eq(OaRequest::getId, request.getId())
                            .set(OaRequest::getFormData, formData));
            // TODO: 处理审批即授权逻辑（下发放型权限和额度）
            log.info("AI 申请审批数据已更新：flowNo={}", flowNo);
        }

        // 查找下一个待审节点：优先取已存在的 pending 任务（兼容旧的全量创建数据）；
        // 懒创建模式下实时读取最新流程配置创建下一节点，保证后续审批人始终为最新配置
        OaApprovalTask nextTask = findNextPendingTask(request.getId(), currentTask.getSortOrder());
        if (nextTask == null) {
            nextTask = createNextTaskLazily(request, currentTask.getSortOrder() + 1);
        }

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

            // 钉钉通知：流程全部通过，通知发起人
            try {
                String text = String.format("### ✅ 流程审批通过\n\n"
                                + "- **流程编号**: %s\n- **标题**: %s\n- **申请人**: %s\n\n"
                                + "您的流程已全部审批通过。",
                        flowNo, request.getTitle(), request.getApplicant());
                sendDingTalkAfterCommit("流程审批通过", text, null, false);
            } catch (Exception e) {
                log.warn("OA流程通过钉钉通知发送失败: {}", e.getMessage());
            }

            return ApproveResultVO.of(currentTask.getNodeName(), true, null);
        } else {
            // 推进到下一节点
            oaRequestMapper.update(null,
                    new LambdaUpdateWrapper<OaRequest>()
                            .eq(OaRequest::getId, request.getId())
                            .set(OaRequest::getCurrentNodeName, nextTask.getNodeName()));

            // 钉钉通知：流转到下一审批人
            try {
                String text = String.format("### 📋 流程流转通知\n\n"
                                + "- **流程编号**: %s\n- **标题**: %s\n- **当前节点**: %s\n\n"
                                + "流程已流转至您，请及时处理。",
                        flowNo, request.getTitle(), nextTask.getNodeName());
                sendDingTalkAfterCommit("流程流转通知", text, null, false);
            } catch (Exception e) {
                log.warn("OA流程流转钉钉通知发送失败: {}", e.getMessage());
            }

            return ApproveResultVO.of(currentTask.getNodeName(), false, nextTask.getNodeName());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String reject(String flowNo, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("請填寫駁回原因");
        }

        OaRequest request = requireRequest(flowNo);
        if (!FLOW_PENDING.equals(request.getFlowStatus())) {
            throw new BusinessException("該流程不在審批中");
        }

        OaApprovalTask currentTask = findCurrentPendingTask(request.getId());
        if (currentTask == null) {
            throw new BusinessException("該流程沒有待審批節點");
        }

        // 从最新流程配置刷新当前节点审批人，保证配置修改后立即可生效
        SysUser initiator = resolveInitiator(request.getApplicant());
        refreshTaskApproverFromConfig(currentTask, request, initiator);

        SysUser current = operatorResolver.currentUser();
        String approver = operatorResolver.operatorSignature(current);
        LocalDateTime now = LocalDateTime.now();

        // 校验审批人身份：当前用户必须是当前节点的指定审批人（或管理员）
        if (!operatorResolver.isAdmin(current)
                && currentTask.getApprover() != null
                && !currentTask.getApprover().contains(approver)) {
            throw new BusinessException("您不是當前節點的審批人，無法駁回");
        }

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

        // 钉钉通知：驳回通知发起人
        try {
            String text = String.format("### ❌ 流程已驳回\n\n"
                            + "- **流程编号**: %s\n- **标题**: %s\n- **申请人**: %s\n- **驳回节点**: %s\n- **驳回原因**: %s\n\n"
                            + "请修改后重新提交。",
                    flowNo, request.getTitle(), request.getApplicant(), currentTask.getNodeName(), reason);
            sendDingTalkAfterCommit("流程已驳回", text, null, false);
        } catch (Exception e) {
            log.warn("OA流程驳回钉钉通知发送失败: {}", e.getMessage());
        }

        return currentTask.getNodeName();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String flowNo) {
        OaRequest request = requireRequest(flowNo);
        if (!FLOW_PENDING.equals(request.getFlowStatus())) {
            throw new BusinessException("僅審批中的流程可以撤銷");
        }

        // 检查是否已有审批通过的节点，如有则不允许撤销
        List<OaApprovalTask> tasks = oaApprovalTaskMapper.selectList(
                new LambdaQueryWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getRequestId, request.getId()));
        boolean hasApproved = tasks.stream()
                .anyMatch(t -> FLOW_APPROVED.equals(t.getTaskStatus()));
        if (hasApproved) {
            throw new BusinessException("已有審批人通過，無法撤銷，請聯繫審批人駁回");
        }

        // 申请人本人才能撤销
        SysUser current = operatorResolver.currentUser();
        String applicant = operatorResolver.operatorSignature(current);
        if (!applicant.equals(request.getApplicant()) && !operatorResolver.isAdmin(current)) {
            throw new BusinessException("僅申請人或管理員可以撤銷流程");
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

        // 钉钉通知：撤销通知
        try {
            String text = String.format("### 🚫 流程已撤销\n\n"
                            + "- **流程编号**: %s\n- **标题**: %s\n- **申请人**: %s\n\n"
                            + "该流程已被申请人撤销。",
                    flowNo, request.getTitle(), request.getApplicant());
            sendDingTalkAfterCommit("流程已撤销", text, null, false);
        } catch (Exception e) {
            log.warn("OA流程撤销钉钉通知发送失败: {}", e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitDraft(String flowNo) {
        OaRequest request = requireRequest(flowNo);
        if (!FLOW_DRAFT.equals(request.getFlowStatus())) {
            throw new BusinessException("僅草稿狀態可提交，當前狀態: " + request.getFlowStatus());
        }

        // 查找流程定义
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, request.getProcessCode())
                        .eq(OaProcess::getStatus, 1));
        if (process == null) {
            throw new BusinessException("流程類型不存在或已停用: " + request.getProcessCode());
        }

        SysUser current = operatorResolver.currentUser();
        LocalDateTime now = LocalDateTime.now();

        // 更新流程状态为 pending
        oaRequestMapper.update(null,
                new LambdaUpdateWrapper<OaRequest>()
                        .eq(OaRequest::getId, request.getId())
                        .set(OaRequest::getFlowStatus, FLOW_PENDING)
                        .set(OaRequest::getUpdatedAt, now));

        // 创建审批任务
        resolveAndCreateTasks(request, process, current);

        log.info("OA草稿已提交: flowNo={}, processCode={}", flowNo, request.getProcessCode());

        // 钉钉通知：通知第一个审批人
        try {
            OaApprovalTask firstTask = findCurrentPendingTask(request.getId());
            if (firstTask != null) {
                String text = String.format("###  新的待审批流程\n\n"
                                + "- **流程编号**: %s\n- **流程类型**: %s\n- **标题**: %s\n- **申请人**: %s\n\n"
                                + "请及时处理。",
                        flowNo, process.getProcessName(), request.getTitle(), request.getApplicant());
                sendDingTalkAfterCommit("新的待审批流程", text, null, false);
            }
        } catch (Exception e) {
            log.warn("OA流程提交钉钉通知发送失败: {}", e.getMessage());
        }
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
     * P0-2 回调：采购申请审批通过 → 创建采购申请记录 → 自动生成采购订单
     */
    private void handlePurchaseApprovalCallback(OaRequest oaRequest) {
        Map<String, Object> formData = JsonUtils.parseMap(oaRequest.getFormData());
        if (formData.isEmpty()) {
            log.warn("採購申請 formData 為空，跳過回調: flowNo={}", oaRequest.getFlowNo());
            return;
        }

        // 创建采购申请记录（flowNo 即 CG 编号，直接作为 reqNo）
        EamPurchaseRequest pr = new EamPurchaseRequest();
        pr.setFlowNo(oaRequest.getFlowNo());
        pr.setReqNo(oaRequest.getFlowNo());
        pr.setTitle(oaRequest.getTitle());
        pr.setDepartment(ConvertUtils.str(formData, "department"));
        pr.setDepartmentId(ConvertUtils.toLong(formData.get("departmentId"), null));
        pr.setApplicant(ConvertUtils.str(formData, "applicant"));
        pr.setApplicantEmpId(ConvertUtils.str(formData, "applicantEmpId"));
        pr.setReason(ConvertUtils.str(formData, "reason"));
        pr.setStatus("approved");

        // 计算预算（items 合计）
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

        // 自动创建采购订单（传入 formData items 以便复制到订单明细）
        long orderId = eamPurchaseService.createOrderFromRequest(pr.getId(), items);
        log.info("採購申請審批回調完成: flowNo={}, orderId={}",
                oaRequest.getFlowNo(), orderId);
    }

    /**
     * 刷新待审任务的审批人：从最新流程配置重新解析，保证配置修改后对已在途的流程立即生效
     */
    private void refreshTaskApproverFromConfig(OaApprovalTask task, OaRequest request, SysUser initiator) {
        if (!FLOW_PENDING.equals(task.getTaskStatus())) return;
        try {
            OaProcess process = oaProcessMapper.selectOne(
                    new LambdaQueryWrapper<OaProcess>()
                            .eq(OaProcess::getProcessCode, request.getProcessCode()));
            if (process == null || !StringUtils.hasText(process.getWorkflowType())) return;

            WorkflowConfig config = workflowConfigMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowConfig>()
                            .eq(WorkflowConfig::getFlowType, process.getWorkflowType()));
            if (config == null || config.getNodesConfig() == null || config.getRoutingRules() == null) return;

            List<OaApprovalTask> allNodes = resolveDynamicNodes(config, initiator);
            if (allNodes.isEmpty() || task.getSortOrder() > allNodes.size()) return;

            OaApprovalTask latest = allNodes.get(task.getSortOrder() - 1);
            String newApprover = latest.getApprover();
            if (newApprover != null && !newApprover.equals(task.getApprover())) {
                String oldApprover = task.getApprover();
                task.setApprover(newApprover);
                oaApprovalTaskMapper.update(null,
                        new LambdaUpdateWrapper<OaApprovalTask>()
                                .eq(OaApprovalTask::getId, task.getId())
                                .set(OaApprovalTask::getApprover, newApprover));
                log.info("已刷新待审任务审批人: taskId={}, old={}, new={}",
                        task.getId(), oldApprover, newApprover);
            }
        } catch (Exception e) {
            log.warn("刷新待审任务审批人失败，继续使用原审批人: taskId={}, error={}",
                    task.getId(), e.getMessage());
        }
    }

    /**
     * 事务提交后发送钉钉通知，避免事务内 HTTP 调用导致连接池耗尽。
     * 如果当前没有活跃事务，则直接发送。
     */
    private void sendDingTalkAfterCommit(String title, String text, String atMobiles, boolean atAll) {
        List<String> mobileList = StringUtils.hasText(atMobiles)
                ? List.of(atMobiles.split(","))
                : List.of();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        dingTalkService.sendMarkdown(title, text, mobileList, atAll);
                    } catch (Exception e) {
                        log.warn("钉钉通知发送失败: {}", e.getMessage());
                    }
                }
            });
        } else {
            // 无活跃事务时直接发送
            try {
                dingTalkService.sendMarkdown(title, text, mobileList, atAll);
            } catch (Exception e) {
                log.warn("钉钉通知发送失败: {}", e.getMessage());
            }
        }
    }

}
