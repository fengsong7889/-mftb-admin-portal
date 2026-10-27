package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmDeliveryItemDTO;
import com.mftb.admin.dto.RdmDeliveryItemVO;
import com.mftb.admin.dto.ScopeVersionRequest;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmDeliveryItemService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）交付项接口（Batch 1）。
 * <p>菜单归属：{@code rdm-delivery-board}（交付看板）。交付项是需求进入执行后的交付单元，
 * 承载范围快照、验收人与验收路径；写操作由服务层校验协调人/验收人资格，控制器只做鉴权与封装。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/delivery-item")
@RequiredArgsConstructor
public class RdmDeliveryItemController {

    private final RdmDeliveryItemService deliveryItemService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 交付项分页列表 */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "view")
    public Result<PageResult<RdmDeliveryItemVO.ListItem>> listItems(RdmDeliveryItemDTO.Query query) {
        Page<RdmDeliveryItemVO.ListItem> page = deliveryItemService.listItems(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 交付项详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "view")
    public Result<RdmDeliveryItemVO.Detail> getItemDetail(@PathVariable Long id) {
        return Result.success(deliveryItemService.getItemDetail(id, currentUserId()));
    }

    /** 交付项可执行动作（按钮口径的单一真相源，含冻结/新版本等范围类动作） */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "view")
    @Operation(summary = "獲取交付項可執行動作")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeDeliveryItemActions(id, currentUserId()));
    }

    /** 范围版本历史（留痕：每次改口径都对应一个版本与原因） */
    @GetMapping("/{id}/scope-history")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "view")
    @Operation(summary = "範圍版本歷史")
    public Result<List<RdmDeliveryItemService.ScopeVersionEntry>> scopeHistory(@PathVariable Long id) {
        return Result.success(deliveryItemService.getScopeVersionHistory(id));
    }

    /* ==================== 写入 ==================== */

    /** 创建交付项 */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "edit")
    public Result<RdmDeliveryItem> createItem(@RequestBody RdmDeliveryItemDTO.Create dto) {
        RdmDeliveryItem item = deliveryItemService.createItem(dto, currentUserId());
        log.info("RDM 交付项已创建: id={}, reqId={}, operator={}",
                item.getId(), item.getReqId(), operatorResolver.currentOperatorName());
        return Result.success("交付項已創建", item);
    }

    /** 编辑交付项（乐观锁，expectedVersion 不匹配即拒绝） */
    @PatchMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "edit")
    public Result<Void> updateItem(@PathVariable Long id, @RequestBody RdmDeliveryItemDTO.Update dto) {
        deliveryItemService.updateItem(id, dto, currentUserId());
        log.info("RDM 交付项已更新: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("交付項已更新", null);
    }

    /** 重算交付项状态（依据下游测试/验收/发布进度回推） */
    @PostMapping("/{id}/recalculate")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "edit")
    public Result<Void> recalculateStatus(@PathVariable Long id) {
        deliveryItemService.recalculateStatus(id);
        log.info("RDM 交付项状态已重算: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("狀態已重算", null);
    }

    /** 冻结交付项范围（冻结后基础编辑收口，改口径必须走新范围版本） */
    @PostMapping("/{id}/freeze-scope")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "edit")
    @Operation(summary = "凍結交付項範圍")
    public Result<String> freezeScope(@PathVariable Long id) {
        deliveryItemService.freezeScope(id, currentUserId());
        log.info("RDM 交付项范围已冻结: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("範圍已凍結", "範圍已凍結");
    }

    /** 创建新范围版本（冻结后改口径的唯一合规路径：version+1、解冻、旧证据失效） */
    @PostMapping("/{id}/new-scope-version")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD, action = "edit")
    @Operation(summary = "創建新範圍版本")
    public Result<String> newScopeVersion(@PathVariable Long id, @RequestBody ScopeVersionRequest request) {
        if (request == null || !org.springframework.util.StringUtils.hasText(request.getChangeReason())) {
            throw new BusinessException("範圍變更原因不能為空");
        }
        deliveryItemService.createNewScopeVersion(id, request.getChangeReason(), request.getNewScopeDesc(),
                request.getNewAcceptanceCriteria(), currentUserId());
        log.info("RDM 交付项范围版本已更新: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("範圍版本已更新", "範圍版本已更新");
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        return user == null ? null : user.getId();
    }
}
