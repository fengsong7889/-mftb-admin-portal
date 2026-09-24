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

    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamAssetVO>> page(@ModelAttribute EamAssetQuery query) {
        return Result.success(assetService.page(query));
    }

    @GetMapping("/status-counts")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Long>> statusCounts(@ModelAttribute EamAssetQuery query) {
        query.setStatus(null);
        return Result.success(assetService.statusCounts(query));
    }

    @GetMapping("/check-no")
    @RequirePermission(menu = MENU)
    public Result<Boolean> checkNo(@RequestParam String assetNo, @RequestParam(required = false) Long excludeId) {
        return Result.success(assetService.isAssetNoUnique(assetNo, excludeId));
    }

    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamAssetVO> detail(@PathVariable long id) {
        return Result.success(assetService.detail(id));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "create")
    public Result<Long> create(@RequestBody EamAssetSaveDTO dto) {
        return Result.success(assetService.create(dto));
    }

    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> update(@PathVariable long id, @RequestBody EamAssetSaveDTO dto) {
        assetService.update(id, dto);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Void> delete(@PathVariable long id) {
        assetService.delete(id);
        return Result.success();
    }
}
