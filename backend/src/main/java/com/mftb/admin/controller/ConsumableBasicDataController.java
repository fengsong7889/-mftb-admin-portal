package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.ConsumableBasicDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 耗材基础数据下拉接口（分类 / 品牌）
 * <p>
 * 计量单位不再是独立字典（旧 biz_consumable_unit 已废弃），单位由表单作为文本属性直存。
 * <p>
 * 本类只保留耗材档案/预警页要用的两个下拉数据源，不提供分类与品牌的增删改：
 * 「耗材分类管理」「耗材品牌管理」两个菜单已下线，维护入口统一到资产域
 * {@link EamBasicDataController} 的「分類庫」({@code asset-category}) 与
 * 「品牌產品庫」({@code asset-model})，那两个页面按 {@code bizType=CONSUMABLE}
 * 读写同一张统一表（biz_eam_category / biz_eam_brand）。
 * <p>
 * 历史上本类曾另开一套写接口，与资产侧构成同表双入口：两侧的存在性校验、编码唯一、
 * 子分类与引用检查各自独立且并不等价（例如耗材侧 {@code deleteBrand} 从未校验品牌
 * 是否仍被耗材档案引用），双入口会让约束在链路间漂移，故一并收敛掉。
 */
@RestController
@RequestMapping("/api/eam/consumables/basic")
@RequiredArgsConstructor
public class ConsumableBasicDataController {

    private final ConsumableBasicDataService basicDataService;

    /** 分类下拉选项（耗材档案表单用，登录即可） */
    @GetMapping("/categories/options")
    public Result<List<ConsumableCategoryVO>> categoryOptions() {
        return Result.success(basicDataService.listCategories(null));
    }

    /** 品牌下拉选项（耗材档案表单用，默认只返回 CONSUMABLE + BOTH） */
    @GetMapping("/brands/options")
    public Result<List<ConsumableBrandVO>> brandOptions() {
        // 耗材档案下拉：合并 CONSUMABLE 和 BOTH（排除纯 ASSET 品牌）
        List<ConsumableBrandVO> consumable = basicDataService.listBrands("CONSUMABLE", null);
        List<ConsumableBrandVO> both = basicDataService.listBrands("BOTH", null);
        consumable.addAll(both);
        consumable.sort((a, b) -> a.getName().compareTo(b.getName()));
        return Result.success(consumable);
    }
}
