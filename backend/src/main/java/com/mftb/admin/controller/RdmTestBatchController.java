package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmTestBatchDTO;
import com.mftb.admin.dto.RdmTestBatchVO;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmTestBatchService;
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
 * 產研交付（RDM）提测批次接口（Batch 1）。
 * <p>菜单归属：{@code rdm-delivery-test}（测试工作台）。提测是「研发向测试交接范围」的动作，
 * 批次冻结范围快照；受理/退回/录入执行/复测由服务层校验测试负责人资格，控制器只做鉴权与封装。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/test-batch")
@RequiredArgsConstructor
public class RdmTestBatchController {

    private final RdmTestBatchService testBatchService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 提测批次分页列表（非全量授权者收敛为「与我相关」的批次） */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    public Result<PageResult<RdmTestBatchVO.ListItem>> listBatches(RdmTestBatchDTO.Query query) {
        Page<RdmTestBatchVO.ListItem> page = testBatchService.listBatches(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 批次详情（含全部执行记录） */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    public Result<RdmTestBatchVO.Detail> getBatchDetail(@PathVariable Long id) {
        return Result.success(testBatchService.getBatchDetail(id, currentUserId()));
    }

    /** 批次执行概览（通过率/阻塞数等口径） */
    @GetMapping("/{id}/summary")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    public Result<RdmTestBatchVO.BatchSummary> getBatchSummary(@PathVariable Long id) {
        return Result.success(testBatchService.getBatchSummary(id));
    }

    /** 测试批次可执行动作（按钮口径的单一真相源） */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "view")
    @Operation(summary = "獲取測試批次可執行動作")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeTestBatchActions(id, currentUserId()));
    }

    /* ==================== 写入 ==================== */

    /** 提交提测申请（冻结范围快照） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "create")
    public Result<RdmTestBatch> submitBatch(@RequestBody RdmTestBatchDTO.Submit dto) {
        SysUser user = operatorResolver.currentUser();
        RdmTestBatch batch = testBatchService.submitBatch(dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 提测批次已提交: id={}, batchNo={}, operator={}",
                batch.getId(), batch.getBatchNo(), operatorResolver.currentOperatorName());
        return Result.success("提測已提交", batch);
    }

    /** 接收提测批次（测试负责人操作） */
    @PostMapping("/{id}/accept")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> acceptBatch(@PathVariable Long id) {
        testBatchService.acceptBatch(id, currentUserId());
        log.info("RDM 提测批次已接收: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("已接收提測", null);
    }

    /** 退回提测（必须给原因） */
    @PostMapping("/{id}/return")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> returnBatch(@PathVariable Long id, @RequestBody RdmTestBatchDTO.Return dto) {
        testBatchService.returnBatch(id, dto, currentUserId());
        log.info("RDM 提测批次已退回: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("已退回提測", null);
    }

    /** 录入测试执行结果 */
    @PostMapping("/{id}/executions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<RdmTestExecution> submitExecution(@PathVariable Long id,
                                                    @RequestBody RdmTestBatchDTO.Execute dto) {
        SysUser user = operatorResolver.currentUser();
        RdmTestExecution execution = testBatchService.submitExecution(
                id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 测试执行结果已录入: batchId={}, executionId={}, operator={}",
                id, execution == null ? null : execution.getId(), operatorResolver.currentOperatorName());
        return Result.success("執行結果已錄入", execution);
    }

    /** 重新提测（新一批次，轮次+1） */
    @PostMapping("/{id}/retest")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_TEST, action = "edit")
    public Result<Void> retestBatch(@PathVariable Long id, @RequestBody RdmTestBatchDTO.Retest dto) {
        testBatchService.retestBatch(id, dto, currentUserId());
        log.info("RDM 提测批次已发起复测: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("已發起複測", null);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        return userId(operatorResolver.currentUser());
    }

    private Long userId(SysUser user) {
        return user == null ? null : user.getId();
    }
}
