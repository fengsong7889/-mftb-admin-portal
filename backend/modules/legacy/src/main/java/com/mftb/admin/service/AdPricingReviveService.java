package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingReviveRequest;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;

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

    /** 按「算法 + 業務頻道」查询启用中的计价配置（購買页取价唯一入口） */
    AdPricingReviveVO activeByAlgoAndChannel(Long algoId, Integer channel);

    /** 指定算法类型下存在启用中定价配置的業務頻道（去重升序；brand 非空时再按品牌过滤） */
    List<Integer> listActiveChannels(Integer algoType, String brand);

    /** 新增计价配置 */
    AdPricingReviveVO create(AdPricingReviveRequest request);

    /** 编辑计价配置 */
    AdPricingReviveVO update(Long id, AdPricingReviveRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置 */
    void delete(Long id);
}
