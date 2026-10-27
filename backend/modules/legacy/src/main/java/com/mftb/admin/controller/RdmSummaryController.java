package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmSummaryService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 產研交付（RDM）統一摘要接口（Batch 2 / Phase 2）。
 * <p>「一處計算、多處消費」的統計口徑出口：項目/需求/交付項/個人工作台/項目列表統計卡都走
 * {@link RdmSummaryService} 實時計算，不再各頁面各算各的數，杜絕「同一事實兩個數字」。
 * 控制器只做鑒權（按各摘要所屬菜單收口）、取當前操作人與結果封裝；數據範圍在服務層按登錄人收斂。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/summary")
@RequiredArgsConstructor
@Tag(name = "RDM 統一摘要")
public class RdmSummaryController {

    private final RdmSummaryService summaryService;
    private final OperatorResolver operatorResolver;

    /** 項目摘要（詳情頁/導出/工作台復用） */
    @GetMapping("/project/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    @Operation(summary = "項目摘要")
    public Result<RdmSummaryService.ProjectSummary> projectSummary(@PathVariable Long id) {
        return Result.success(summaryService.getProjectSummary(id, currentUserId()));
    }

    /** 需求摘要（需求詳情/列表展開行） */
    @GetMapping("/requirement/{id}")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "view")
    @Operation(summary = "需求摘要")
    public Result<RdmSummaryService.RequirementSummary> requirementSummary(@PathVariable Long id) {
        return Result.success(summaryService.getRequirementSummary(id, currentUserId()));
    }

    /** 交付項摘要（交付項詳情/發布批次閘門預覽） */
    @GetMapping("/delivery-item/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "view")
    @Operation(summary = "交付項摘要")
    public Result<RdmSummaryService.DeliveryItemSummary> deliveryItemSummary(@PathVariable Long id) {
        return Result.success(summaryService.getDeliveryItemSummary(id, currentUserId()));
    }

    /** 個人工作台摘要（我參與的項目/待辦/臨期節點，按登錄人取數） */
    @GetMapping("/workbench")
    @RequirePermission(menu = RdmConstants.MENU_WORKBENCH, action = "view")
    @Operation(summary = "個人工作台摘要")
    public Result<RdmSummaryService.WorkbenchSummary> workbenchSummary() {
        return Result.success(summaryService.getWorkbenchSummary(currentUserId()));
    }

    /** 項目列表統計卡（跟隨篩選條件，與列表取數同一組 filters） */
    @GetMapping("/project-stats")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    @Operation(summary = "項目列表統計")
    public Result<RdmSummaryService.ProjectListStats> projectListStats(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(summaryService.getProjectListStats(currentUserId(), status, keyword));
    }

    /** 當前登錄人 ID（未登錄返回 null，由服務層與 @RequirePermission 雙重兜底） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        return user == null ? null : user.getId();
    }
}
