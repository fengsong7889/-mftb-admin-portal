package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmTeamScopeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）交付过程接口：PRD、评审、任务与工时、迭代、需求变更。
 * <p>权限归属：产品侧动作挂「產品需求處理」，研发/设计/测试侧动作挂「研發交付」，
 * 两边互为 anyOf，避免"看得到需求却报不了进度"的授权缝隙。
 */
@RestController
@RequestMapping("/api/rdm/delivery")
@RequiredArgsConstructor
public class RdmDeliveryController {

    private final RdmDeliveryService deliveryService;
    /** 团队任务视图的数据范围：共同项目成员可见（只读） */
    private final RdmTeamScopeService teamScopeService;

    /* ── 交付概览 ── */

    /** 需求交付概览（PRD + 任务 + 评审 + 变更 + 工时汇总），详情页一次拉齐 */
    @GetMapping("/requirement/{reqId}/summary")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<RdmDeliveryVO.DeliverySummary> summary(@PathVariable Long reqId) {
        return Result.success(deliveryService.summary(reqId));
    }

    /* ── PRD ── */

    /** 需求下的 PRD 列表 */
    @GetMapping("/requirement/{reqId}/prds")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Prd>> prds(@PathVariable Long reqId) {
        return Result.success(deliveryService.listPrds(reqId));
    }

    /* ── 阶段 3：里程碑与工时明细 ── */

    /** 五节点计划（初步/基线/预测/实际） */
    @GetMapping("/requirement/{reqId}/milestones")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Milestone>> milestones(@PathVariable Long reqId) {
        return Result.success(deliveryService.milestones(reqId));
    }

    /** 保存节点计划（已冻结基线后只能改预测） */
    @PutMapping("/requirement/{reqId}/milestones")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<List<RdmDeliveryVO.Milestone>> saveMilestones(@PathVariable Long reqId,
                                                                @RequestBody List<RdmDeliveryDTO.Milestone> list) {
        return Result.success("節點計劃已保存", deliveryService.saveMilestones(reqId, list));
    }

    /** 冻结基线（评审通过、估时确认后执行一次） */
    @PostMapping("/requirement/{reqId}/milestones/freeze")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<List<RdmDeliveryVO.Milestone>> freezeMilestones(@PathVariable Long reqId) {
        return Result.success("基線已凍結", deliveryService.freezeMilestoneBaseline(reqId));
    }

    /** PRD 定稿快照（版本链） */
    @GetMapping("/prd/{id}/snapshots")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.PrdSnapshot>> prdSnapshots(@PathVariable Long id) {
        return Result.success(deliveryService.prdSnapshots(id));
    }

    /** 填报工时明细（仅任务负责人本人） */
    @PostMapping("/task/{id}/work-logs")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<List<RdmDeliveryVO.WorkLog>> saveWorkLogs(@PathVariable Long id,
                                                            @RequestBody List<RdmDeliveryDTO.WorkLog> logs) {
        return Result.success("工時已登記", deliveryService.saveWorkLogs(id, logs));
    }

    /** 新增/编辑 PRD */
    @PostMapping("/prd")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Prd> savePrd(@RequestBody RdmDeliveryDTO.Prd dto) {
        return Result.success("PRD 已保存", deliveryService.savePrd(dto));
    }

    /** 删除 PRD（仅草稿） */
    @DeleteMapping("/prd/{id}")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<Void> deletePrd(@PathVariable Long id) {
        deliveryService.deletePrd(id);
        return Result.success();
    }

    /* ── 评审 ── */

    /** 需求下的评审记录 */
    @GetMapping("/requirement/{reqId}/reviews")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Review>> reviews(@PathVariable Long reqId) {
        return Result.success(deliveryService.listReviews(reqId));
    }

    /** 发起评审 */
    @PostMapping("/review")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Review> createReview(@RequestBody RdmDeliveryDTO.Review dto) {
        return Result.success("評審已發起", deliveryService.createReview(dto));
    }

    /** 录入评审结论 */
    @PostMapping("/review/{id}/decision")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Review> decideReview(@PathVariable Long id, @RequestBody RdmDeliveryDTO.ReviewDecision dto) {
        return Result.success("評審結論已録入", deliveryService.decideReview(id, dto));
    }

    /* ── 执行任务与工时 ── */

    /** 需求下的任务列表 */
    @GetMapping("/requirement/{reqId}/tasks")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Task>> tasks(@PathVariable Long reqId) {
        return Result.success(deliveryService.listTasks(reqId));
    }

    /** 我的任务（研发/设计/测试视角；不传 status 时返回未完成） */
    @GetMapping("/tasks/mine")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Task>> myTasks(@RequestParam(required = false) String status) {
        return Result.success(deliveryService.myTasks(status));
    }

