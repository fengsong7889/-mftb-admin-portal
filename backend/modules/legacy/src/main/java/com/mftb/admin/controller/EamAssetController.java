package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamAssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** 资产台账接口，与验收入库共用 biz_eam_asset。 */
@RestController
@RequestMapping("/api/eam/assets")
@RequiredArgsConstructor
public class EamAssetController {
    private static final String MENU = "asset-list";
    private final EamAssetService assetService;

    /** 资产台账分页列表 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamAssetVO>> page(@ModelAttribute EamAssetQuery query) {
        return Result.success(assetService.page(query));
    }

    /** 资产数量角标（all + 8 个状态各自一次 COUNT）；强制置空 status，避免角标被当前状态筛选吃掉 */
    @GetMapping("/status-counts")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Long>> statusCounts(@ModelAttribute EamAssetQuery query) {
        query.setStatus(null);
        return Result.success(assetService.statusCounts(query));
    }

    /** 资产编号唯一性预校验；excludeId 用于编辑场景排除自身（落库时另有唯一索引兜底） */
    @GetMapping("/check-no")
    @RequirePermission(menu = MENU)
    public Result<Boolean> checkNo(@RequestParam String assetNo, @RequestParam(required = false) Long excludeId) {
        return Result.success(assetService.isAssetNoUnique(assetNo, excludeId));
    }

    /** 资产详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamAssetVO> detail(@PathVariable long id) {
        return Result.success(assetService.detail(id));
    }

    /** 新增资产（编号可留空，由后端按品牌-仓库-分类规则自动生成） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "create")
    public Result<Long> create(@RequestBody EamAssetSaveDTO dto) {
        return Result.success(assetService.create(dto));
    }

    /** 编辑资产；领用中的资产与验收入库生成资产的编号修改会被后端拒绝 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> update(@PathVariable long id, @RequestBody EamAssetSaveDTO dto) {
        assetService.update(id, dto);
        return Result.success();
    }

    /** 删除资产；仅闲置且无活跃领用时可删 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Void> delete(@PathVariable long id) {
        assetService.delete(id);
        return Result.success();
    }
}
