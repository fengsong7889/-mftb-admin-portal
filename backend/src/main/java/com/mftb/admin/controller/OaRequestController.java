package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.OaApproveDTO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestQuery;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.OaRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * OA流程事项接口（流程实例管理 + 审批流转）
 */
@RestController
@RequestMapping("/api/oa/requests")
@RequiredArgsConstructor
public class OaRequestController {

    private final OaRequestService oaRequestService;

    /** 流程事项分页列表 */
    @GetMapping
    @RequirePermission(menu = "oa-requests")
    public Result<PageResult<OaRequestVO>> page(OaRequestQuery query) {
        return Result.success(oaRequestService.page(query));
    }

    /** 流程详情（含审批节点列表） */
    @GetMapping("/{flowNo}")
    @RequirePermission(menu = "oa-requests")
    public Result<OaRequestVO> detail(@PathVariable String flowNo) {
        return Result.success(oaRequestService.detail(flowNo));
    }

    /** 发起流程 */
    @PostMapping
    @RequirePermission(menu = "oa-requests", action = "create")
    public Result<String> submit(@RequestBody OaRequestCreateDTO request) {
        String flowNo = oaRequestService.submit(request);
        return Result.success("流程已提交，流程编号：" + flowNo, flowNo);
    }

    /** 通过当前待审节点 */
    @PostMapping("/{flowNo}/approve")
    @RequirePermission(menu = "oa-requests", action = "edit")
    public Result<ApproveResultVO> approve(
            @PathVariable String flowNo,
            @RequestBody(required = false) OaApproveDTO dto) {
        String comment = dto != null ? dto.getComment() : null;
        String formData = dto != null ? dto.getFormData() : null;
        ApproveResultVO result = oaRequestService.approve(flowNo, comment, formData);
        String message = result.isFinished()
                ? "审批已全部通过"
                : "「" + result.getNodeName() + "」已通过，流转至「" + result.getNextNode() + "」";
        return Result.success(message, result);
    }

    /** 驳回当前待审节点 */
    @PostMapping("/{flowNo}/reject")
    @RequirePermission(menu = "oa-requests", action = "edit")
    public Result<Void> reject(
            @PathVariable String flowNo,
            @RequestBody Map<String, String> body) {
        String reason = body != null ? body.get("reason") : null;
        String nodeName = oaRequestService.reject(flowNo, reason);
        return Result.success("「" + nodeName + "」已驳回", null);
    }

    /** 撤销申请 */
    @PostMapping("/{flowNo}/cancel")
    @RequirePermission(menu = "oa-requests", action = "edit")
    public Result<Void> cancel(@PathVariable String flowNo) {
        oaRequestService.cancel(flowNo);
        return Result.success("申请已撤销", null);
    }
}
