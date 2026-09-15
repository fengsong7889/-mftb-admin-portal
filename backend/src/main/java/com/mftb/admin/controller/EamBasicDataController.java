package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamBrandSaveDTO;
import com.mftb.admin.dto.EamCategoryAccessorySaveDTO;
import com.mftb.admin.dto.EamCategorySaveDTO;
import com.mftb.admin.dto.EamLocationSaveDTO;
import com.mftb.admin.dto.EamModelSaveDTO;
import com.mftb.admin.dto.EamParamTypeSaveDTO;
import com.mftb.admin.dto.EamParamValueSaveDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamBasicDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * EAM 基础数据控制器（分类 / 品牌 / 型号 / 位置）
 */
@RestController
@RequestMapping("/api/eam/basic")
@RequiredArgsConstructor
public class EamBasicDataController {

    private final EamBasicDataService basicDataService;

    /* ==================== 资产分类 ==================== */

    /** 分类列表（平铺返回，页面自行构树） */
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

    /** 新增分类 */
    @PostMapping("/categories")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Long> createCategory(@RequestBody EamCategorySaveDTO dto) {
        return Result.success(basicDataService.createCategory(dto));
    }

    /** 更新分类 */
    @PutMapping("/categories/{id}")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Void> updateCategory(@PathVariable long id, @RequestBody EamCategorySaveDTO dto) {
        basicDataService.updateCategory(id, dto);
        return Result.success();
    }

    /** 删除分类 */
    @DeleteMapping("/categories/{id}")
    @RequirePermission(menu = "asset-category", action = "delete")
    public Result<Void> deleteCategory(@PathVariable long id) {
        basicDataService.deleteCategory(id);
        return Result.success();
    }

    /** 切换分类状态 */
    @PutMapping("/categories/{id}/toggle")
    @RequirePermission(menu = "asset-category", action = "edit")
    public Result<Void> toggleCategoryStatus(@PathVariable long id) {
        basicDataService.toggleCategoryStatus(id);
        return Result.success();
    }

    /* ==================== 资产品牌库 ==================== */

    /** 资产品牌列表 */
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

    /** 新增资产品牌 */
    @PostMapping("/brands")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Long> createBrand(@RequestBody EamBrandSaveDTO dto) {
        return Result.success(basicDataService.createBrand(dto));
    }

    /** 更新资产品牌 */
    @PutMapping("/brands/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateBrand(@PathVariable long id, @RequestBody EamBrandSaveDTO dto) {
        basicDataService.updateBrand(id, dto);
        return Result.success();
    }

    /** 删除资产品牌 */
    @DeleteMapping("/brands/{id}")
    @RequirePermission(menu = "asset-model", action = "delete")
    public Result<Void> deleteBrand(@PathVariable long id) {
        basicDataService.deleteBrand(id);
        return Result.success();
    }

    /* ==================== 产品型号库 ==================== */

    /** 型号分页列表 */
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

    /** 型号详情 */
    @GetMapping("/models/{id}")
    @RequirePermission(menu = "asset-model")
    public Result<Map<String, Object>> modelDetail(@PathVariable long id) {
        return Result.success(basicDataService.getModelDetail(id));
    }

    /** 新增型号 */
    @PostMapping("/models")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Long> createModel(@RequestBody EamModelSaveDTO dto) {
        return Result.success(basicDataService.createModel(dto));
    }

    /** 更新型号 */
    @PutMapping("/models/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateModel(@PathVariable long id, @RequestBody EamModelSaveDTO dto) {
        basicDataService.updateModel(id, dto);
        return Result.success();
    }

    /** 删除型号 */
    @DeleteMapping("/models/{id}")
    @RequirePermission(menu = "asset-model", action = "delete")
    public Result<Void> deleteModel(@PathVariable long id) {
        basicDataService.deleteModel(id);
        return Result.success();
    }

    /* ==================== 仓库 / 存放位置 ==================== */

    /** 位置列表（平铺返回，页面自行构树） */
    @GetMapping("/locations")
    @RequirePermission(menu = "asset-location")
    public Result<List<Map<String, Object>>> listLocations(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String province,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String updatedBy) {
        return Result.success(basicDataService.listLocations(keyword, name, code, province, city, district, updatedBy));
    }

    /** 新增位置 */
    @PostMapping("/locations")
    @RequirePermission(menu = "asset-location", action = "edit")
    public Result<Long> createLocation(@RequestBody EamLocationSaveDTO dto) {
        return Result.success(basicDataService.createLocation(dto));
    }

    /** 更新位置 */
    @PutMapping("/locations/{id}")
    @RequirePermission(menu = "asset-location", action = "edit")
    public Result<Void> updateLocation(@PathVariable long id, @RequestBody EamLocationSaveDTO dto) {
        basicDataService.updateLocation(id, dto);
        return Result.success();
    }

    /** 删除位置 */
    @DeleteMapping("/locations/{id}")
    @RequirePermission(menu = "asset-location", action = "delete")
    public Result<Void> deleteLocation(@PathVariable long id) {
        basicDataService.deleteLocation(id);
        return Result.success();
    }

