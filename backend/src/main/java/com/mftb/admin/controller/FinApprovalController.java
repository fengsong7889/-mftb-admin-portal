package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
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
import com.mftb.admin.service.FinApprovalService;
import com.mftb.admin.util.ApiRateLimiter;
import jakarta.validation.Valid;
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
    private final ApiRateLimiter rateLimiter;

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
    public Result<String> submitRecharge(@Valid @RequestBody RechargeApplyDTO request) {
        String flowNo = finApprovalService.submitRecharge(request);
        return Result.success("充值申請已提交，流程編號：" + flowNo, flowNo);
    }

    /** 提交推广金转账申请 */
    @PostMapping("/transfer")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitTransfer(@Valid @RequestBody TransferApplyDTO request) {
        String flowNo = finApprovalService.submitTransfer(request);
        return Result.success("轉賬申請已提交，流程編號：" + flowNo, flowNo);
    }

    /** 提交推广金扣款申请 */
    @PostMapping("/deduct")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitDeduct(@Valid @RequestBody DeductApplyDTO request) {
        String flowNo = finApprovalService.submitDeduct(request);
        return Result.success("扣款申請已提交，流程編號：" + flowNo, flowNo);
    }

    /** 提交商户合并申请 */
    @PostMapping("/merge")
    @RequirePermission(menu = "approval-center", action = "create")
    public Result<String> submitMerge(@RequestBody MergeApplyDTO request) {
        String flowNo = finApprovalService.submitMerge(request);
        return Result.success("合並申請已提交，流程編號：" + flowNo, flowNo);
    }

    /** 通过当前待审节点 */
    @PostMapping("/{flowNo}/approve")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<ApproveResultVO> approve(@PathVariable String flowNo) {
        if (!rateLimiter.tryAcquire("fin:approve", 10, 60_000L)) {
            throw new BusinessException("審批操作過於頻繁，請稍後再試");
        }
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
        if (!rateLimiter.tryAcquire("fin:reject", 10, 60_000L)) {
            throw new BusinessException("審批操作過於頻繁，請稍後再試");
        }
        String nodeName = finApprovalService.reject(flowNo, request.getReason());
        return Result.success("「" + nodeName + "」已驳回", null);
    }

    /** 撤销申请 */
    @PostMapping("/{flowNo}/cancel")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<Void> cancel(@PathVariable String flowNo) {
        finApprovalService.cancel(flowNo);
        return Result.success("申請已撤銷", null);
    }

    /** 诊断接口：查看审批记录原始 extra 数据 */
    @GetMapping("/debug/{flowNo}")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<?> debugExtra(@PathVariable String flowNo) {
        java.util.Map<String, Object> data = finApprovalService.debugExtra(flowNo);
        if (data == null) {
            return Result.success("未找到審批記錄", null);
        }
        return Result.success(data);
    }
}
