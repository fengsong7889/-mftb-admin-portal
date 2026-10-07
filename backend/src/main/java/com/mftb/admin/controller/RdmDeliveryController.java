package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.service.RdmDeliveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研協同（RDM）交付过程接口：PRD、评审、任务与工时、迭代、需求变更。
 * <p>权限归属：产品侧动作挂「產品需求處理」，研发/设计/测试侧动作挂「研發交付」，
 * 两边互为 anyOf，避免"看得到需求却报不了进度"的授权缝隙。
 */
@RestController
@RequestMapping("/api/rdm/delivery")
@RequiredArgsConstructor
public class RdmDeliveryController {

    private final RdmDeliveryService deliveryService;

    /* ── 交付概览 ── */

    /** 需求交付概览（PRD + 任务 + 评审 + 变更 + 工时汇总），详情页一次拉齐 */
    @GetMapping("/requirement/{reqId}/summary")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<RdmDeliveryVO.DeliverySummary> summary(@PathVariable Long reqId) {
        return Result.success(deliveryService.summary(reqId));
    }

    /* ── PRD ── */

    /** 需求下的 PRD 列表 */
    @GetMapping("/requirement/{reqId}/prds")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Prd>> prds(@PathVariable Long reqId) {
        return Result.success(deliveryService.listPrds(reqId));
    }

    /* ── 阶段 3：里程碑与工时明细 ── */

    /** 五节点计划（初步/基线/预测/实际） */
    @GetMapping("/requirement/{reqId}/milestones")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Milestone>> milestones(@PathVariable Long reqId) {
        return Result.success(deliveryService.milestones(reqId));
    }

    /** 保存节点计划（已冻结基线后只能改预测） */
    @PutMapping("/requirement/{reqId}/milestones")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Milestone>> saveMilestones(@PathVariable Long reqId,
                                                                @RequestBody List<RdmDeliveryDTO.Milestone> list) {
        return Result.success("節點計劃已保存", deliveryService.saveMilestones(reqId, list));
    }

    /** 冻结基线（评审通过、估时确认后执行一次） */
    @PostMapping("/requirement/{reqId}/milestones/freeze")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Milestone>> freezeMilestones(@PathVariable Long reqId) {
        return Result.success("基線已凍結", deliveryService.freezeMilestoneBaseline(reqId));
    }

    /** PRD 定稿快照（版本链） */
    @GetMapping("/prd/{id}/snapshots")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.PrdSnapshot>> prdSnapshots(@PathVariable Long id) {
        return Result.success(deliveryService.prdSnapshots(id));
    }

    /** 填报工时明细（仅任务负责人本人） */
    @PostMapping("/task/{id}/work-logs")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.WorkLog>> saveWorkLogs(@PathVariable Long id,
                                                            @RequestBody List<RdmDeliveryDTO.WorkLog> logs) {
        return Result.success("工時已登記", deliveryService.saveWorkLogs(id, logs));
    }

    /** 新增/编辑 PRD */
    @PostMapping("/prd")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmDeliveryVO.Prd> savePrd(@RequestBody RdmDeliveryDTO.Prd dto) {
        return Result.success("PRD 已保存", deliveryService.savePrd(dto));
    }

    /** 删除 PRD（仅草稿） */
    @DeleteMapping("/prd/{id}")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<Void> deletePrd(@PathVariable Long id) {
        deliveryService.deletePrd(id);
        return Result.success();
    }

    /* ── 评审 ── */

    /** 需求下的评审记录 */
    @GetMapping("/requirement/{reqId}/reviews")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Review>> reviews(@PathVariable Long reqId) {
        return Result.success(deliveryService.listReviews(reqId));
    }

    /** 发起评审 */
    @PostMapping("/review")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmDeliveryVO.Review> createReview(@RequestBody RdmDeliveryDTO.Review dto) {
        return Result.success("評審已發起", deliveryService.createReview(dto));
    }

    /** 录入评审结论 */
    @PostMapping("/review/{id}/decision")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmDeliveryVO.Review> decideReview(@PathVariable Long id, @RequestBody RdmDeliveryDTO.ReviewDecision dto) {
        return Result.success("評審結論已録入", deliveryService.decideReview(id, dto));
    }

    /* ── 执行任务与工时 ── */

    /** 需求下的任务列表 */
    @GetMapping("/requirement/{reqId}/tasks")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Task>> tasks(@PathVariable Long reqId) {
        return Result.success(deliveryService.listTasks(reqId));
    }

    /** 我的任务（研发/设计/测试视角；不传 status 时返回未完成） */
    @GetMapping("/tasks/mine")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Task>> myTasks(@RequestParam(required = false) String status) {
        return Result.success(deliveryService.myTasks(status));
    }

    /** 新增/编辑任务 */
    @PostMapping("/task")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmDeliveryVO.Task> saveTask(@RequestBody RdmDeliveryDTO.Task dto) {
        return Result.success("任務已保存", deliveryService.saveTask(dto));
    }

    /** 上报任务进度与工时 */
    @PostMapping("/task/{id}/progress")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<RdmDeliveryVO.Task> taskProgress(@PathVariable Long id, @RequestBody RdmDeliveryDTO.TaskProgress dto) {
        return Result.success("進度已上報", deliveryService.updateTaskProgress(id, dto));
    }

    /** 删除任务 */
    @DeleteMapping("/task/{id}")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "delete", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<Void> deleteTask(@PathVariable Long id) {
        deliveryService.deleteTask(id);
        return Result.success();
    }

    /* ── 迭代排期 ── */

    /** 迭代列表（含已排入需求数与工时，用于产能对比） */
    @GetMapping("/iterations")
    @RequirePermission(menu = "rdm-delivery-iteration", anyOf = {"rdm-delivery-board", "rdm-requirement", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Iteration>> iterations() {
        return Result.success(deliveryService.listIterations());
    }

    /** 新增/编辑迭代 */
    @PostMapping("/iteration")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "edit", anyOf = {"rdm-intake", "rdm-delivery-board"})
    public Result<RdmDeliveryVO.Iteration> saveIteration(@RequestBody RdmDeliveryDTO.Iteration dto) {
        return Result.success("迭代已保存", deliveryService.saveIteration(dto));
    }

    /* ── 需求变更 ── */

    /** 需求下的变更记录 */
    @GetMapping("/requirement/{reqId}/changes")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmDeliveryVO.Change>> changes(@PathVariable Long reqId) {
        return Result.success(deliveryService.listChanges(reqId));
    }

    /** 发起需求变更（走 OA 审批） */
    @PostMapping("/change")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-requirement", "rdm-delivery-board", "rdm-delivery-iteration"})
    public Result<RdmDeliveryVO.Change> applyChange(@RequestBody RdmDeliveryDTO.Change dto) {
        return Result.success("變更申請已提交審批", deliveryService.applyChange(dto));
    }
}
