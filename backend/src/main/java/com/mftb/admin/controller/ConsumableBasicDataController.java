package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.ConsumableBasicDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 耗材基础数据接口（分类 / 品牌）
 * <p>
 * 分类与品牌已并入资产域统一表（biz_eam_category / biz_eam_brand，用 biz_type 区分），
 * 计量单位不再是独立字典（旧 biz_consumable_unit 已废弃），单位由表单作为文本属性直存。
 */
@RestController
@RequestMapping("/api/eam/consumables/basic")
@RequiredArgsConstructor
public class ConsumableBasicDataController {

    private final ConsumableBasicDataService basicDataService;

    /* ===== 分类 ===== */

    @GetMapping("/categories")
    @RequirePermission(menu = "consumable-category")
    public Result<List<ConsumableCategoryVO>> listCategories(
            @RequestParam(required = false) String keyword) {
        return Result.success(basicDataService.listCategories(keyword));
    }

    /** 分类下拉选项（耗材档案表单用，登录即可） */
    @GetMapping("/categories/options")
    public Result<List<ConsumableCategoryVO>> categoryOptions() {
        return Result.success(basicDataService.listCategories(null));
    }

    @PostMapping("/categories")
    @RequirePermission(menu = "consumable-category", action = "create")
    public Result<Long> createCategory(@RequestBody ConsumableCategorySaveDTO dto) {
        return Result.success(basicDataService.createCategory(dto));
    }

    @PutMapping("/categories/{id}")
    @RequirePermission(menu = "consumable-category", action = "edit")
    public Result<Void> updateCategory(@PathVariable long id, @RequestBody ConsumableCategorySaveDTO dto) {
        basicDataService.updateCategory(id, dto);
        return Result.success();
    }

    @DeleteMapping("/categories/{id}")
    @RequirePermission(menu = "consumable-category", action = "delete")
    public Result<Void> deleteCategory(@PathVariable long id) {
        basicDataService.deleteCategory(id);
        return Result.success();
    }

    @PutMapping("/categories/{id}/status")
    @RequirePermission(menu = "consumable-category", action = "edit")
    public Result<Void> toggleCategoryStatus(@PathVariable long id) {
        basicDataService.toggleCategoryStatus(id);
        return Result.success();
    }

    /* ===== 品牌 ===== */

    @GetMapping("/brands")
    @RequirePermission(menu = "consumable-brand")
    public Result<List<ConsumableBrandVO>> listBrands(
            @RequestParam(required = false) String categoryType,
            @RequestParam(required = false) String keyword) {
        return Result.success(basicDataService.listBrands(categoryType, keyword));
    }

    /** 品牌下拉选项（耗材档案表单用，默认只返回 CONSUMABLE + BOTH） */
    @GetMapping("/brands/options")
    public Result<List<ConsumableBrandVO>> brandOptions() {
        // 耗材档案下拉：合并 CONSUMABLE 和 BOTH（排除纯 ASSET 品牌）
        List<ConsumableBrandVO> consumable = basicDataService.listBrands("CONSUMABLE", null);
        List<ConsumableBrandVO> both = basicDataService.listBrands("BOTH", null);
        consumable.addAll(both);
        consumable.sort((a, b) -> a.getName().compareTo(b.getName()));
        return Result.success(consumable);
    }

    @PostMapping("/brands")
    @RequirePermission(menu = "consumable-brand", action = "create")
    public Result<Long> createBrand(@RequestBody ConsumableBrandSaveDTO dto) {
        return Result.success(basicDataService.createBrand(dto));
    }

    @PutMapping("/brands/{id}")
    @RequirePermission(menu = "consumable-brand", action = "edit")
    public Result<Void> updateBrand(@PathVariable long id, @RequestBody ConsumableBrandSaveDTO dto) {
        basicDataService.updateBrand(id, dto);
        return Result.success();
    }

    @DeleteMapping("/brands/{id}")
    @RequirePermission(menu = "consumable-brand", action = "delete")
    public Result<Void> deleteBrand(@PathVariable long id) {
        basicDataService.deleteBrand(id);
        return Result.success();
    }

    @GetMapping("/brands/{id}")
    @RequirePermission(menu = "consumable-brand")
    public Result<ConsumableBrandVO> brandDetail(@PathVariable long id) {
        return Result.success(basicDataService.getBrandDetail(id));
    }

    @PutMapping("/brands/{id}/status")
    @RequirePermission(menu = "consumable-brand", action = "edit")
    public Result<Void> toggleBrandStatus(@PathVariable long id) {
        basicDataService.toggleBrandStatus(id);
        return Result.success();
    }
}
