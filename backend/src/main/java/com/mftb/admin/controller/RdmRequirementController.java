package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmAcceptanceDTO;
import com.mftb.admin.dto.RdmAcceptanceVO;
import com.mftb.admin.dto.RdmOptionVO;
import com.mftb.admin.dto.RdmRequirementCreateDTO;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.dto.RdmWorkbenchVO;
import com.mftb.admin.entity.RdmComment;
import com.mftb.admin.service.RdmRequirementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 產研協同（RDM）需求接口。
 * <p>菜单归属：读操作在需求相关菜单间共享（anyOf OR 语义），写操作按动作归属到具体菜单，
 * 避免出现「看得到列表却打不开详情」的授权缝隙。
 */
@RestController
@RequestMapping("/api/rdm")
@RequiredArgsConstructor
public class RdmRequirementController {

    private final RdmRequirementService requirementService;

    /* ==================== 查询 ==================== */

    /** 需求分页列表（scope 决定视角，服务端按登录人收敛数据范围） */
    @GetMapping("/requirement")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<PageResult<RdmRequirementVO>> page(RdmRequirementQuery query) {
        return Result.success(requirementService.page(query));
    }

    /** 各视角 Tab 数量 */
    @GetMapping("/requirement/scope-counts")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<Map<String, Long>> scopeCounts() {
        return Result.success(requirementService.scopeCounts());
    }

    /** 需求详情 */
    @GetMapping("/requirement/{id}")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<RdmRequirementVO> detail(@PathVariable Long id) {
        return Result.success(requirementService.detail(id));
    }

    /** 工作台待办聚合 */
    @GetMapping("/workbench")
    @RequirePermission(menu = RdmConstants.MENU_WORKBENCH, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<RdmWorkbenchVO> workbench() {
        return Result.success(requirementService.workbench());
    }

    /* ==================== 写入 ==================== */

    /** 提交需求（mode=draft 存草稿） */
    @PostMapping("/requirement")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "create")
    public Result<RdmRequirementVO> create(@RequestBody RdmRequirementCreateDTO dto) {
        return Result.success("需求已提交", requirementService.create(dto));
    }

    /** 修改需求（仅草稿态） */
    @PutMapping("/requirement/{id}")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "create")
    public Result<RdmRequirementVO> update(@PathVariable Long id, @RequestBody RdmRequirementCreateDTO dto) {
        return Result.success(requirementService.update(id, dto));
    }

    /** 撤回为草稿 */
    @PostMapping("/requirement/{id}/withdraw")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "create")
    public Result<RdmRequirementVO> withdraw(@PathVariable Long id) {
        return Result.success(requirementService.withdraw(id));
    }

    /**
     * 提出人自助提交 / 修改后重提（只要求 create）。
     * <p>为什么不开到通用流转接口上：那个入口要求 {@code rdm-requirement:edit}，
     * 而 edit 是需求侧处理权（受理/PRD/评审/变更）；让员工为了提交自己的草稿去拿 edit，
     * 等于把产品处理权一并授出去。服务端仍会校资源归属与状态机角色。
     */
    @PostMapping("/requirement/{id}/submit")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "create")
    public Result<RdmRequirementVO> selfSubmit(@PathVariable Long id,
                                               @RequestBody(required = false) RdmTransitionDTO dto) {
        return Result.success("需求已提交", requirementService.selfSubmit(id, dto));
    }

    /** 状态流转 */
    @PostMapping("/requirement/{id}/transition")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "edit", anyOf = {"rdm-intake", "rdm-acceptance"})
    public Result<RdmRequirementVO> transition(@PathVariable Long id, @RequestBody RdmTransitionDTO dto) {
        return Result.success("狀態已更新", requirementService.transition(id, dto));
    }

    /** 批量分配产品经理 */
    @PostMapping("/requirement/batch-assign")
    @RequirePermission(menu = RdmConstants.MENU_INTAKE, action = "edit")
    public Result<Integer> batchAssign(@RequestBody BatchAssignRequest request) {
        return Result.success("分配完成",
                requirementService.batchAssign(request.ids(), request.pmUserId()));
    }

    /**
     * 产品经理自需求池认领。
     * <p>权限上只要受理权（rdm-requirement:edit），服务端会再校在职/资格与原子抢单，
     * 不要求分配权——否则产品PM 只能等技术负责人分配。
     */
    @PostMapping("/requirement/{id}/claim")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "edit",
            anyOf = {RdmConstants.MENU_INTAKE, RdmConstants.MENU_DELIVERY_BOARD})
    public Result<RdmRequirementVO> claim(@PathVariable Long id) {
        return Result.success("已認領該需求", requirementService.claim(id));
    }

    /** 改派产品经理（只有分配侧授权可用；旧受理人保留历史贡献） */
    @PostMapping("/requirement/{id}/reassign")
    @RequirePermission(menu = RdmConstants.MENU_INTAKE, action = "edit")
    public Result<RdmRequirementVO> reassign(@PathVariable Long id, @RequestBody RdmTransitionDTO dto) {
        return Result.success("已改派", requirementService.reassignPm(id, dto));
    }

    /** 添加沟通记录 */
    @PostMapping("/requirement/{id}/comment")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "create", anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<RdmComment> addComment(@PathVariable Long id, @RequestBody CommentRequest request) {
        return Result.success(requirementService.addComment(id, request.content(), request.internal()));
    }

    /** 催办 */
    @PostMapping("/requirement/{id}/urge")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<Void> urge(@PathVariable Long id) {
        requirementService.urge(id);
        return Result.success();
    }

    /** 提交业务验收结论 */
    @PostMapping("/requirement/{id}/acceptance")
    @RequirePermission(menu = RdmConstants.MENU_ACCEPTANCE, action = "create")
    public Result<Void> submitAcceptance(@PathVariable Long id, @RequestBody RdmAcceptanceDTO dto) {
        requirementService.submitAcceptance(id, dto);
        return Result.success("驗收結論已提交", null);
    }

    /**
     * 历次验收记录（含逐条用例）——M3 返工链路与一次通过率展示。
     * <p>读权限与需求详情同口径：参与人可看，越权猜 id 会被数据范围收敛拦住。
     */
    @GetMapping("/requirement/{id}/acceptance-history")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<List<RdmAcceptanceVO>> acceptanceHistory(@PathVariable Long id) {
        return Result.success(requirementService.acceptanceHistory(id));
    }

    /* ==================== 下拉选项 ==================== */

    /** 产品经理候选（含在途负载） */
    @GetMapping("/options/product-managers")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<List<RdmOptionVO.ProductManager>> productManagers() {
        return Result.success(requirementService.productManagers());
    }

    /** 系统 → 菜单 级联树 */
    @GetMapping("/options/menu-tree")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<List<RdmOptionVO.MenuNode>> menuTree() {
        return Result.success(requirementService.menuTree());
    }

    /** 菜单下的功能点候选 */
    @GetMapping("/options/function-points")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {"rdm-intake", "rdm-acceptance", "rdm-dashboard-board", "rdm-workbench"})
    public Result<List<RdmOptionVO.FunctionPoint>> functionPoints(@RequestParam(required = false) String menuKey) {
        return Result.success(requirementService.functionPoints(menuKey));
    }

    /** 批量分配请求体 */
    public record BatchAssignRequest(List<Long> ids, Long pmUserId) {
    }

    /** 沟通记录请求体 */
    public record CommentRequest(String content, Boolean internal) {
    }
}
