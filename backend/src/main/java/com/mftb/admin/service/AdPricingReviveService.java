package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingReviveRequest;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.PageResult;

/**
 * 盘活复苏销售定价服务
 */
public interface AdPricingReviveService {

    /** 计价配置分页查询 */
    PageResult<AdPricingReviveVO> page(long page, long size, Long algoId, String brand, Integer status);

    /** 计价配置详情 */
    AdPricingReviveVO detail(Long id);

    /** 按算法查询启用中的计价配置（无配置返回 null） */
    AdPricingReviveVO activeByAlgo(Long algoId);

    /** 新增计价配置 */
    AdPricingReviveVO create(AdPricingReviveRequest request);

    /** 编辑计价配置 */
    AdPricingReviveVO update(Long id, AdPricingReviveRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置 */
    void delete(Long id);
}
