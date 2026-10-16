package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmStockMigrationDTO;
import com.mftb.admin.dto.RdmStockMigrationVO;
import com.mftb.admin.service.RdmStockMigrationService;
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
 * 產研交付（RDM）存量安全迁移执行接口（任务29 C 段，供任务23 前端管理页消费）。
 *
 * <p>迁移以「<b>预览 → 主责确认 → 小批执行 → 可暂停/可续 → 对账 →（仅在无新 V3 事实时）保守回退</b>」推进，
 * <b>绝不自动全量执行</b>：未确认批次任何执行入口一律拒绝。菜单归属：交付工作台（{@code rdm-delivery}）；
 * 菜单权限之外，服务层还有第二道 fail-closed 授权闸门（管理员 / 范围主责 / 发起人·确认人），
 * 身份一律取认证主体，不信任任何入参 userId。
 *
 * <p>全部写端点已接入 {@code executeOnce} 原子幂等：请求体 {@code requestId} 重试时保持不变即可；
 * {@code expectedVersion} 取详情接口返回的批次 {@code version}。
 *
 * <p><b>安全口径</b>：迁移只产出结构性 V3 事实（项目关联 / 交付项容器 / flow_version），
 * 绝不补造测试/验收/签字/评分/发布证据；产出交付项一律 DI_PREPARING 且标记来源
 * {@code stock_migration}，消费方仍走任务20/27 权威门禁。发现新 V3 事实时拒绝盲目回滚并自动暂停批次。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/stock-migration")
@RequiredArgsConstructor
public class RdmStockMigrationController {

    private final RdmStockMigrationService stockMigrationService;

    /* ==================== 查询（只读） ==================== */

    /** 迁移批次简表（最近 200 条，可按状态过滤） */
    @GetMapping("/batch")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "view")
    @Operation(summary = "存量遷移批次列表")
    public Result<List<RdmStockMigrationVO.BatchDetail>> listBatches(
            @RequestParam(required = false) String status) {
        return Result.success(stockMigrationService.listBatches(status));
    }

    /** 批次详情：批次头 + 全部明细 + 不可覆盖审计 */
    @GetMapping("/batch/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "view")
    @Operation(summary = "存量遷移批次詳情")
    public Result<RdmStockMigrationVO.BatchDetail> getBatchDetail(@PathVariable Long id) {
        return Result.success(stockMigrationService.detail(id));
    }

    /* ==================== 写入（预览 → 确认 → 执行 → 暂停/恢复 → 对账 → 回退） ==================== */

    /** 生成迁移预览批次（只读业务事实；产出 previewed 计划行，等待主责确认） */
    @PostMapping("/preview")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "生成存量遷移預覽（不執行任何業務變更）")
    public Result<RdmStockMigrationVO.PreviewResult> preview(@RequestBody RdmStockMigrationDTO.Preview dto) {
        RdmStockMigrationVO.PreviewResult result = stockMigrationService.preview(dto);
        log.info("RDM 存量遷移預覽已生成: batchId={}, total={}, eligible={}, blocked={}",
                result.getBatchId(), result.getTotalItems(), result.getEligibleItems(), result.getBlockedItems());
        return Result.success("預覽已生成，待主責確認後方可執行", result);
    }

    /** 主责确认：previewed → confirmed（确认前执行入口一律拒绝） */
    @PostMapping("/batch/{id}/confirm")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "主責確認遷移批次")
    public Result<RdmStockMigrationVO.BatchDetail> confirm(@PathVariable Long id,
                                                           @RequestBody(required = false)
                                                           RdmStockMigrationDTO.Confirm dto) {
        RdmStockMigrationVO.BatchDetail detail = stockMigrationService.confirm(id, dto);
        log.info("RDM 遷移批次已主責確認: batchId={}", id);
        return Result.success("批次已確認，可分塊執行", detail);
    }

    /** 执行一个分块（每次至多 chunk_size 条；失败项隔离标 FAILED） */
    @PostMapping("/batch/{id}/execute")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "小批執行遷移（每次一個分塊）")
    public Result<RdmStockMigrationVO.ChunkResult> execute(@PathVariable Long id,
                                                           @RequestBody(required = false)
                                                           RdmStockMigrationDTO.Execute dto) {
        RdmStockMigrationVO.ChunkResult result = stockMigrationService.executeChunk(id, dto);
        log.info("RDM 遷移分塊已執行: batchId={}, status={}, chunk={}/{}",
                id, result.getBatchStatus(), result.getSuccessInChunk(), result.getProcessedInChunk());
        return Result.success(result);
    }

    /** 暂停：已执行项保留、未执行项待续（原因必填，审计留痕） */
    @PostMapping("/batch/{id}/pause")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "暫停遷移批次")
    public Result<RdmStockMigrationVO.BatchDetail> pause(@PathVariable Long id,
                                                         @RequestBody RdmStockMigrationDTO.Pause dto) {
        RdmStockMigrationVO.BatchDetail detail = stockMigrationService.pause(id, dto);
        log.info("RDM 遷移批次已暫停: batchId={}", id);
        return Result.success("批次已暫停，已執行項保留、未執行項待續", detail);
    }

    /** 恢复：paused → confirmed/running（回退被拒的批次不可恢复，只能前滚） */
    @PostMapping("/batch/{id}/resume")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "恢復遷移批次")
    public Result<RdmStockMigrationVO.BatchDetail> resume(@PathVariable Long id,
                                                          @RequestBody(required = false)
                                                          RdmStockMigrationDTO.Resume dto) {
        RdmStockMigrationVO.BatchDetail detail = stockMigrationService.resume(id, dto);
        log.info("RDM 遷移批次已恢復: batchId={}, status={}", id, detail.getStatus());
        return Result.success("批次已恢復", detail);
    }

    /** 对账：源数量 = 成功 + 失败 + 阻塞/跳过；目标 V3 结构与源关联逐项可追溯（写 reconcile 审计） */
    @PostMapping("/batch/{id}/reconcile")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "view")
    @Operation(summary = "遷移對賬")
    public Result<RdmStockMigrationVO.ReconcileResult> reconcile(@PathVariable Long id,
                                                                 @RequestBody(required = false)
                                                                 RdmStockMigrationDTO.Reconcile dto) {
        return Result.success(stockMigrationService.reconcile(id, dto));
    }

    /**
     * 保守回退：<b>拒绝盲目回滚</b> —— 发现新 V3 事实即整体拒绝、自动暂停批次并提示前滚；
     * 仅在无新事实时做结构性逆向（不删除任何历史/证据/关联）。
     */
    @PostMapping("/batch/{id}/rollback")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY, action = "edit")
    @Operation(summary = "保守回退遷移批次（發現新 V3 事實即拒絕）")
    public Result<RdmStockMigrationVO.RollbackResult> rollback(@PathVariable Long id,
                                                               @RequestBody RdmStockMigrationDTO.Rollback dto) {
        RdmStockMigrationVO.RollbackResult result = stockMigrationService.rollback(id, dto);
        if (Boolean.TRUE.equals(result.getRejected())) {
            log.warn("RDM 遷移回退被拒絕（發現新 V3 事實，批次已自動暫停）: batchId={}", id);
            return Result.success("已拒絕盲目回滾：遷移後已產生新 V3 事實，批次已自動暫停，請走前滾兼容", result);
        }
        log.info("RDM 遷移批次已保守回退: batchId={}, items={}", id, result.getRolledBackItemIds());
        return Result.success("批次已保守回退（僅結構性逆向，未刪除任何歷史/證據/關聯）", result);
    }
}