    /* ==================== 参数库 ==================== */

    /** 参数类型分页列表 */
    @GetMapping("/param-types")
    @RequirePermission(menu = "param-library")
    public Result<PageResult<Map<String, Object>>> pageParamTypes(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String status) {
        return Result.success(basicDataService.pageParamTypes(page, size, categoryCode, name, code, status));
    }

    /** 新增参数类型 */
    @PostMapping("/param-types")
    @RequirePermission(menu = "param-library", action = "edit")
    public Result<Long> createParamType(@RequestBody EamParamTypeSaveDTO dto) {
        return Result.success(basicDataService.createParamType(dto));
    }

    /** 更新参数类型 */
    @PutMapping("/param-types/{id}")
    @RequirePermission(menu = "param-library", action = "edit")
    public Result<Void> updateParamType(@PathVariable long id, @RequestBody EamParamTypeSaveDTO dto) {
        basicDataService.updateParamType(id, dto);
        return Result.success();
    }

    /** 删除参数类型 */
    @DeleteMapping("/param-types/{id}")
    @RequirePermission(menu = "param-library", action = "delete")
    public Result<Void> deleteParamType(@PathVariable long id) {
        basicDataService.deleteParamType(id);
        return Result.success();
    }

    /** 根据参数类型编码查询参数值 */
    @GetMapping("/param-types/{paramTypeCode}/values")
    @RequirePermission(menu = "param-library")
    public Result<List<Map<String, Object>>> listParamValuesByType(@PathVariable String paramTypeCode) {
        return Result.success(basicDataService.listParamValuesByType(paramTypeCode));
    }

    /** 参数值分页列表 */
    @GetMapping("/param-values")
    @RequirePermission(menu = "param-library")
    public Result<PageResult<Map<String, Object>>> pageParamValues(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String paramTypeCode,
            @RequestParam(required = false) String categoryCode) {
        return Result.success(basicDataService.pageParamValues(page, size, paramTypeCode, categoryCode));
    }

    /** 新增参数值 */
    @PostMapping("/param-values")
    @RequirePermission(menu = "param-library", action = "edit")
    public Result<Long> createParamValue(@RequestBody EamParamValueSaveDTO dto) {
        return Result.success(basicDataService.createParamValue(dto));
    }

    /** 更新参数值 */
    @PutMapping("/param-values/{id}")
    @RequirePermission(menu = "param-library", action = "edit")
    public Result<Void> updateParamValue(@PathVariable long id, @RequestBody EamParamValueSaveDTO dto) {
        basicDataService.updateParamValue(id, dto);
        return Result.success();
    }

    /** 删除参数值 */
    @DeleteMapping("/param-values/{id}")
    @RequirePermission(menu = "param-library", action = "delete")
    public Result<Void> deleteParamValue(@PathVariable long id) {
        basicDataService.deleteParamValue(id);
        return Result.success();
    }

    /* ==================== 分类配件配置 ==================== */

    /**
     * 分类配件列表（同分类下所有产品共用，验收时可一键带入）。
     * 仅需登录即可读：验收入库等模块需按分类加载配件选项，验收人未必持有基础数据菜单权限。
     * onlyEnabled=true 时仅返回启用状态的配件（验收弹窗选项用）。
     */
    @GetMapping("/category-accessories")
    public Result<List<Map<String, Object>>> listCategoryAccessories(
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false, defaultValue = "false") boolean onlyEnabled) {
        return Result.success(basicDataService.listCategoryAccessories(categoryCode, onlyEnabled));
    }

    /** 新增分类配件（资产品牌产品库配件配置页） */
    @PostMapping("/category-accessories/{categoryCode}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Long> createCategoryAccessory(
            @PathVariable String categoryCode,
            @RequestBody EamCategoryAccessorySaveDTO dto) {
        return Result.success(basicDataService.createCategoryAccessory(categoryCode, dto));
    }

    /** 修改分类配件（名称/默认数量） */
    @PutMapping("/category-accessories/item/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateCategoryAccessory(
            @PathVariable long id,
            @RequestBody EamCategoryAccessorySaveDTO dto) {
        basicDataService.updateCategoryAccessory(id, dto);
        return Result.success();
    }

    /** 启用/停用分类配件（status: 1=启用, 0=停用） */
    @PutMapping("/category-accessories/item/{id}/status")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> updateCategoryAccessoryStatus(
            @PathVariable long id,
            @RequestParam Integer status) {
        basicDataService.updateCategoryAccessoryStatus(id, status);
        return Result.success();
    }

    /** 删除分类配件（逻辑删除） */
    @DeleteMapping("/category-accessories/item/{id}")
    @RequirePermission(menu = "asset-model", action = "edit")
    public Result<Void> deleteCategoryAccessory(@PathVariable long id) {
        basicDataService.deleteCategoryAccessory(id);
        return Result.success();
    }
}
