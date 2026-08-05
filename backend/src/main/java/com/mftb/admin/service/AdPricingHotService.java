package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingHotRequest;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.PageResult;

/**
 * 人气商家销售定价服务
 */
public interface AdPricingHotService {

    /** 计价配置分页查询 */
    PageResult<AdPricingHotVO> page(long page, long size, Long algoId, String brand, Integer status);

    /** 计价配置详情 */
    AdPricingHotVO detail(Long id);

    /** 按算法查询启用中的计价配置 */
    AdPricingHotVO activeByAlgo(Long algoId);

    /** 新增计价配置 */
    AdPricingHotVO create(AdPricingHotRequest request);

    /** 编辑计价配置 */
    AdPricingHotVO update(Long id, AdPricingHotRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置（含皮肤明细） */
    void delete(Long id);
}
