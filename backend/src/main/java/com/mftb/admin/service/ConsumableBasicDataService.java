package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材基础数据服务接口（分类 / 品牌）
 * <p>
 * 计量单位不再是独立字典（旧 biz_consumable_unit 已废弃），单位作为产品/耗材记录上的文本属性直存。
 * <p>
 * 本服务只保留「下拉数据源」读取能力：耗材分类/品牌的维护入口已统一到资产域
 * 「分類庫」({@code asset-category}) 与「品牌產品庫」({@code asset-model})，
 * 那两个页面经 {@code EamBasicDataService} 按 {@code bizType=CONSUMABLE} 读写同一张表。
 * 此处再开一套写接口只会形成双入口，让引用校验、编码唯一等约束在两条链路上漂移。
 */
public interface ConsumableBasicDataService {

    /* ===== 分类（与资产分类共用统一表 biz_eam_category，用 biz_type 区分） ===== */
    /** 分类列表，keyword 匹配编码或名称 */
    List<ConsumableCategoryVO> listCategories(String keyword);

    /* ===== 品牌（与品牌产品库共用统一表 biz_eam_brand） ===== */
    /**
     * 品牌列表。
     * @param categoryType 传 ASSET/CONSUMABLE/BOTH 按该值精确过滤；<b>传 null 并非全部</b>，
     *                     而是默认退为 CONSUMABLE，故需要全量时必须自己合并多次调用
     */
    List<ConsumableBrandVO> listBrands(String categoryType, String keyword);
}
