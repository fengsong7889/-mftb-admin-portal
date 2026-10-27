package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingSignboardRequest;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.dto.PageResult;

/**
 * 金字招牌计价服务
 */
public interface AdPricingSignboardService {

    /** 计价配置分页查询 */
    PageResult<AdPricingSignboardVO> page(long page, long size, Long algoId, String brand, Integer status);

    /** 计价配置详情 */
    AdPricingSignboardVO detail(Long id);

    /** 按算法查询启用中的计价配置 */
    AdPricingSignboardVO activeByAlgo(Long algoId);

    /** 新增计价配置 */
    AdPricingSignboardVO create(AdPricingSignboardRequest request);

    /** 编辑计价配置 */
    AdPricingSignboardVO update(Long id, AdPricingSignboardRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置（含标签明细） */
    void delete(Long id);
}
