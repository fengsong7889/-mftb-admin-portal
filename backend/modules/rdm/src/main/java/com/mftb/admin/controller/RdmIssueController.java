package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmIssueDTO;
import com.mftb.admin.dto.RdmIssueVO;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmIssueResolution;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmIssueService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）问题管理接口（Batch 1）。
 * <p>菜单归属：{@code rdm-delivery-test}（测试工作台）。延期申请走「产品裁决 →（涉业务时）业务裁决 →
 * 绑定跟进需求」三段闸门，任何一段都不能由申请人自签；裁决方由 {@code decisionType} 显式区分，
 * 服务层再校验裁决人资格，控制器不接受前端指定「谁来裁决」。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/issue")
@RequiredArgsConstructor
public class RdmIssueController {

    /** 延期裁决方：产品 */
    private static final String DECISION_TYPE_PRODUCT = "product";
    /** 延期裁决方：业务 */
    private static final String DECISION_TYPE_BUSINESS = "business";

    private final RdmIssueService issueService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 问题分页列表（非全量授权者收敛为「与我相关」的问题） */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    public Result<PageResult<RdmIssueVO.ListItem>> listIssues(RdmIssueDTO.Query query) {
        Page<RdmIssueVO.ListItem> page = issueService.listIssues(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 问题详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    public Result<RdmIssueVO.Detail> getIssueDetail(@PathVariable Long id) {
        return Result.success(issueService.getIssueDetail(id, currentUserId()));
    }

    /** 问题可执行动作（按钮口径的单一真相源） */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    @Operation(summary = "獲取問題可執行動作")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeIssueActions(id, currentUserId()));
    }

    /* ==================== 写入 ==================== */

    /** 登记问题 */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "create")
    public Result<RdmIssue> createIssue(@RequestBody RdmIssueDTO.Create dto) {
        SysUser user = operatorResolver.currentUser();
        RdmIssue issue = issueService.createIssue(dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 问题已登记: id={}, issueNo={}, operator={}",
                issue.getId(), issue.getIssueNo(), operatorResolver.currentOperatorName());
        return Result.success("問題已登記", issue);
    }

    /** 提交延期申请（不得由申请人自签裁决） */
    @PostMapping("/{id}/defer")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<RdmIssueDefer> applyDefer(@PathVariable Long id, @RequestBody RdmIssueDTO.DeferApply dto) {
        SysUser user = operatorResolver.currentUser();
        RdmIssueDefer defer = issueService.applyDefer(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 问题延期申请已提交: issueId={}, deferId={}, operator={}",
                id, defer == null ? null : defer.getId(), operatorResolver.currentOperatorName());
        return Result.success("延期申請已提交", defer);
    }

    /**
     * 延期裁决：产品/业务共用请求体，由 {@code decisionType} 区分裁决方。
     * <p>为什么单独用 {@code /defer/{deferId}/decide} 而非 {@code /issue/{id}/defer-decision}：
     * 裁决作用在「延期单」而非「问题」上，一个问题可能有多张延期单（驳回后重申），
     * 用 deferId 精确定位被裁决的那张单，避免按 issueId 猜最新一张造成误裁历史单。
     *
     * @param deferId      延期单 ID
     * @param decisionType 裁决方：{@code product}（产品裁决）/ {@code business}（业务裁决）
     */
    @PostMapping("/defer/{deferId}/decide")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> decideDefer(@PathVariable Long deferId,
                                    @RequestParam String decisionType,
                                    @RequestBody RdmIssueDTO.DeferDecision dto) {
        SysUser user = operatorResolver.currentUser();
        Long uid = userId(user);
        String uname = operatorResolver.currentOperatorName();
        String type = decisionType == null ? "" : decisionType.trim().toLowerCase();
        if (DECISION_TYPE_PRODUCT.equals(type)) {
            issueService.productDecide(deferId, dto, uid, uname);
        } else if (DECISION_TYPE_BUSINESS.equals(type)) {
            issueService.bizDecide(deferId, dto, uid, uname);
        } else {
            throw new BusinessException("無效的裁決方類型，僅支持 product / business");
        }
        log.info("RDM 问题延期已裁决: deferId={}, decisionType={}, decision={}, operator={}",
                deferId, type, dto == null ? null : dto.getDecision(), uname);
        return Result.success("延期裁決已提交", null);
    }

    /** 按证据关闭问题（任务21：必须携带修复证据 + 复测轮次 + 必要验收，不得无证据关闭） */
    @PostMapping("/{id}/resolve")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<RdmIssueResolution> resolveIssue(@PathVariable Long id, @RequestBody RdmIssueDTO.Resolve dto) {
        RdmIssueResolution resolution = issueService.resolveIssue(id, dto);
        log.info("RDM 问题已按证据关闭: id={}, resolutionId={}, operator={}",
                id, resolution == null ? null : resolution.getId(), operatorResolver.currentOperatorName());
        return Result.success("問題已關閉", resolution);
    }

    /** 建立承接（任务21：以数值 ID 指定问题与承接需求，唯一有效承接） */
    @PostMapping("/bind")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<RdmIssueFollowup> bindFollowUp(@RequestBody RdmIssueDTO.Bind dto) {
        RdmIssueFollowup followup = issueService.bindFollowUp(dto);
        log.info("RDM 问题承接已建立: issueId={}, followUpReqId={}, followupId={}, operator={}",
                dto == null ? null : dto.getIssueId(), dto == null ? null : dto.getFollowUpReqId(),
                followup == null ? null : followup.getId(), operatorResolver.currentOperatorName());
        return Result.success("承接已建立", followup);
    }

    /** 取消问题（任务21：保留承接与历史） */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> cancelIssue(@PathVariable Long id, @RequestBody RdmIssueDTO.IssueAction dto) {
        issueService.cancelIssue(id, dto);
        log.info("RDM 问题已取消: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("問題已取消", null);
    }

    /** 合并问题到目标问题（任务21：保留承接与历史） */
    @PostMapping("/{id}/merge")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> mergeIssue(@PathVariable Long id, @RequestBody RdmIssueDTO.IssueAction dto) {
        issueService.mergeIssue(id, dto);
        log.info("RDM 问题已合并: id={}, targetId={}, operator={}",
                id, dto == null ? null : dto.getTargetIssueId(), operatorResolver.currentOperatorName());
        return Result.success("問題已合併", null);
    }

    /** 改派问题负责人（任务21：保留承接与历史，不因改派丢失承接） */
    @PostMapping("/{id}/reassign")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> reassignIssue(@PathVariable Long id, @RequestBody RdmIssueDTO.IssueAction dto) {
        issueService.reassignIssue(id, dto);
        log.info("RDM 问题已改派: id={}, newOwnerUserId={}, operator={}",
                id, dto == null ? null : dto.getNewOwnerUserId(), operatorResolver.currentOperatorName());
        return Result.success("問題已改派", null);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        return userId(operatorResolver.currentUser());
    }

    private Long userId(SysUser user) {
        return user == null ? null : user.getId();
    }
}