    /**
     * 团队任务视图的成员列表（同项目成员；管理员/PMO 为全公司在职员工）。
     * <p>只读：任务协作需要知道同项目同事的进度，不开放任何写能力。
     */
    @GetMapping("/team/members")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.TeamMember>> teamMembers() {
        return Result.success(teamScopeService.teamMembers());
    }

    /**
     * 指定成员的任务（团队协作视图）。
     * <p>数据范围由服务端按「共同在途项目」收敛：只能看共同项目下的任务；
     * 无共同项目返回业务错误，不返回空列表伪装成"对方没任务"。
     */
    @GetMapping("/tasks/team")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Task>> teamTasks(@RequestParam Long userId,
                                                      @RequestParam(required = false) String status) {
        return Result.success(deliveryService.teamTasks(userId, status));
    }

    /** 新增/编辑任务 */
    @PostMapping("/task")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Task> saveTask(@RequestBody RdmDeliveryDTO.Task dto) {
        return Result.success("任務已保存", deliveryService.saveTask(dto));
    }

    /**
     * 任务负责人资格预检（选人时即时提醒）。
     * <p>只回姓名与「能否上报进度」，不返回权限明细；门控与写任务同一组权限。
     */
    @GetMapping("/task/owner-check")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.OwnerCheck> checkTaskOwner(@RequestParam Long userId) {
        return Result.success(deliveryService.checkTaskOwner(userId));
    }

    /** 上报任务进度与工时 */
    @PostMapping("/task/{id}/progress")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Task> taskProgress(@PathVariable Long id, @RequestBody RdmDeliveryDTO.TaskProgress dto) {
        return Result.success("進度已上報", deliveryService.updateTaskProgress(id, dto));
    }

    /**
     * 删除任务。
     * <p>锚点走 rdm-delivery-iteration:delete 而不是研发菜单：研发侧写操作集 DELIVERY_ACTIONS 里
     * 本来就没有 delete，能删迭代的就能删任务。
     * <p>这一处是 intake:delete 映射的唯一例外，故意不加 anyPermissions：它的归宿就
     * 是本注解的主菜单+主动作，再列一遍只会让人以为还需要旧锚点；旧 intake:delete
     * 持有者已由授权镜像拿到本动作。
     */
    @DeleteMapping("/task/{id}")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "delete", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<Void> deleteTask(@PathVariable Long id) {
        deliveryService.deleteTask(id);
        return Result.success();
    }

    /* ── 迭代排期 ── */

    /** 迭代列表（含已排入需求数与工时，用于产能对比）；支持关键词搜索与条数上限（远程搜索下拉） */
    @GetMapping("/iterations")
    @RequirePermission(menu = "rdm-delivery-iteration", anyOf = {"rdm-delivery-board", "rdm-requirement", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmDeliveryVO.Iteration>> iterations(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Integer limit) {
        return Result.success(deliveryService.listIterations(keyword, projectId, limit));
    }

    /** 新增/编辑迭代 */
    @PostMapping("/iteration")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "edit", anyOf = {"rdm-intake", "rdm-delivery-board"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmDeliveryVO.Iteration> saveIteration(@RequestBody RdmDeliveryDTO.Iteration dto) {
        return Result.success("迭代已保存", deliveryService.saveIteration(dto));
    }

    /**
     * 列表操作列直改迭代状态（只动状态，产能/起止仍走编辑表单）。
     * <p>权限锚点与保存迭代完全一致，不新增可授动作。
     */
    @PatchMapping("/iteration/{id}/status")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "edit", anyOf = {"rdm-intake", "rdm-delivery-board"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<Void> updateIterationStatus(@PathVariable Long id,
                                             @RequestBody RdmDeliveryDTO.IterationStatus body) {
        deliveryService.updateIterationStatus(id, body == null ? null : body.getStatus());
        return Result.success("迭代狀態已更新", null);
    }

    /**
     * 删除迭代（逻辑删）。
     * <p>权限锚点与删除任务保持一致（{@code rdm-delivery-iteration:delete}）：
     * 该动作从已退役的 rdm-product 平移而来，持有者本就是能删迭代的人。
     * <p>「未挂需求才能删」由服务层逐表计数兜底，前端按钮显隐不作为安全边界。
     */
    @DeleteMapping("/iteration/{id}")
    @RequirePermission(menu = "rdm-delivery-iteration", action = "delete", anyOf = {"rdm-delivery-board", "rdm-intake"})
    public Result<Void> deleteIteration(@PathVariable Long id) {
        deliveryService.deleteIteration(id);
        return Result.success("迭代已刪除", null);
    }

    /* ── 需求变更 ── */

    /** 需求下的变更记录 */
    @GetMapping("/requirement/{reqId}/changes")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
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
