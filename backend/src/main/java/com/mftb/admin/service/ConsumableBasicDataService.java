package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材基础数据服务接口（分类 / 品牌 / 计量单位）
 * <p>
 * 与资产域基础数据（biz_eam_category / biz_eam_brand）物理隔离，
 * 耗材档案从本服务获取分类、品牌、单位下拉数据源。
 */
public interface ConsumableBasicDataService {

    /* ===== 分类 ===== */
    List<ConsumableCategoryVO> listCategories(String keyword);
    long createCategory(ConsumableCategorySaveDTO dto);
    void updateCategory(long id, ConsumableCategorySaveDTO dto);
    void deleteCategory(long id);
    void toggleCategoryStatus(long id);

    /* ===== 品牌 ===== */
    /**
     * 品牌列表
     * @param categoryType 过滤 ASSET/CONSUMABLE/BOTH，null 表示全部
     */
    List<ConsumableBrandVO> listBrands(String categoryType, String keyword);
    long createBrand(ConsumableBrandSaveDTO dto);
    void updateBrand(long id, ConsumableBrandSaveDTO dto);
    void deleteBrand(long id);
    void toggleBrandStatus(long id);
    ConsumableBrandVO getBrandDetail(long id);

    /* ===== 计量单位 ===== */
    List<ConsumableUnitVO> listUnits(String keyword);
    long createUnit(ConsumableUnitSaveDTO dto);
    void updateUnit(long id, ConsumableUnitSaveDTO dto);
    void deleteUnit(long id);
    void toggleUnitStatus(long id);
}
