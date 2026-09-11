package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamBasicDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * EAM 基礎數據控制器（分類 / 品牌 / 型號 / 位置）
 */
@RestController
@RequestMapping("/api/eam/basic")
@RequiredArgsConstructor
public class EamBasicDataController {

    private final EamBasicDataService basicDataService;

    /* ==================== 資產分類 ==================== */

    /** 分類列表（平鋪返回，頁面自行構樹） */
    @GetMapping("/categories")
    @RequirePermission(menu = "asset-category")
    public Result<List<Map<String, Object>>> listCategories(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtStart,
            @RequestParam(required = false) String updatedAtEnd) {
        return Result.success(basicDataService.listCategories(keyword, name, code, updatedBy, updatedAtStart, updatedAtEnd));
    }

    /** 新增分類 */
    @PostMapping("/categories")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Long> createCategory(@RequestBody Map<String, Object> data) {
        return Result.success(basicDataService.createCategory(data));
    }

    /** 更新分類 */
    @PutMapping("/categories/{id}")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Void> updateCategory(@PathVariable long id, @RequestBody Map<String, Object> data) {
        basicDataService.updateCategory(id, data);
        return Result.success();
    }

    /** 刪除分類 */
    @DeleteMapping("/categories/{id}")
    @RequirePermission(menu = "asset-category", action = "delete")
    public Result<Void> deleteCategory(@PathVariable long id) {
        basicDataService.deleteCategory(id);
        return Result.success();
    }

    /** 切換分類狀態 */
    @PutMapping("/categories/{id}/toggle")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Void> toggleCategoryStatus(@PathVariable long id) {
        basicDataService.toggleCategoryStatus(id);
        return Result.success();
    }

    /* ==================== 品牌庫 ==================== */

    /** 品牌列表 */
    @GetMapping("/brands")
    @RequirePermission(menu = "asset-model")
    public Result<List<Map<String, Object>>> listBrands(
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String brandZh,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtStart,
            @RequestParam(required = false) String updatedAtEnd) {
        return Result.success(basicDataService.listBrands(categoryCode, brandZh, updatedBy, updatedAtStart, updatedAtEnd));
    }

    /** 新增品牌 */
    @PostMapping("/brands")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Long> createBrand(@RequestBody Map<String, Object> data) {
        return Result.success(basicDataService.createBrand(data));
    }

    /** 更新品牌 */
    @PutMapping("/brands/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateBrand(@PathVariable long id, @RequestBody Map<String, Object> data) {
        basicDataService.updateBrand(id, data);
        return Result.success();
    }

    /** 刪除品牌 */
    @DeleteMapping("/brands/{id}")
    @RequirePermission(menu = "asset-model", action = "delete")
    public Result<Void> deleteBrand(@PathVariable long id) {
        basicDataService.deleteBrand(id);
        return Result.success();
    }

    /* ==================== 產品型號庫 ==================== */

    /** 型號分頁列表 */
    @GetMapping("/models")
    @RequirePermission(menu = "asset-model")
    public Result<PageResult<Map<String, Object>>> pageModels(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) Long brandId,
            @RequestParam(required = false) String brandZh,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtStart,
            @RequestParam(required = false) String updatedAtEnd) {
        return Result.success(basicDataService.pageModels(page, size, categoryCode, brandId, brandZh, name,
                updatedBy, updatedAtStart, updatedAtEnd));
    }

    /** 型號詳情 */
    @GetMapping("/models/{id}")
    @RequirePermission(menu = "asset-model")
    public Result<Map<String, Object>> modelDetail(@PathVariable long id) {
        return Result.success(basicDataService.getModelDetail(id));
    }

    /** 新增型號 */
    @PostMapping("/models")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Long> createModel(@RequestBody Map<String, Object> data) {
        return Result.success(basicDataService.createModel(data));
    }

    /** 更新型號 */
    @PutMapping("/models/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateModel(@PathVariable long id, @RequestBody Map<String, Object> data) {
        basicDataService.updateModel(id, data);
        return Result.success();
    }

    /** 刪除型號 */
    @DeleteMapping("/models/{id}")
    @RequirePermission(menu = "asset-model", action = "delete")
    public Result<Void> deleteModel(@PathVariable long id) {
        basicDataService.deleteModel(id);
        return Result.success();
    }

    /* ==================== 倉庫 / 存放位置 ==================== */

    /** 位置列表（平鋪返回，頁面自行構樹） */
    @GetMapping("/locations")
    @RequirePermission(menu = "asset-location")
    public Result<List<Map<String, Object>>> listLocations(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String updatedBy) {
        return Result.success(basicDataService.listLocations(keyword, name, code, type, updatedBy));
    }

    /** 新增位置 */
    @PostMapping("/locations")
    @RequirePermission(menu = "asset-location", action = "edit")
    public Result<Long> createLocation(@RequestBody Map<String, Object> data) {
        return Result.success(basicDataService.createLocation(data));
    }

    /** 更新位置 */
    @PutMapping("/locations/{id}")
    @RequirePermission(menu = "asset-location", action = "edit")
    public Result<Void> updateLocation(@PathVariable long id, @RequestBody Map<String, Object> data) {
        basicDataService.updateLocation(id, data);
        return Result.success();
    }

    /** 刪除位置 */
    @DeleteMapping("/locations/{id}")
    @RequirePermission(menu = "asset-location", action = "delete")
    public Result<Void> deleteLocation(@PathVariable long id) {
        basicDataService.deleteLocation(id);
        return Result.success();
    }
}
