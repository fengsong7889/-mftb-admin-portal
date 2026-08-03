package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingStarRequest;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;

/**
 * 无敌星星销售定价服务
 */
public interface AdPricingStarService {

    /** 计价配置分页查询 */
    PageResult<AdPricingStarVO> page(long page, long size, Long algoId, String brand, Integer status);

    /** 计价配置详情（含分商圈日单价） */
    AdPricingStarVO detail(Long id);

    /** 按算法查询启用中的计价配置，无配置返回 null */
    AdPricingStarVO activeByAlgo(Long algoId);

    /** 新增计价配置 */
    AdPricingStarVO create(AdPricingStarRequest request);

    /** 编辑计价配置（商圈日单价整体替换） */
    AdPricingStarVO update(Long id, AdPricingStarRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除（逻辑删除） */
    void delete(Long id);
}
