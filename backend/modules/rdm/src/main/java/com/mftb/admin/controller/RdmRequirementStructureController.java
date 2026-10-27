package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.AddStructureChildRequest;
import com.mftb.admin.dto.RemoveStructureChildRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * 產研交付（RDM）需求結構管理接口（Batch 2 / Phase 2）。
 * <p>菜單歸屬：{@code rdm-requirement}。結構主子關係表達「聚合需求下掛多個執行需求」，
 * 是 V3 分層並行鏈路的語義；環檢測、單父約束、父需為 aggregate 等校驗一律在服務層強制，
 * 控制器只做鑒權、入參非空校驗、取當前操作人與結果封裝。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/requirement-structure")
@RequiredArgsConstructor
@Tag(name = "RDM 需求結構管理")
public class RdmRequirementStructureController {

    private final RdmRequirementStructureService structureService;
    private final OperatorResolver operatorResolver;

    /* ==================== 寫入 ==================== */

    /** 添加結構子需求 */
    @PostMapping("/add-child")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "edit")
    @Operation(summary = "添加結構子需求")
    public Result<String> addChild(@RequestBody AddStructureChildRequest request) {
        if (request == null || request.getParentReqId() == null || request.getChildReqId() == null) {
            throw new BusinessException("父需求與子需求不能為空");
        }
        structureService.addChildRequirement(request.getParentReqId(), request.getChildReqId(), currentUserId());
        log.info("RDM 結構子需求已添加: parentReqId={}, childReqId={}, operator={}",
                request.getParentReqId(), request.getChildReqId(), operatorResolver.currentOperatorName());
        return Result.success("子需求已添加", "子需求已添加");
    }

    /** 移除結構子需求 */
    @PostMapping("/remove-child")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "edit")
    @Operation(summary = "移除結構子需求")
    public Result<String> removeChild(@RequestBody RemoveStructureChildRequest request) {
        if (request == null || request.getParentReqId() == null || request.getChildReqId() == null) {
            throw new BusinessException("父需求與子需求不能為空");
        }
        structureService.removeChildRequirement(request.getParentReqId(), request.getChildReqId(), currentUserId());
        log.info("RDM 結構子需求已移除: parentReqId={}, childReqId={}, operator={}",
                request.getParentReqId(), request.getChildReqId(), operatorResolver.currentOperatorName());
        return Result.success("子需求已移除", "子需求已移除");
    }

    /* ==================== 查詢 ==================== */

    /** 獲取需求結構樹（以 reqId 為根的直接子樹） */
    @GetMapping("/tree/{reqId}")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "view")
    @Operation(summary = "獲取需求結構樹")
    public Result<List<RdmRequirementStructureService.RequirementTreeNode>> getTree(@PathVariable Long reqId) {
        return Result.success(structureService.getRequirementTree(reqId));
    }

    /** 獲取需求祖先鏈（從根到當前需求） */
    @GetMapping("/ancestors/{reqId}")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "view")
    @Operation(summary = "獲取需求祖先鏈")
    public Result<List<RdmRequirementStructureService.RequirementTreeNode>> getAncestors(@PathVariable Long reqId) {
        return Result.success(structureService.getAncestorChain(reqId));
    }

    /** 當前登錄人 ID（未登錄返回 null，由服務層與 @RequirePermission 雙重兜底） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        return user == null ? null : user.getId();
    }
}
