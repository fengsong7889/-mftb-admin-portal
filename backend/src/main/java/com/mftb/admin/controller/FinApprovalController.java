package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.ApprovalRejectDTO;
import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.DeductApplyDTO;
import com.mftb.admin.dto.FinApprovalQuery;
import com.mftb.admin.dto.FinApprovalVO;
import com.mftb.admin.dto.MergeApplyDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RechargeApplyDTO;
import com.mftb.admin.dto.TransferApplyDTO;
import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.mapper.FinApprovalMapper;
import com.mftb.admin.service.FinApprovalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 财务审批接口（申请提交 + 审批中心 + 三级审批流转）
 */
@RestController
@RequestMapping("/api/fin/approvals")
@RequiredArgsConstructor
public class FinApprovalController {

    private final FinApprovalService finApprovalService;
    private final FinApprovalMapper finApprovalMapper;

    /** 审批中心列表（分页） */
    @GetMapping
    @RequirePermission(menu = "approval-center")
    public Result<PageResult<FinApprovalVO>> page(FinApprovalQuery query) {
        return Result.success(finApprovalService.page(query));
    }

    /** 审批详情 */
    @GetMapping("/{flowNo}")
    @RequirePermission(menu = "approval-center")
    public Result<FinApprovalVO> detail(@PathVariable String flowNo) {
        return Result.success(finApprovalService.detail(flowNo));
    }

    /** 提交推广金充值申请 */
    @PostMapping("/recharge")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitRecharge(@RequestBody RechargeApplyDTO request) {
        String flowNo = finApprovalService.submitRecharge(request);
        return Result.success("充值申请已提交，流程编号：" + flowNo, flowNo);
    }

    /** 提交推广金转账申请 */
    @PostMapping("/transfer")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitTransfer(@RequestBody TransferApplyDTO request) {
        String flowNo = finApprovalService.submitTransfer(request);
        return Result.success("转账申请已提交，流程编号：" + flowNo, flowNo);
    }

    /** 提交推广金扣款申请 */
    @PostMapping("/deduct")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitDeduct(@RequestBody DeductApplyDTO request) {
        String flowNo = finApprovalService.submitDeduct(request);
        return Result.success("扣款申请已提交，流程编号：" + flowNo, flowNo);
    }

    /** 提交商户合并申请 */
    @PostMapping("/merge")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitMerge(@RequestBody MergeApplyDTO request) {
        String flowNo = finApprovalService.submitMerge(request);
        return Result.success("合并申请已提交，流程编号：" + flowNo, flowNo);
    }

    /** 通过当前待审节点 */
    @PostMapping("/{flowNo}/approve")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<ApproveResultVO> approve(@PathVariable String flowNo) {
        ApproveResultVO result = finApprovalService.approve(flowNo);
        String message = result.isFinished()
                ? "审批已全部通过，相关批次与明细已生成"
                : "「" + result.getNodeName() + "」已通过，流转至「" + result.getNextNode() + "」";
        return Result.success(message, result);
    }

    /** 驳回当前待审节点 */
    @PostMapping("/{flowNo}/reject")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<Void> reject(@PathVariable String flowNo, @RequestBody ApprovalRejectDTO request) {
        String nodeName = finApprovalService.reject(flowNo, request.getReason());
        return Result.success("「" + nodeName + "」已驳回", null);
    }

    /** 撤销申请 */
    @PostMapping("/{flowNo}/cancel")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<Void> cancel(@PathVariable String flowNo) {
        finApprovalService.cancel(flowNo);
        return Result.success("申请已撤销", null);
    }

    /** 诊断接口：查看审批记录原始 extra 数据 */
    @GetMapping("/debug/{flowNo}")
    public Result<?> debugExtra(@PathVariable String flowNo) {
        FinApproval approval = finApprovalMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FinApproval>()
                        .eq(FinApproval::getFlowNo, flowNo));
        if (approval == null) return Result.success("未找到审批记录", null);
        java.util.Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("flowNo", approval.getFlowNo());
        data.put("groupCode", approval.getGroupCode());
        data.put("groupName", approval.getGroupName());
        data.put("brand", approval.getBrand());
        data.put("approvalType", approval.getApprovalType());
        data.put("bizApproveStatus", approval.getBizApproveStatus());
        data.put("opsApproveStatus", approval.getOpsApproveStatus());
        data.put("extra", approval.getExtra());
        return Result.success(data);
    }
}
