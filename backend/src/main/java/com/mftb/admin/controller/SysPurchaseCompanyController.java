package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.SysPurchaseCompany;
import com.mftb.admin.service.SysPurchaseCompanyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 购买公司字典接口
 * 管理耗材/资产业务的购买公司（法人主体），前端动态加载；与所属品牌相互独立。
 */
@RestController
@RequestMapping("/api/purchase-companies")
@RequiredArgsConstructor
@Tag(name = "系统管理 - 购买公司", description = "购买公司字典 CRUD 接口")
public class SysPurchaseCompanyController {

    private static final String MENU = "rule-config";

    private final SysPurchaseCompanyService companyService;

    /** 启用公司下拉（耗材/资产表单用，登录即可） */
    @GetMapping
    @Operation(summary = "查询购买公司下拉（启用）")
    public Result<List<Map<String, Object>>> list() {
        return Result.success(companyService.listOptions());
    }

    /** 全部公司（含停用，管理用） */
    @GetMapping("/all")
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询全部购买公司（含停用）")
    public Result<List<SysPurchaseCompany>> listAll() {
        return Result.success(companyService.list(null));
    }

    /** 新增公司 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增购买公司")
    public Result<Long> create(@RequestBody SysPurchaseCompany company) {
        return Result.success("公司創建成功", companyService.create(company));
    }

    /** 更新公司 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新购买公司")
    public Result<Void> update(@PathVariable Long id, @RequestBody SysPurchaseCompany company) {
        companyService.update(id, company);
        return Result.success();
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "启用/停用购买公司")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        companyService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除公司（逻辑删除） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除购买公司")
    public Result<Void> delete(@PathVariable Long id) {
        companyService.delete(id);
        return Result.success();
    }
}
