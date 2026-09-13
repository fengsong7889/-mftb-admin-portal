package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * EAM 基礎數據服務（分類 / 品牌 / 型號 / 位置）
 */
public interface EamBasicDataService {

    /* ==================== 資產分類 ==================== */

    /** 分類列表（平鋪返回，頁面自行構樹） */
    List<Map<String, Object>> listCategories(String keyword, String name, String code,
                                              String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 新增分類 */
    long createCategory(Map<String, Object> data);

    /** 更新分類 */
    void updateCategory(long id, Map<String, Object> data);

    /** 刪除分類 */
    void deleteCategory(long id);

    /** 切換分類狀態 */
    void toggleCategoryStatus(long id);

    /* ==================== 品牌庫 ==================== */

    /** 品牌列表 */
    List<Map<String, Object>> listBrands(String categoryCode, String brandZh,
                                          String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 新增品牌 */
    long createBrand(Map<String, Object> data);

    /** 更新品牌 */
    void updateBrand(long id, Map<String, Object> data);

    /** 刪除品牌 */
    void deleteBrand(long id);

    /* ==================== 產品型號庫 ==================== */

    /** 型號分頁列表 */
    PageResult<Map<String, Object>> pageModels(int page, int size, String categoryCode, Long brandId,
                                                String brandZh, String name,
                                                String updatedBy, String updatedAtStart, String updatedAtEnd);

    /** 型號詳情 */
    Map<String, Object> getModelDetail(long id);

    /** 新增型號 */
    long createModel(Map<String, Object> data);

    /** 更新型號 */
    void updateModel(long id, Map<String, Object> data);

    /** 刪除型號 */
    void deleteModel(long id);

    /* ==================== 倉庫 / 存放位置 ==================== */

    /** 位置列表（平鋪返回，頁面自行構樹） */
    List<Map<String, Object>> listLocations(String keyword, String name, String code, String type, String updatedBy);

    /** 新增位置 */
    long createLocation(Map<String, Object> data);

    /** 更新位置 */
    void updateLocation(long id, Map<String, Object> data);

    /** 刪除位置 */
    void deleteLocation(long id);

    /* ==================== 參數庫 ==================== */

    /** 參數類型分頁列表 */
    PageResult<Map<String, Object>> pageParamTypes(int page, int size, String categoryCode, String name, String code, String status);

    /** 新增參數類型 */
    long createParamType(Map<String, Object> data);

    /** 更新參數類型 */
    void updateParamType(long id, Map<String, Object> data);

    /** 刪除參數類型 */
    void deleteParamType(long id);

    /** 根據參數類型編碼查詢參數值列表 */
    List<Map<String, Object>> listParamValuesByType(String paramTypeCode);

    /** 查詢所有參數值（分頁） */
    PageResult<Map<String, Object>> pageParamValues(int page, int size, String paramTypeCode, String categoryCode);

    /** 新增參數值 */
    long createParamValue(Map<String, Object> data);

    /** 更新參數值 */
    void updateParamValue(long id, Map<String, Object> data);

    /** 刪除參數值 */
    void deleteParamValue(long id);
}
