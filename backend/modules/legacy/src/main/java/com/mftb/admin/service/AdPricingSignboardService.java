package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingSignboardRequest;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;

/**
 * 金字招牌计价服务
 */
public interface AdPricingSignboardService {

    /** 计价配置分页查询 */
    PageResult<AdPricingSignboardVO> page(long page, long size, Long algoId, String brand, Integer status);

    /** 计价配置详情 */
    AdPricingSignboardVO detail(Long id);

    /**
     * 按定價配置主键查详情，不存在返回 null（不抛异常）。
     * <p>金字招牌订单的 biz_ad_order.algo_id 存的是定價配置ID（与人气商家/投流广告同口径），
     * 退款/展示回查定價必须走本方法，不能拿它当算法ID去查 algo_id 维度。
     */
    AdPricingSignboardVO detailOrNull(Long id);

    /** 按算法查询启用中的计价配置 */
    AdPricingSignboardVO activeByAlgo(Long algoId);

    /** 按「算法 + 業務頻道」查询启用中的计价配置（購買页取价唯一入口） */
    AdPricingSignboardVO activeByAlgoAndChannel(Long algoId, Integer channel);

    /** 指定算法类型下存在启用中定价配置的業務頻道（去重升序；brand 非空时再按品牌过滤） */
    List<Integer> listActiveChannels(Integer algoType, String brand);

    /** 新增计价配置 */
    AdPricingSignboardVO create(AdPricingSignboardRequest request);

    /** 编辑计价配置 */
    AdPricingSignboardVO update(Long id, AdPricingSignboardRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置（含标签明细） */
    void delete(Long id);
}
