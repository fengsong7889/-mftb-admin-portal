package com.mftb.admin.service;

import com.mftb.admin.dto.EamBrandSaveDTO;
import com.mftb.admin.dto.EamCategorySaveDTO;
import com.mftb.admin.dto.EamLocationSaveDTO;
import com.mftb.admin.dto.EamModelSaveDTO;
import com.mftb.admin.dto.EamParamTypeSaveDTO;
import com.mftb.admin.dto.EamParamValueSaveDTO;
import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * EAM 基础数据服务（分类 / 品牌 / 型号 / 位置）
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

    /* ==================== 品牌库 ==================== */

    /** 品牌列表 */
    List<Map<String, Object>> listBrands(String categoryCode, String brandZh,
                                          String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 新增品牌 */
    long createBrand(EamBrandSaveDTO dto);

    /** 更新品牌 */
    void updateBrand(long id, EamBrandSaveDTO dto);

    /** 删除品牌 */
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
    List<Map<String, Object>> listLocations(String keyword, String name, String code, String type, String updatedBy);

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
}
