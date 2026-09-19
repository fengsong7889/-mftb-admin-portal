package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamRepairSaveDTO;
import com.mftb.admin.dto.EamRepairVO;
import com.mftb.admin.service.EamRepairService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 资产维修管理接口
 * <p>
 * 管理端点（列表/详情/创建/完成）需 asset-repair 权限。
 */
@RestController
@RequestMapping("/api/eam/repairs")
@RequiredArgsConstructor
public class EamRepairController {

    private static final String MENU = "asset-repair";
    private final EamRepairService repairService;

    /** 维修记录列表 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<List<EamRepairVO>> list(
            @RequestParam(required = false) Long assetId,
            @RequestParam(required = false) String status) {
        return Result.success(repairService.list(assetId, status));
    }

    /** 维修记录详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamRepairVO> detail(@PathVariable long id) {
        return Result.success(repairService.detail(id));
    }

    /** 创建维修记录 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> create(@RequestBody EamRepairSaveDTO dto) {
        return Result.success(repairService.create(dto));
    }

    /** 完成维修 */
    @PostMapping("/{id}/finish")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> finish(@PathVariable long id, @RequestBody Map<String, String> body) {
        repairService.finish(id, body.get("finishDate"));
        return Result.success();
    }
}
