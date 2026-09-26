package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.SysCompanyBrand;
import com.mftb.admin.service.SysCompanyBrandService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 公司品牌配置接口
 * 管理系统公司品牌（闪蜂/mFood 等），前端动态加载
 * <p>实际消费方为物资管理（资产/耗材档案），菜单拆分后归属 asset-basic（基础数据）。
 */
@RestController
@RequestMapping("/api/company-brands")
@RequiredArgsConstructor
@Tag(name = "系统管理 - 公司品牌", description = "公司品牌配置 CRUD 接口")
public class SysCompanyBrandController {

    private static final String MENU = "asset-basic";

    private final SysCompanyBrandService brandService;

    /** 查询全部公司品牌（启用状态，前端下拉用） */
    @GetMapping
    @Operation(summary = "查询公司品牌列表")
    public Result<List<Map<String, Object>>> list(
            @RequestParam(required = false) Integer status) {
        return Result.success(brandService.listOptions());
    }

    /** 查询全部品牌（含停用，管理用） */
    @GetMapping("/all")
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询全部公司品牌（含停用）")
    public Result<List<SysCompanyBrand>> listAll() {
        return Result.success(brandService.list(null));
    }

    /** 新增品牌 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增公司品牌")
    public Result<Long> create(@RequestBody SysCompanyBrand brand) {
        return Result.success("品牌創建成功", brandService.create(brand));
    }

    /** 更新品牌 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新公司品牌")
    public Result<Void> update(@PathVariable Long id, @RequestBody SysCompanyBrand brand) {
        brandService.update(id, brand);
        return Result.success();
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "启用/停用公司品牌")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        brandService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除品牌 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除公司品牌")
    public Result<Void> delete(@PathVariable Long id) {
        brandService.delete(id);
        return Result.success();
    }
}
