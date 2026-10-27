package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.OaApproveDTO;
import com.mftb.admin.dto.OaRejectDTO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestQuery;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.util.OperatorResolver;
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
 * <p>
 * <b>已登记的控制例外</b>：{@code POST /{flowNo}/cancel} 不带 {@code @RequirePermission}，
 * 只靠服务层的资源归属性校验放行——详见该方法注释。其余读接口与 approve/reject 仍按
 * {@code oa-requests} 菜单权限控制，未放宽。
 */
@RestController
@RequestMapping("/api/oa/requests")
@RequiredArgsConstructor
public class OaRequestController {

    private final OaRequestService oaRequestService;
    private final OperatorResolver operatorResolver;

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
        return Result.success("流程已提交，流程編號：" + flowNo, flowNo);
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
        String message;
        if (result.isFinished()) {
            message = "審批已全部通過";
        } else if (result.getNextNode() != null) {
            message = "「" + result.getNodeName() + "」已通过，流转至「" + result.getNextNode() + "」";
        } else {
            message = "「" + result.getNodeName() + "」已通过，等待其他审批人";
        }
        return Result.success(message, result);
    }

    /** 驳回当前待审节点 */
    @PostMapping("/{flowNo}/reject")
    @RequirePermission(menu = "oa-requests", action = "edit")
    public Result<Void> reject(
            @PathVariable String flowNo,
            @RequestBody OaRejectDTO dto) {
        String reason = dto != null ? dto.getReason() : null;
        String nodeName = oaRequestService.reject(flowNo, reason);
        return Result.success("「" + nodeName + "」已驳回", null);
    }

    /**
     * 撤銷申請
     * <p>
     * <b>刻意不带 {@code @RequirePermission}（例外已登记）</b>：撤銷自己的申请是「资源所有权」动作，
     * 不是「审批人动作」。原先挂的 {@code oa-requests:edit} 在实际上把“申请入口只给零权限员工”
     * 的门户用户全拦在外（基底角色只有 view），已端到端实测报
     * 「没有 [oa-requests] 的[编辑]权限」：申请人看得见自己的在途单却撤不回。
     * <p>补偿控制全部在 {@code OaRequestServiceImpl.cancel}，一条没减：
     * <ul>
     *   <li>流程必须还在审批中（否则「僅審批中的流程可以撤銷」）；</li>
     *   <li>已有节点通过 → 拒（「已有審批人通過，無法撤銷，請聯繫審批人駁回」），
     *       避开“别人已承责的单子被申请人抽走”；</li>
     *   <li>身份必为申请人本人或超管（signature 精确比对口径未变，本次只删菜单权限判定，
     *       没放宽任何一条），否则报「僅申請人或管理員可以撤銷流程」。</li>
     * </ul>
     * 反查能力：{@code biz_oa_request} 自带 applicant 字段，撑得住事后追溯；
     * OA 各类型（含系統權限申請）的撤销回调已在服务层分发，单据不会停在 pending。
     */
    @PostMapping("/{flowNo}/cancel")
    public Result<Void> cancel(@PathVariable String flowNo) {
        oaRequestService.cancel(flowNo);
        return Result.success("申請已撤銷", null);
    }

    /** 提交草稿（draft → pending） */
    @PostMapping("/{flowNo}/submit")
    @RequirePermission(menu = "oa-requests", action = "edit")
    public Result<Void> submitDraft(@PathVariable String flowNo) {
        oaRequestService.submitDraft(flowNo);
        return Result.success("草稿已提交", null);
    }

    /** 检查当前用户是否为部门 leader */
    @GetMapping("/is-dept-leader")
    @RequirePermission(menu = "oa-requests")
    public Result<Map<String, Object>> isDeptLeader() {
        String userName = operatorResolver.currentOperatorName();
        return Result.success(oaRequestService.checkDeptLeader(userName));
    }
}
