package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamAssetTagBindDTO;
import com.mftb.admin.dto.EamAssetTagSaveDTO;
import com.mftb.admin.dto.EamBrandSaveDTO;
import com.mftb.admin.dto.EamCategoryAccessorySaveDTO;
import com.mftb.admin.dto.EamCategorySaveDTO;
import com.mftb.admin.dto.EamLocationSaveDTO;
import com.mftb.admin.dto.EamModelSaveDTO;
import com.mftb.admin.dto.EamParamTypeSaveDTO;
import com.mftb.admin.dto.EamParamValueSaveDTO;
import com.mftb.admin.dto.EamSupplierContactSaveDTO;
import com.mftb.admin.dto.EamSupplierContactVO;
import com.mftb.admin.dto.EamSupplierSaveDTO;
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

    /* ==================== 供应商管理 ==================== */

    /** 供应商列表（支持名称/编码/联系人/状态过滤；page+size 同时传入时服务端分页） */
    @GetMapping("/suppliers")
    @RequirePermission(menu = "asset-supplier")
    public Result<List<Map<String, Object>>> listSuppliers(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String contactPerson,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return Result.success(basicDataService.listSuppliers(name, code, contactPerson, status, page, size));
    }

    /** 新增供应商（编码由后端按规则自动生成，前端传码将被忽略） */
    @PostMapping("/suppliers")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Long> createSupplier(@RequestBody EamSupplierSaveDTO dto) {
        return Result.success(basicDataService.createSupplier(dto));
    }

    /** 更新供应商（编码不可修改） */
    @PutMapping("/suppliers/{id}")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Void> updateSupplier(@PathVariable long id, @RequestBody EamSupplierSaveDTO dto) {
        basicDataService.updateSupplier(id, dto);
        return Result.success();
    }

    /** 删除供应商（逻辑删除） */
    @DeleteMapping("/suppliers/{id}")
    @RequirePermission(menu = "asset-supplier", action = "delete")
    public Result<Void> deleteSupplier(@PathVariable long id) {
        basicDataService.deleteSupplier(id);
        return Result.success();
    }

    /** 切换供应商启用/停用状态 */
    @PutMapping("/suppliers/{id}/toggle")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Void> toggleSupplierStatus(@PathVariable long id) {
        basicDataService.toggleSupplierStatus(id);
        return Result.success();
    }

    /* ==================== 供应商联系人 ==================== */

    /** 精简版供应商下拉列表（仅 id/code/name，供前端下拉框使用） */
    @GetMapping("/suppliers/dropdown")
    @RequirePermission(menu = "asset-supplier")
    public Result<List<Map<String, Object>>> suppliersDropdown(
            @RequestParam(required = false) String keyword) {
        return Result.success(basicDataService.listSuppliersDropdown(keyword));
    }

    /** 查询指定供应商的所有启用联系人 */
    @GetMapping("/suppliers/{id}/contacts")
    @RequirePermission(menu = "asset-supplier")
    public Result<List<EamSupplierContactVO>> listSupplierContacts(@PathVariable Long id) {
        return Result.success(basicDataService.listContactsBySupplier(id));
    }

    /** 创建单个联系人 */
    @PostMapping("/supplier-contacts")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Long> createSupplierContact(@RequestBody EamSupplierContactSaveDTO dto) {
        return Result.success(basicDataService.createSupplierContact(dto.getSupplierId(), dto));
    }

    /** 更新单个联系人 */
    @PutMapping("/supplier-contacts/{contactId}")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Void> updateSupplierContact(@PathVariable Long contactId,
                                               @RequestBody EamSupplierContactSaveDTO dto) {
        basicDataService.updateSupplierContact(contactId, dto);
        return Result.success();
    }

    /** 删除单个联系人（逻辑删除） */
    @DeleteMapping("/supplier-contacts/{contactId}")
    @RequirePermission(menu = "asset-supplier", action = "delete")
    public Result<Void> deleteSupplierContact(@PathVariable Long contactId) {
        basicDataService.deleteSupplierContact(contactId);
        return Result.success();
    }

    /** 切换联系人启用/禁用 */
    @PutMapping("/supplier-contacts/{contactId}/toggle")
    @RequirePermission(menu = "asset-supplier", action = "edit")
    public Result<Void> toggleSupplierContact(@PathVariable Long contactId) {
        basicDataService.toggleSupplierContactStatus(contactId);
        return Result.success();
    }

    /* ==================== 资产标签模板 ==================== */

    /** 标签模板列表（支持名称/状态过滤） */
    @GetMapping("/asset-tags")
    @RequirePermission(menu = "asset-tag")
    public Result<List<Map<String, Object>>> listAssetTags(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String status) {
        return Result.success(basicDataService.listAssetTags(name, status));
    }

    /** 新增标签模板 */
    @PostMapping("/asset-tags")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Long> createAssetTag(@RequestBody EamAssetTagSaveDTO dto) {
        return Result.success(basicDataService.createAssetTag(dto));
    }

    /** 更新标签模板 */
    @PutMapping("/asset-tags/{id}")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Void> updateAssetTag(@PathVariable long id, @RequestBody EamAssetTagSaveDTO dto) {
        basicDataService.updateAssetTag(id, dto);
        return Result.success();
    }

    /** 删除标签模板（逻辑删除，同时清理绑定关系） */
    @DeleteMapping("/asset-tags/{id}")
    @RequirePermission(menu = "asset-tag", action = "delete")
    public Result<Void> deleteAssetTag(@PathVariable long id) {
        basicDataService.deleteAssetTag(id);
        return Result.success();
    }

    /** 切换标签模板启用/停用状态 */
    @PutMapping("/asset-tags/{id}/toggle")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Void> toggleAssetTagStatus(@PathVariable long id) {
        basicDataService.toggleAssetTagStatus(id);
        return Result.success();
    }

    /* ==================== 资产-标签绑定 ==================== */

    /** 查询资产已绑标签（主标签排前，含模板完整信息） */
    @GetMapping("/assets/{assetId}/tags")
    @RequirePermission(menu = "asset-tag")
    public Result<List<Map<String, Object>>> listAssetTagBindings(@PathVariable long assetId) {
        return Result.success(basicDataService.listAssetTagBindings(assetId));
    }

    /** 绑定标签到资产 */
    @PostMapping("/assets/{assetId}/tags")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Void> bindAssetTag(@PathVariable long assetId, @RequestBody EamAssetTagBindDTO dto) {
        basicDataService.bindAssetTag(assetId, dto);
        return Result.success();
    }

    /** 解绑标签 */
    @DeleteMapping("/assets/{assetId}/tags/{tagId}")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Void> unbindAssetTag(@PathVariable long assetId, @PathVariable long tagId) {
        basicDataService.unbindAssetTag(assetId, tagId);
        return Result.success();
    }

    /** 设为主标签（原主标签自动降级） */
    @PutMapping("/assets/{assetId}/tags/{tagId}/primary")
    @RequirePermission(menu = "asset-tag", action = "edit")
    public Result<Void> setPrimaryAssetTag(@PathVariable long assetId, @PathVariable long tagId) {
        basicDataService.setPrimaryAssetTag(assetId, tagId);
        return Result.success();
    }

    /** 按模板反查绑定的资产 ID 列表（批量打印「按模板」数据源） */
    @GetMapping("/asset-tags/{tagId}/asset-ids")
    @RequirePermission(menu = "asset-tag")
    public Result<List<Long>> listAssetIdsByTag(@PathVariable long tagId) {
        return Result.success(basicDataService.listAssetIdsByTag(tagId));
    }
}
