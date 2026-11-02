package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingTrafficRequest;
import com.mftb.admin.dto.AdPricingTrafficVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;

/**
 * 投流广告销售定价服务（按业务频道定价：预设档位 + 阶梯单价）
 */
public interface AdPricingTrafficService {

    /** 计价配置分页查询 */
    PageResult<AdPricingTrafficVO> page(long page, long size, Long algoId, String brand, Integer bizChannel, Integer status);

    /** 计价配置详情（含档位 + 阶梯明细） */
    AdPricingTrafficVO detail(Long id);

    /** 按算法+业务频道查询启用中的计价配置（无则返回 null） */
    AdPricingTrafficVO activeByAlgo(Long algoId, Integer bizChannel);

    /** 按算法查询所有业务频道的计价配置（含停用，供购买页过滤展示） */
    List<AdPricingTrafficVO> listByAlgo(Long algoId);

    /** 算法是否存在启用中的投流定价（任一业务频道） */
    boolean hasActivePricing(Long algoId);

    /** 指定算法类型下存在启用中投流定价的业务频道（去重升序；brand 非空时再按品牌过滤） */
    List<Integer> listActiveChannels(Integer algoType, String brand);

    /** 新增计价配置（同一算法同一业务频道仅允许一条配置） */
    AdPricingTrafficVO create(AdPricingTrafficRequest request);

    /** 编辑计价配置（档位/阶梯整体替换） */
    AdPricingTrafficVO update(Long id, AdPricingTrafficRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除计价配置（级联删除档位/阶梯明细） */
    void delete(Long id);
}
