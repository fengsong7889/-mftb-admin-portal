package com.mftb.admin.service;

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

import java.util.List;
import java.util.Map;

/**
 * EAM 基础数据服务（分类 / 资产品牌 / 型号 / 位置）
 */
public interface EamBasicDataService {

    /* ==================== 资产分类 ==================== */

    /** 分类列表（平铺返回，页面自行构树） */
    List<Map<String, Object>> listCategories(String keyword, String name, String code,
                                              String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 新增分类 */
    long createCategory(EamCategorySaveDTO dto);

    /** 更新分类 */
    void updateCategory(long id, EamCategorySaveDTO dto);

    /** 删除分类 */
    void deleteCategory(long id);

    /** 切换分类状态 */
    void toggleCategoryStatus(long id);

    /* ==================== 资产品牌库 ==================== */

    /** 资产品牌列表 */
    List<Map<String, Object>> listBrands(String categoryCode, String brandZh,
                                          String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 新增资产品牌 */
    long createBrand(EamBrandSaveDTO dto);

    /** 更新资产品牌 */
    void updateBrand(long id, EamBrandSaveDTO dto);

    /** 删除资产品牌 */
    void deleteBrand(long id);

    /* ==================== 产品型号库 ==================== */

    /** 型号分页列表 */
    PageResult<Map<String, Object>> pageModels(int page, int size, String categoryCode, Long brandId,
                                                String brandZh, String name,
                                                String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 型号详情 */
    Map<String, Object> getModelDetail(long id);

    /** 新增型号 */
    long createModel(EamModelSaveDTO dto);

    /** 更新型号 */
    void updateModel(long id, EamModelSaveDTO dto);

    /** 删除型号 */
    void deleteModel(long id);

    /* ==================== 仓库 / 存放位置 ==================== */

    /** 位置列表（平铺返回，页面自行构树） */
    List<Map<String, Object>> listLocations(String keyword, String name, String code, String province, String city, String district, String updatedBy);

    /** 新增位置 */
    long createLocation(EamLocationSaveDTO dto);

    /** 更新位置 */
    void updateLocation(long id, EamLocationSaveDTO dto);

    /** 删除位置 */
    void deleteLocation(long id);

    /* ==================== 参数库 ==================== */

    /** 参数类型分页列表 */
    PageResult<Map<String, Object>> pageParamTypes(int page, int size, String categoryCode, String name, String code, String status);

    /** 新增参数类型 */
    long createParamType(EamParamTypeSaveDTO dto);

    /** 更新参数类型 */
    void updateParamType(long id, EamParamTypeSaveDTO dto);

    /** 删除参数类型 */
    void deleteParamType(long id);

    /** 根据参数类型编码查询参数值列表 */
    List<Map<String, Object>> listParamValuesByType(String paramTypeCode);

    /** 查询所有参数值（分页） */
    PageResult<Map<String, Object>> pageParamValues(int page, int size, String paramTypeCode, String categoryCode);

    /** 新增参数值 */
    long createParamValue(EamParamValueSaveDTO dto);

    /** 更新参数值 */
    void updateParamValue(long id, EamParamValueSaveDTO dto);

    /** 删除参数值 */
    void deleteParamValue(long id);

    /* ==================== 分类配件配置 ==================== */

    /**
     * 分类配件列表（同分类下所有产品共用）。
     *
     * @param categoryCode 分类编码，空则返回全部分类
     * @param onlyEnabled  true 时仅返回启用状态的配件（验收弹窗选项用）
     */
    List<Map<String, Object>> listCategoryAccessories(String categoryCode, boolean onlyEnabled);

    /** 新增分类配件，返回新记录 ID */
    Long createCategoryAccessory(String categoryCode, EamCategoryAccessorySaveDTO dto);

    /** 修改分类配件（名称/默认数量） */
    void updateCategoryAccessory(long id, EamCategoryAccessorySaveDTO dto);

    /** 启用/停用分类配件（status: 1=启用, 0=停用） */
    void updateCategoryAccessoryStatus(long id, Integer status);

    /** 删除分类配件（逻辑删除） */
    void deleteCategoryAccessory(long id);

    /* ==================== 供应商管理 ==================== */

    /**
     * 供应商列表（支持名称/编码/联系人/状态过滤）。
     * page+size 同时传入时服务端分页，否则全量返回（列表页前端过滤使用）。
     */
    List<Map<String, Object>> listSuppliers(String name, String code, String contactPerson,
                                             String status, Integer page, Integer size);

    /** 新增供应商，编码由后端按规则自动生成（CGSJ + 6位全局自增），返回新记录 ID */
    long createSupplier(EamSupplierSaveDTO dto);

    /** 更新供应商（编码不可修改） */
    void updateSupplier(long id, EamSupplierSaveDTO dto);

    /** 删除供应商（逻辑删除） */
    void deleteSupplier(long id);

    /** 切换供应商启用/停用状态 */
    void toggleSupplierStatus(long id);

    /* ==================== 供应商联系人 ==================== */

    /** 按供应商 ID 查询所有启用状态的联系人 */
    List<EamSupplierContactVO> listContactsBySupplier(Long supplierId);

    /** 创建单个联系人，返回新记录 ID */
    Long createSupplierContact(Long supplierId, EamSupplierContactSaveDTO dto);

    /** 先删除该供应商旧联系人记录，再批量插入新记录（事务保护） */
    void saveSupplierContacts(Long supplierId, List<EamSupplierContactSaveDTO> contacts);

    /** 更新单个联系人 */
    void updateSupplierContact(Long contactId, EamSupplierContactSaveDTO dto);

    /** 逻辑删除单个联系人 */
    void deleteSupplierContact(Long contactId);

    /** 切换联系人启用/禁用 */
    void toggleSupplierContactStatus(Long contactId);

    /** 精简版供应商下拉列表（仅 id/code/name，支持关键字过滤） */
    List<Map<String, Object>> listSuppliersDropdown(String keyword);
}
