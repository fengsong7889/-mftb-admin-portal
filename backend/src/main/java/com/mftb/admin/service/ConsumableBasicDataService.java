package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材基础数据服务接口（分类 / 品牌）
 * <p>
 * 计量单位不再是独立字典（旧 biz_consumable_unit 已废弃），单位作为产品/耗材记录上的文本属性直存。
 */
public interface ConsumableBasicDataService {

    /* ===== 分类（与资产分类共用统一表 biz_eam_category，用 biz_type 区分） ===== */
    /** 分类列表，keyword 匹配编码或名称 */
    List<ConsumableCategoryVO> listCategories(String keyword);

    /** 新建耗材分类：编码与名称必填，编码在统一表内全局唯一（不只耗材域），biz_type 固定写 CONSUMABLE */
    long createCategory(ConsumableCategorySaveDTO dto);

    /** 编辑耗材分类 */
    void updateCategory(long id, ConsumableCategorySaveDTO dto);

    /** 删除分类；存在子分类时拒绝，避免把树挖空 */
    void deleteCategory(long id);

    /** 在 enabled/disabled 之间取反分类状态 */
    void toggleCategoryStatus(long id);

    /* ===== 品牌（与品牌产品库共用统一表 biz_eam_brand） ===== */
    /**
     * 品牌列表。
     * @param categoryType 传 ASSET/CONSUMABLE/BOTH 按该值精确过滤；<b>传 null 并非全部</b>，
     *                     而是默认退为 CONSUMABLE，故需要全量时必须自己合并多次调用
     */
    List<ConsumableBrandVO> listBrands(String categoryType, String keyword);

    /** 新建品牌 */
    long createBrand(ConsumableBrandSaveDTO dto);

    /** 编辑品牌 */
    void updateBrand(long id, ConsumableBrandSaveDTO dto);

    /** 删除品牌；目前只校验品牌存在，未校验是否仍被耗材档案引用 */
    void deleteBrand(long id);

    /** 在 enabled/disabled 之间取反品牌状态 */
    void toggleBrandStatus(long id);

    /** 品牌详情 */
    ConsumableBrandVO getBrandDetail(long id);
}
