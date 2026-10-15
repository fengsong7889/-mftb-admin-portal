package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmAcceptanceRecordDTO;
import com.mftb.admin.dto.RdmAcceptanceRecordVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAcceptanceRecordService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 產研交付（RDM）交付项级验收记录接口（Batch 1）。
 * <p>菜单归属：{@code rdm-acceptance}（需求驗收）。验收分产品/业务两类、上线前/后两阶段；
 * 签字人身份由服务端按交付项上的验收人字段校验，前端传谁不算数。
 * <p>路径挂在交付项下（{@code /delivery-item/{deliveryItemId}/acceptance}）：验收记录天然隶属于某个交付项，
 * 列表强制以路径上的交付项为准，避免前端篡改 query 里的 deliveryItemId 越权翻别的交付项验收单。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/delivery-item/{deliveryItemId}/acceptance")
@RequiredArgsConstructor
public class RdmAcceptanceRecordController {

    private final RdmAcceptanceRecordService acceptanceRecordService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 某交付项下的验收记录分页列表 */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_ACCEPTANCE, action = "view")
    public Result<PageResult<RdmAcceptanceRecordVO.ListItem>> listRecords(
            @PathVariable Long deliveryItemId, RdmAcceptanceRecordDTO.Query query) {
        RdmAcceptanceRecordDTO.Query q = query == null ? new RdmAcceptanceRecordDTO.Query() : query;
        // 数据范围以路径为准，屏蔽前端传入的 deliveryItemId，防越权翻其他交付项
        q.setDeliveryItemId(deliveryItemId);
        Page<RdmAcceptanceRecordVO.ListItem> page = acceptanceRecordService.listRecords(q, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 验收记录详情 */
    @GetMapping("/detail/{recordId}")
    @RequirePermission(menu = RdmConstants.MENU_ACCEPTANCE, action = "view")
    public Result<RdmAcceptanceRecordVO.Detail> getRecordDetail(@PathVariable Long deliveryItemId,
                                                                @PathVariable Long recordId) {
        // B.9 记录归属核对：recordId 必须属于路径上的交付项
        return Result.success(acceptanceRecordService.getRecordDetail(recordId, deliveryItemId));
    }

    /* ==================== 写入 ==================== */

    /** 提交验收结论（签字人身份由服务端按交付项验收人字段校验） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_ACCEPTANCE, action = "create")
    public Result<RdmAcceptanceRecord> submitAcceptance(@PathVariable Long deliveryItemId,
                                                        @RequestBody RdmAcceptanceRecordDTO.Submit dto) {
        SysUser user = operatorResolver.currentUser();
        RdmAcceptanceRecord record = acceptanceRecordService.submitAcceptance(
                deliveryItemId, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 验收记录已提交: deliveryItemId={}, recordId={}, type={}, conclusion={}, operator={}",
                deliveryItemId, record == null ? null : record.getId(),
                dto == null ? null : dto.getAcceptanceType(), dto == null ? null : dto.getConclusion(),
                operatorResolver.currentOperatorName());
        return Result.success("驗收結論已提交", record);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        return userId(operatorResolver.currentUser());
    }

    private Long userId(SysUser user) {
        return user == null ? null : user.getId();
    }
}
