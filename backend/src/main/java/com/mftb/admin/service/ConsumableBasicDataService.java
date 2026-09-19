package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材基础数据服务接口（分类 / 品牌）
 * <p>
 * 计量单位不再是独立字典（旧 biz_consumable_unit 已废弃），单位作为产品/耗材记录上的文本属性直存。
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
}
