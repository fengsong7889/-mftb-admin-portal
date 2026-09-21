package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamClaimEmployeeOptionVO;
import com.mftb.admin.dto.EamRepairSaveDTO;
import com.mftb.admin.dto.EamRepairVO;
import com.mftb.admin.service.EamBasicDataService;
import com.mftb.admin.service.EamClaimService;
import com.mftb.admin.service.EamRepairService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
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
    private final EamClaimService claimService;
    private final EamBasicDataService basicDataService;

    /** 维修方下拉选项：内置"自修" + 启用状态的供应商列表，仅需维修菜单权限。 */
    @GetMapping("/repairer-options")
    @RequirePermission(menu = MENU)
    public Result<List<Map<String, String>>> repairerOptions(
            @RequestParam(name = "keyword", required = false) String keyword) {
        List<Map<String, String>> options = new ArrayList<>();
        // 内置"自修"选项，始终排在最前
        Map<String, String> selfRepair = new LinkedHashMap<>();
        selfRepair.put("value", "自修");
        selfRepair.put("label", "自修");
        options.add(selfRepair);
        // 从供应商管理读取启用的供应商，复用基础数据服务
        List<Map<String, Object>> suppliers = basicDataService.listSuppliersDropdown(keyword);
        for (Map<String, Object> s : suppliers) {
            Map<String, String> opt = new LinkedHashMap<>();
            String name = String.valueOf(s.get("name"));
            String code = String.valueOf(s.get("code"));
            opt.put("value", name);
            opt.put("label", code + " - " + name);
            options.add(opt);
        }
        return Result.success(options);
    }

    /** 维修申请人搜索，仅需维修菜单权限，复用在职员工精简选项。 */
    @GetMapping("/applicant-options")
    @RequirePermission(menu = MENU)
    public Result<List<EamClaimEmployeeOptionVO>> applicantOptions(
            @RequestParam(name = "keyword", required = false) String keyword) {
        return Result.success(claimService.employeeOptions(keyword, null));
    }

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

    /** 更新维修记录（仅允许维修中状态） */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> update(@PathVariable long id, @RequestBody EamRepairSaveDTO dto) {
        repairService.update(id, dto);
        return Result.success();
    }

    /** 删除维修记录（仅允许维修中状态） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> delete(@PathVariable long id) {
        repairService.delete(id);
        return Result.success();
    }
}
