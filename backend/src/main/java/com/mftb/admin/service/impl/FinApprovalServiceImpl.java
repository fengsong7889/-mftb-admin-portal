package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.ApprovalNodeInstance;
import com.mftb.admin.dto.ApproverInstance;
import com.mftb.admin.dto.DeductApplyDTO;
import com.mftb.admin.dto.FinApprovalQuery;
import com.mftb.admin.dto.FinApprovalVO;
import com.mftb.admin.dto.MergeApplyDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RechargeApplyDTO;
import com.mftb.admin.dto.StoreAmountDTO;
import com.mftb.admin.dto.TransferApplyDTO;
import com.mftb.admin.entity.BizGiftRecord;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.entity.FinDebtBill;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.WorkflowConfig;
import com.mftb.admin.mapper.BizGiftRecordMapper;
import com.mftb.admin.mapper.FinApprovalMapper;
import com.mftb.admin.mapper.FinDebtBillMapper;
import com.mftb.admin.mapper.WorkflowConfigMapper;
import com.mftb.admin.service.ApproverResolverService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinApprovalService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.WorkflowConfigService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.FinExtras;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 财务审批流程服务实现（审批流转口径移植 approvalStore.approveCurrentNode / rejectCurrentNode）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinApprovalServiceImpl implements FinApprovalService {

    /** 流程状态 */
    private static final String FLOW_PENDING = "pending";
    private static final String FLOW_APPROVED = "approved";
    private static final String FLOW_REJECTED = "rejected";
    private static final String FLOW_CANCELLED = "cancelled";

    /** 审批停用时直接执行的标记（前端据此显示「未经审批」标识） */
    public static final String DIRECT_EXEC_MARKER = "DIRECT-EXEC";

    /** 审批节点名称（与前端审批中心/审批详情展示一致） */
    private static final String NODE_BIZ = "業務主管審批";
    private static final String NODE_OPS = "運營主管審批";
    private static final String NODE_FIN = "財務主管審批";

    /** 各节点所需功能角色编码 */
    private static final String ROLE_BIZ = "FIN_BIZ_APPROVER";
    private static final String ROLE_OPS = "FIN_OPS_APPROVER";
    private static final String ROLE_FIN = "FIN_FIN_APPROVER";

    private final FinApprovalMapper approvalMapper;
    private final FinDebtBillMapper debtBillMapper;
    private final BizGiftRecordMapper giftRecordMapper;
    private final WorkflowConfigMapper workflowConfigMapper;
    private final FinAccountService accountService;
    private final FinWriteChainService writeChainService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final WorkflowConfigService workflowConfigService;
    private final ApproverResolverService approverResolverService;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<FinApprovalVO> page(FinApprovalQuery query) {
        LambdaQueryWrapper<FinApproval> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinApproval::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinApproval::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinApproval::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getFlowNo())) {
            wrapper.like(FinApproval::getFlowNo, query.getFlowNo());
        }
        if (StringUtils.hasText(query.getApprovalType())) {
            wrapper.eq(FinApproval::getApprovalType, query.getApprovalType());
        }
        if (StringUtils.hasText(query.getApplicant())) {
            wrapper.like(FinApproval::getApplicant, query.getApplicant());
        }
        if (StringUtils.hasText(query.getFlowStatus())) {
            wrapper.eq(FinApproval::getFlowStatus, query.getFlowStatus());
        }
        // 当前待审节点：仅审批中的流程按节点推进顺序（biz -> ops -> fin）定位
        if (StringUtils.hasText(query.getCurrentNode())) {
            wrapper.eq(FinApproval::getFlowStatus, FLOW_PENDING);
            switch (query.getCurrentNode()) {
                case "business" -> wrapper.eq(FinApproval::getBizApproveStatus, FLOW_PENDING);
                case "operation" -> wrapper.eq(FinApproval::getBizApproveStatus, FLOW_APPROVED)
                        .eq(FinApproval::getOpsApproveStatus, FLOW_PENDING);
                case "finance" -> wrapper.eq(FinApproval::getOpsApproveStatus, FLOW_APPROVED)
                        .eq(FinApproval::getFinApproveStatus, FLOW_PENDING);
                default -> { }
            }
        }
        // 审批人：三个节点任一命中
        if (StringUtils.hasText(query.getApprover())) {
            String approver = query.getApprover();
            wrapper.and(w -> w.like(FinApproval::getBizApprover, approver)
                    .or().like(FinApproval::getOpsApprover, approver)
                    .or().like(FinApproval::getFinApprover, approver));
        }
        if (query.applyFromTime() != null) {
            wrapper.ge(FinApproval::getApplyTime, query.applyFromTime());
        }
        if (query.applyToTime() != null) {
            wrapper.lt(FinApproval::getApplyTime, query.applyToTime());
        }
        wrapper.orderByDesc(FinApproval::getApplyTime).orderByDesc(FinApproval::getId);

        long p = PageResult.normalizePage(query.getPage());
        long sz = PageResult.normalizeSize(query.getSize());
        Page<FinApproval> result = approvalMapper.selectPage(new Page<>(p, sz), wrapper);
        List<FinApprovalVO> records = result.getRecords().stream().map(FinApprovalVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public FinApprovalVO detail(String flowNo) {
        return FinApprovalVO.from(requireApproval(flowNo));
    }

    /* ==================== 申请提交 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitRecharge(RechargeApplyDTO request) {
        requireText(request.getGroupId(), "请选择充值集团");
        if (FinExtras.nonNull(request.getVirtualAmount()).compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("虚拟账户充值金额必须大于 0");
        }
        // 首次充值自动建户，已冻结/已注销账户不允许充值（账户按集团+品牌隔离）
        FinAccount account = accountService.find(request.getGroupId(), request.getBrand());
        if (account == null) {
            accountService.getOrCreate(request.getGroupId(), request.getGroupName(), request.getBrand());
        } else {
            accountService.requireUsable(request.getGroupId(), request.getBrand());
        }

        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("businessType", request.getBusinessType());
        extra.put("businessChannelLabel", FinExtras.DASH);
        if (StringUtils.hasText(request.getBusinessChannelLabel())) {
            extra.put("businessChannelLabel", request.getBusinessChannelLabel());
        }
        boolean isActual = Boolean.TRUE.equals(request.getIsActual());
        extra.put("isActual", isActual);
        extra.put("payMethod", request.getPayMethod());
        extra.put("virtualAmount", FinExtras.nonNull(request.getVirtualAmount()));
        extra.put("actualTotal", FinExtras.nonNull(request.getActualTotal()));
        extra.put("discountAmount", FinExtras.nonNull(request.getDiscountAmount()));
        extra.put("bankAmount", FinExtras.nonNull(request.getBankAmount()));
        extra.put("revenueAmount", FinExtras.nonNull(request.getRevenueAmount()));
        extra.put("deductStores", storeRows(request.getDeductStores()));
        extra.put("bd", StringUtils.hasText(request.getBd()) ? request.getBd() : FinExtras.DASH);
        extra.put("remark", request.getRemark() == null ? "" : request.getRemark());

        if (!workflowConfigService.isApprovalEnabled("recharge")) {
            return createApprovalDirect("recharge", request.getGroupId(), request.getGroupName(), request.getBrand(), extra);
        }
        return createApproval("recharge", request.getGroupId(), request.getGroupName(), request.getBrand(), extra);
    }

    /** 审批停用时直接执行：不创建审批记录，直接写入业务数据，返回 DIRECT-EXEC 标记 */
    private String createApprovalDirect(String approvalType, String groupCode, String groupName,
                                        String brand, Map<String, Object> extra) {
        String flowRuleKey = BizSeqService.flowRuleKey(approvalType);
        if (flowRuleKey == null) {
            throw new BusinessException("未知的审批类型: " + approvalType);
        }
        LocalDateTime now = LocalDateTime.now();

        // 构造内存中的审批对象（不入库），仅用于传递业务参数给 writeChainService
        FinApproval approval = new FinApproval();
        approval.setFlowNo(DIRECT_EXEC_MARKER);
        approval.setApprovalType(approvalType);
        approval.setGroupCode(groupCode);
        approval.setGroupName(groupName);
        approval.setBrand(brand);
        approval.setExtra(JsonUtils.toJson(extra));

        // 直接执行业务写入（批次/明细/欠款单/余额变动）
        writeChainService.writeApprovedRecords(approval, now);
        return DIRECT_EXEC_MARKER;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitTransfer(TransferApplyDTO request) {
        requireText(request.getFromGroupId(), "请选择转出集团");
        requireText(request.getToGroupId(), "请选择转入集团");
        if (request.getFromGroupId().equals(request.getToGroupId())) {
            throw new BusinessException("转出集团与转入集团不能相同");
        }
        BigDecimal amount = FinExtras.nonNull(request.getTransferAmount());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("转账金额必须大于 0");
        }
        FinAccount from = accountService.requireUsable(request.getFromGroupId(), request.getBrand());
        if (FinExtras.nonNull(from.getVirtualBalance()).compareTo(amount) < 0) {
            throw new BusinessException("转账金额超出转出集团推广金余额");
        }

        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("fromGroupId", request.getFromGroupId());
        extra.put("fromGroupName", request.getFromGroupName());
        extra.put("fromVirtualBalance", FinExtras.nonNull(from.getVirtualBalance()));
        extra.put("toGroupId", request.getToGroupId());
        extra.put("toGroupName", request.getToGroupName());
        extra.put("transferAmount", amount);
        extra.put("remark", request.getRemark() == null ? "" : request.getRemark());

        if (!workflowConfigService.isApprovalEnabled("transfer")) {
            return createApprovalDirect("transfer", request.getFromGroupId(), request.getFromGroupName(),
                    request.getBrand(), extra);
        }
        return createApproval("transfer", request.getFromGroupId(), request.getFromGroupName(),
                request.getBrand(), extra);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitDeduct(DeductApplyDTO request) {
        requireText(request.getGroupId(), "请选择扣款集团");
        BigDecimal amount = FinExtras.nonNull(request.getDeductAmount());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("扣款金额必须大于 0");
        }
        FinAccount account = accountService.requireUsable(request.getGroupId(), request.getBrand());
        if (FinExtras.nonNull(account.getVirtualBalance()).compareTo(amount) < 0) {
            throw new BusinessException("扣款金额超出集团推广金余额");
        }
        String method = StringUtils.hasText(request.getDeductMethod()) ? request.getDeductMethod() : "account";
        if ("batch".equals(method) && !StringUtils.hasText(request.getBatchNo())) {
            throw new BusinessException("批次扣款需指定充值批次");
        }

        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("deductMethod", method);
        extra.put("deductAmount", amount);
        extra.put("virtualBalance", FinExtras.nonNull(account.getVirtualBalance()));
        extra.put("consumeChannel", nullToEmpty(request.getConsumeChannel()));
        extra.put("consumeStore", nullToEmpty(request.getConsumeStore()));
        extra.put("consumeType", nullToEmpty(request.getConsumeType()));
        extra.put("consumeBd", StringUtils.hasText(request.getConsumeBd()) ? request.getConsumeBd() : FinExtras.DASH);
        extra.put("batchNo", nullToEmpty(request.getBatchNo()));
        extra.put("batchDeductible", FinExtras.nonNull(request.getBatchDeductible()));
        extra.put("batchSettlement", nullToEmpty(request.getBatchSettlement()));
        extra.put("remark", request.getRemark() == null ? "" : request.getRemark());

        if (!workflowConfigService.isApprovalEnabled("deduct")) {
            return createApprovalDirect("deduct", request.getGroupId(), request.getGroupName(), request.getBrand(), extra);
        }
        return createApproval("deduct", request.getGroupId(), request.getGroupName(), request.getBrand(), extra);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitMerge(MergeApplyDTO request) {
        requireText(request.getSourceGroupId(), "请选择注销集团");
        requireText(request.getTargetGroupId(), "请选择存续集团");
        if (request.getSourceGroupId().equals(request.getTargetGroupId())) {
            throw new BusinessException("注销集团与存续集团不能相同");
        }
        // 注销集团：未充值开户或余额为 0 时无资金可并，直接拦截
        FinAccount source = accountService.find(request.getSourceGroupId(), request.getBrand());
        if (source == null || FinExtras.nonNull(source.getVirtualBalance()).compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("集团 " + request.getSourceGroupId() + " 品牌 " + brandLabel(request.getBrand())
                    + " 推广金账户余额为 0，无需合并推广金申请");
        }
        source = accountService.requireUsable(request.getSourceGroupId(), request.getBrand());
        // 存续集团：余额为 0（未开户）也可接收资产，先自动零余额开户再校验状态
        accountService.getOrCreate(request.getTargetGroupId(), request.getTargetGroupName(), request.getBrand());
        FinAccount target = accountService.requireUsable(request.getTargetGroupId(), request.getBrand());

        // 欠款偿还金额必须恰好等于注销集团待还欠款总额
        BigDecimal debtTotal = unsettledDebtTotal(request.getSourceGroupId());
        BigDecimal repayTotal = BigDecimal.ZERO;
        for (StoreAmountDTO store : storeList(request.getRepayStores())) {
            repayTotal = repayTotal.add(FinExtras.nonNull(store.getAmount()));
        }
        if (debtTotal.compareTo(BigDecimal.ZERO) > 0 && repayTotal.compareTo(debtTotal) != 0) {
            throw new BusinessException("偿还金额合计 " + repayTotal.toPlainString()
                    + " 与注销集团待还欠款总额 " + debtTotal.toPlainString() + " 不一致");
        }
        if (repayTotal.compareTo(FinExtras.nonNull(source.getVirtualBalance())) > 0) {
            throw new BusinessException("注销集团推广金余额不足以偿还欠款");
        }

        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("sourceGroupId", request.getSourceGroupId());
        extra.put("sourceGroupName", request.getSourceGroupName());
        extra.put("sourceVirtualBalance", FinExtras.nonNull(source.getVirtualBalance()));
        extra.put("sourceDebtAmount", debtTotal);
        extra.put("targetGroupId", request.getTargetGroupId());
        extra.put("targetGroupName", request.getTargetGroupName());
        extra.put("repayStores", storeRows(request.getRepayStores()));
        extra.put("remark", request.getRemark() == null ? "" : request.getRemark());

        if (!workflowConfigService.isApprovalEnabled("merge")) {
            // 审批停用：不冻结账户，直接执行合并业务
            return createApprovalDirect("merge", request.getSourceGroupId(), request.getSourceGroupName(),
                    request.getBrand(), extra);
        }
        String flowNo = createApproval("merge", request.getSourceGroupId(), request.getSourceGroupName(),
                request.getBrand(), extra);
        // 合并申请提交即冻结双方账户，避免审批期间余额变动
        accountService.updateStatus(source.getGroupCode(), request.getBrand(), FinAccountServiceImpl.STATUS_MERGE_FROZEN);
        accountService.updateStatus(target.getGroupCode(), request.getBrand(), FinAccountServiceImpl.STATUS_MERGE_FROZEN);
        return flowNo;
    }

    /** 写入审批流程主记录，返回流程编号 */
    private String createApproval(String approvalType, String groupCode, String groupName,
                                  String brand, Map<String, Object> extra) {
        SysUser current = operatorResolver.currentUser();
        String flowRuleKey = BizSeqService.flowRuleKey(approvalType);
        if (flowRuleKey == null) {
            throw new BusinessException("未知的审批类型: " + approvalType);
        }
        FinApproval approval = new FinApproval();
        approval.setFlowNo(bizSeqService.next(flowRuleKey));
        approval.setApprovalType(approvalType);
        approval.setGroupCode(groupCode);
        approval.setGroupName(groupName);
        approval.setBrand(brand);
        approval.setApplicant(operatorResolver.operatorSignature(current));
        approval.setApplyTime(LocalDateTime.now());
        approval.setBizApproveStatus(FLOW_PENDING);
        approval.setOpsApproveStatus(FLOW_PENDING);
        approval.setFinApproveStatus(FLOW_PENDING);
        approval.setFlowStatus(FLOW_PENDING);
        approval.setExtra(JsonUtils.toJson(extra));
        approval.setUpdatedBy(operatorResolver.currentOperatorName());

        // ── 动态节点解析：读取流程配置中的节点和路由规则 ──
        List<ApprovalNodeInstance> dynamicNodes = resolveDynamicNodes(approvalType, brand, current);
        if (dynamicNodes != null && !dynamicNodes.isEmpty()) {
            approval.setApprovalNodes(JsonUtils.toJson(dynamicNodes));
            // 向下兼容：将第一个节点映射到 biz 列，第二个到 ops，第三个到 fin
            for (int i = 0; i < dynamicNodes.size() && i < 3; i++) {
                ApprovalNodeInstance node = dynamicNodes.get(i);
                String approverNames = node.getApprovers().stream()
                        .map(ApproverInstance::getName).reduce((a, b) -> a + "," + b).orElse("");
                switch (i) {
                    case 0 -> { approval.setBizApprover(approverNames); }
                    case 1 -> { approval.setOpsApprover(approverNames); }
                    case 2 -> { approval.setFinApprover(approverNames); }
                }
            }
        }

        approvalMapper.insert(approval);
        return approval.getFlowNo();
    }

    /**
     * 动态节点解析：读取流程配置 → 匹配路由规则 → 解析每个激活节点的审批人
     * 如果流程配置中没有 nodesConfig/routingRules，返回 null（降级为旧的固定三级审批）
     */
    private List<ApprovalNodeInstance> resolveDynamicNodes(String approvalType, String brand, SysUser initiator) {
        WorkflowConfig config;
        try {
            config = workflowConfigMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowConfig>()
                            .eq(WorkflowConfig::getFlowType, approvalType));
        } catch (Exception e) {
            // 数据库尚未迁移新列时降级为旧逻辑（避免阻塞业务提交）
            log.warn("读取流程动态配置失败（可能未执行迁移脚本），降级为固定三级审批: {}", e.getMessage());
            return null;
        }
        if (config == null || config.getNodesConfig() == null || config.getRoutingRules() == null) {
            return null; // 无动态配置，降级为旧逻辑
        }

        // 解析节点配置和路由规则
        List<Map<String, Object>> nodesConfig = JsonUtils.parseMapList(config.getNodesConfig());
        List<Map<String, Object>> routingRules = JsonUtils.parseMapList(config.getRoutingRules());
        if (nodesConfig.isEmpty() || routingRules.isEmpty()) {
            return null;
        }

        // 匹配路由规则（按优先级排序，取第一条匹配的）
        Map<String, Object> matchedRule = routingRules.stream()
                .sorted((a, b) -> {
                    int pa = a.get("priority") instanceof Number ? ((Number) a.get("priority")).intValue() : 999;
                    int pb = b.get("priority") instanceof Number ? ((Number) b.get("priority")).intValue() : 999;
                    return Integer.compare(pa, pb);
                })
                .findFirst().orElse(null);

        if (matchedRule == null) {
            return null;
        }

        // 获取激活的节点 ID 列表
        @SuppressWarnings("unchecked")
        List<String> activatedNodeIds = (List<String>) matchedRule.get("activatedNodeIds");
        if (activatedNodeIds == null || activatedNodeIds.isEmpty()) {
            return null;
        }

        // 对每个激活节点解析审批人
        Long initiatorDeptId = initiator != null ? initiator.getDepartmentId() : null;
        List<ApprovalNodeInstance> result = new ArrayList<>();
        for (String nodeId : activatedNodeIds) {
            Map<String, Object> nodeConfig = nodesConfig.stream()
                    .filter(n -> nodeId.equals(n.get("id")))
                    .findFirst().orElse(null);
            if (nodeConfig == null) continue;

            ApprovalNodeInstance instance = new ApprovalNodeInstance();
            instance.setNodeId(nodeId);
            instance.setNodeName((String) nodeConfig.get("name"));

            // 解析 approverConfig（支持按品牌区分）
            @SuppressWarnings("unchecked")
            Map<String, Object> approverConfig = (Map<String, Object>) nodeConfig.get("approverConfig");
            if (approverConfig == null) continue;

            boolean byBrand = Boolean.TRUE.equals(approverConfig.get("byBrand"));
            Map<String, Object> setting;
            if (byBrand && brand != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> brands = (Map<String, Object>) approverConfig.get("brands");
                setting = brands != null ? (Map<String, Object>) brands.get(brand) : null;
                if (setting == null) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> defaultSetting = (Map<String, Object>) approverConfig.get("default");
                    setting = defaultSetting;
                }
            } else {
                @SuppressWarnings("unchecked")
                Map<String, Object> defaultSetting = (Map<String, Object>) approverConfig.get("default");
                setting = defaultSetting;
            }
            if (setting == null) continue;

            String approverType = (String) setting.get("approverType");
            @SuppressWarnings("unchecked")
            List<String> approverIds = (List<String>) setting.get("approverIds");
            String approvalRule = (String) setting.get("approvalRule");

            instance.setApprovalRule(approvalRule != null ? approvalRule : "any");

            // 调用解析服务
            List<ApproverInstance> approvers = approverResolverService.resolve(approverType, approverIds, initiatorDeptId);

            // 空校验：非 initiator_leader 类型时，解析为空则阻止提交
            if (approvers.isEmpty() && !"initiator_leader".equals(approverType)) {
                String brandLabel = byBrand ? "（品牌 " + brand + "）" : "";
                throw new BusinessException(
                        String.format("「%s」节点%s未找到审批人，请先完善配置", instance.getNodeName(), brandLabel));
            }

            instance.setApprovers(approvers);
            result.add(instance);
        }

        return result.isEmpty() ? null : result;
    }

    /* ==================== 审批流转 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ApproveResultVO approve(String flowNo) {
        FinApproval approval = requirePendingApproval(flowNo);
        SysUser current = operatorResolver.currentUser();
        LocalDateTime now = LocalDateTime.now();
        String approver = operatorResolver.operatorSignature(current);

        if (FLOW_PENDING.equals(approval.getBizApproveStatus())) {
            requireNodeRole(current, ROLE_BIZ, NODE_BIZ);
            approval.setBizApprover(approver);
            approval.setBizApproveTime(now);
            approval.setBizApproveStatus(FLOW_APPROVED);
            saveNode(approval);
            return ApproveResultVO.of(NODE_BIZ, false, NODE_OPS);
        }
        if (FLOW_PENDING.equals(approval.getOpsApproveStatus())) {
            requireNodeRole(current, ROLE_OPS, NODE_OPS);
            approval.setOpsApprover(approver);
            approval.setOpsApproveTime(now);
            approval.setOpsApproveStatus(FLOW_APPROVED);
            saveNode(approval);
            return ApproveResultVO.of(NODE_OPS, false, NODE_FIN);
        }
        if (FLOW_PENDING.equals(approval.getFinApproveStatus())) {
            requireNodeRole(current, ROLE_FIN, NODE_FIN);
            approval.setFinApprover(approver);
            approval.setFinApproveTime(now);
            approval.setFinApproveStatus(FLOW_APPROVED);
            approval.setFlowStatus(FLOW_APPROVED);
            saveNode(approval);
            if ("gift".equals(approval.getApprovalType())) {
                // 赠送审批通过：更新赠送记录审批状态为已审批
                activateGiftRecord(approval.getFlowNo());
            } else {
                // 财务审批通过 → 同事务写入批次/明细/欠款单/账户余额
                writeChainService.writeApprovedRecords(approval, now);
            }
            return ApproveResultVO.of(NODE_FIN, true, null);
        }
        throw new BusinessException("该流程没有待审批节点");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String reject(String flowNo, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("请填写驳回原因");
        }
        FinApproval approval = requirePendingApproval(flowNo);
        SysUser current = operatorResolver.currentUser();
        LocalDateTime now = LocalDateTime.now();
        String approver = operatorResolver.operatorSignature(current);
        String nodeName;

        if (FLOW_PENDING.equals(approval.getBizApproveStatus())) {
            requireNodeRole(current, ROLE_BIZ, NODE_BIZ);
            approval.setBizApprover(approver);
            approval.setBizApproveTime(now);
            approval.setBizApproveStatus(FLOW_REJECTED);
            nodeName = NODE_BIZ;
        } else if (FLOW_PENDING.equals(approval.getOpsApproveStatus())) {
            requireNodeRole(current, ROLE_OPS, NODE_OPS);
            approval.setOpsApprover(approver);
            approval.setOpsApproveTime(now);
            approval.setOpsApproveStatus(FLOW_REJECTED);
            nodeName = NODE_OPS;
        } else if (FLOW_PENDING.equals(approval.getFinApproveStatus())) {
            requireNodeRole(current, ROLE_FIN, NODE_FIN);
            approval.setFinApprover(approver);
            approval.setFinApproveTime(now);
            approval.setFinApproveStatus(FLOW_REJECTED);
            nodeName = NODE_FIN;
        } else {
            throw new BusinessException("该流程没有待审批节点");
        }

        approval.setFlowStatus(FLOW_REJECTED);
        approval.setRejectReason(reason);
        saveNode(approval);
        // 合并流程驳回后解除双方账户合并冻结
        releaseMergeFreeze(approval);
        // 赠送流程驳回后更新赠送记录审批状态为驳回
        if ("gift".equals(approval.getApprovalType())) {
            rejectGiftRecord(approval.getFlowNo());
        }
        return nodeName;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String flowNo) {
        FinApproval approval = requirePendingApproval(flowNo);
        approval.setFlowStatus(FLOW_CANCELLED);
        saveNode(approval);
        releaseMergeFreeze(approval);
    }

    /** 合并流程终止（驳回/撤销）时解除双方账户合并冻结 */
    private void releaseMergeFreeze(FinApproval approval) {
        if (!"merge".equals(approval.getApprovalType())) {
            return;
        }
        Map<String, Object> extra = JsonUtils.parseMap(approval.getExtra());
        restoreAccount(approval.getGroupCode(), approval.getBrand());
        restoreAccount(FinExtras.text(extra, "targetGroupId"), approval.getBrand());
    }

    /** 赠送审批通过后：将赠送记录审批状态更新为已审批(2) */
    private void activateGiftRecord(String flowNo) {
        BizGiftRecord record = giftRecordMapper.selectOne(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getApprovalNo, flowNo)
                        .eq(BizGiftRecord::getApprovalStatus, 1));
        if (record != null) {
            record.setApprovalStatus(2); // 已审批
            record.setUpdatedBy(operatorResolver.currentOperatorName());
            giftRecordMapper.updateById(record);
        }
    }

    /** 赠送审批驳回后：将赠送记录审批状态更新为驳回(3) */
    private void rejectGiftRecord(String flowNo) {
        BizGiftRecord record = giftRecordMapper.selectOne(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getApprovalNo, flowNo)
                        .eq(BizGiftRecord::getApprovalStatus, 1));
        if (record != null) {
            record.setApprovalStatus(3); // 驳回
            record.setUpdatedBy(operatorResolver.currentOperatorName());
            giftRecordMapper.updateById(record);
        }
    }

    /** 合并冻结账户恢复正常状态 */
    private void restoreAccount(String groupCode, String brand) {
        if (groupCode == null) {
            return;
        }
        FinAccount account = accountService.find(groupCode, brand);
        if (account != null && FinAccountServiceImpl.STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            accountService.updateStatus(groupCode, brand, FinAccountServiceImpl.STATUS_NORMAL);
        }
    }

    /** 节点审批权限校验：绑定对应审批角色或超管 */
    private void requireNodeRole(SysUser current, String roleCode, String nodeName) {
        if (current == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED.getCode(), "登录状态已失效，请重新登录");
        }
        if (operatorResolver.isAdmin(current)) {
            return;
        }
        Set<String> roleCodes = operatorResolver.functionRoleCodes(current);
        if (!roleCodes.contains(roleCode)) {
            throw new BusinessException(ResultCode.FORBIDDEN.getCode(),
                    "您没有「" + nodeName + "」节点的审批权限");
        }
    }

    private void saveNode(FinApproval approval) {
        approval.setUpdatedBy(operatorResolver.currentOperatorName());
        approvalMapper.updateById(approval);
    }

    /* ==================== 公共方法 ==================== */

    private FinApproval requireApproval(String flowNo) {
        FinApproval approval = approvalMapper.selectOne(
                new LambdaQueryWrapper<FinApproval>().eq(FinApproval::getFlowNo, flowNo));
        if (approval == null) {
            throw new BusinessException(ResultCode.NOT_FOUND.getCode(), "审批流程不存在: " + flowNo);
        }
        return approval;
    }

    private FinApproval requirePendingApproval(String flowNo) {
        FinApproval approval = requireApproval(flowNo);
        if (!FLOW_PENDING.equals(approval.getFlowStatus())) {
            throw new BusinessException("该流程已结束，无法继续操作");
        }
        return approval;
    }

    /** 集团未结清欠款合计 */
    private BigDecimal unsettledDebtTotal(String groupCode) {
        List<FinDebtBill> bills = debtBillMapper.selectList(
                new LambdaQueryWrapper<FinDebtBill>()
                        .eq(FinDebtBill::getGroupCode, groupCode)
                        .eq(FinDebtBill::getStatus, "unsettled"));
        BigDecimal total = BigDecimal.ZERO;
        for (FinDebtBill bill : bills) {
            total = total.add(FinExtras.nonNull(bill.getRemainAmount()));
        }
        return total;
    }

    /** 门店明细转 extra 结构（键名与前端一致） */
    private List<Map<String, Object>> storeRows(List<StoreAmountDTO> stores) {
        return storeList(stores).stream().map(store -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("storeId", store.getStoreId());
            row.put("storeLabel", store.getStoreLabel());
            if (StringUtils.hasText(store.getBd())) {
                row.put("bd", store.getBd());
            }
            row.put("amount", FinExtras.nonNull(store.getAmount()));
            return row;
        }).toList();
    }

    private List<StoreAmountDTO> storeList(List<StoreAmountDTO> stores) {
        return stores == null ? List.of() : stores;
    }

    /** 品牌展示名（flashBee=闪蜂） */
    private static String brandLabel(String brand) {
        return "flashBee".equals(brand) ? "闪蜂" : String.valueOf(brand);
    }

    private static void requireText(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(message);
        }
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
