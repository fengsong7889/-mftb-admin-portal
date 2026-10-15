package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmReleaseBatchService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）发布批次接口（Batch 1）。
 * <p>菜单归属：{@code rdm-delivery-release}（发布中心）。发布批次是「多系统一次上线」的编排单位：
 * 部署顺序、逐系统验证、失败回滚都在批次内闭环；放行裁决不得由申请人本人签，
 * 由服务层校验发布负责人资格与状态机，控制器只做鉴权与封装。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/release-batch")
@RequiredArgsConstructor
public class RdmReleaseBatchController {

    private final RdmReleaseBatchService releaseBatchService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 发布批次分页列表（非全量授权者收敛为「与我相关」的批次） */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    public Result<PageResult<RdmReleaseBatchVO.ListItem>> listBatches(RdmReleaseBatchDTO.Query query) {
        Page<RdmReleaseBatchVO.ListItem> page = releaseBatchService.listBatches(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 批次详情（含部署记录与实时放行检查结果） */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    public Result<RdmReleaseBatchVO.Detail> getBatchDetail(@PathVariable Long id) {
        return Result.success(releaseBatchService.getBatchDetail(id, currentUserId()));
    }

    /** 发布批次可执行动作（第二批阶段发布能力未开放，仅下发查看/加入交付项等准备动作） */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    @Operation(summary = "獲取發布批次可執行動作")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeReleaseBatchActions(id, currentUserId()));
    }

    /* ==================== 写入 ==================== */

    /** 创建发布批次（随批次提交部署清单） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "create")
    public Result<RdmReleaseBatch> createBatch(@RequestBody RdmReleaseBatchDTO.Create dto) {
        SysUser user = operatorResolver.currentUser();
        RdmReleaseBatch batch = releaseBatchService.createBatch(
                dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已创建: id={}, batchNo={}, operator={}",
                batch.getId(), batch.getBatchNo(), operatorResolver.currentOperatorName());
        return Result.success("發布批次已創建", batch);
    }

    /** 放行前检查（实时计算检查项，供发起前自查） */
    @PostMapping("/{id}/check")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<List<RdmReleaseBatchVO.CheckResult>> runCheck(@PathVariable Long id) {
        return Result.success(releaseBatchService.runCheck(id, currentUserId()));
    }

    /** 申请发布（冻结检查项快照，等待他人裁决） */
    @PostMapping("/{id}/apply")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> applyRelease(@PathVariable Long id) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.applyRelease(id, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已申请发布: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("發布申請已提交，等待他人裁決", null);
    }

    /** 放行裁决（不得由申请人本人签） */
    @PostMapping("/{id}/decide")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> decideRelease(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Decide dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.decideRelease(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已裁决: id={}, decision={}, operator={}",
                id, dto == null ? null : dto.getDecision(), operatorResolver.currentOperatorName());
        return Result.success("裁決已提交", null);
    }

    /** 上报部署结果 */
    @PostMapping("/{id}/deployments")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> submitDeployment(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Deploy dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.submitDeployment(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布部署结果已上报: id={}, systemCode={}, operator={}",
                id, dto == null ? null : dto.getSystemCode(), operatorResolver.currentOperatorName());
        return Result.success("部署結果已上報", null);
    }

    /** 上报部署后验证结果 */
    @PostMapping("/{id}/verification")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> submitVerification(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Verify dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.submitVerification(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布验证结果已上报: id={}, systemCode={}, operator={}",
                id, dto == null ? null : dto.getSystemCode(), operatorResolver.currentOperatorName());
        return Result.success("驗證結果已上報", null);
    }

    /** 回滚（缺省回滚批次内已部署成功的全部系统） */
    @PostMapping("/{id}/rollback")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> rollback(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Rollback dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.rollback(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已回滚: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("已回滾", null);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        return userId(operatorResolver.currentUser());
    }

    private Long userId(SysUser user) {
        return user == null ? null : user.getId();
    }
}
