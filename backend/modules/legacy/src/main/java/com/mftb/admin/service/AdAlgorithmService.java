package com.mftb.admin.service;

import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.dto.AdAlgorithmVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * 推广算法库服务
 */
public interface AdAlgorithmService {

    /**
     * 算法分页查询（storeCode 非空时过滤掉对该门店屏蔽的算法，供销售菜单下拉使用；hasPricing=true 时仅返回有启用定价的算法）
     *
     * @param channel       算法库自身的業務頻道字段（算法库列表页筛选）
     * @param pricingChannel 定價配置维度的業務頻道：舆 hasPricing 配合使用，
     *                       仅返回在该頻道下有启用中定价配置的算法（購買页「品牌→頻道→算法」级联）
     */
    PageResult<AdAlgorithmVO> page(long page, long size, Integer algoType, String brand,
                                   Integer channel, Integer status, String keyword, String storeCode,
                                   Boolean hasPricing, Integer pricingChannel);

    /**
     * 某算法类型下「存在启用中定價配置」的業務頻道集合，供購買页频道下拉使用。
     * <p>真值来自各定價表（而非算法自身的頻道字段，存量算法该字段大量为空）。
     */
    List<Integer> listActiveChannels(Integer algoType, String brand);

    /** 算法详情 */
    AdAlgorithmVO detail(Long id);

    /** 按算法ID（algoCode）精确查询算法，不存在时抛业务异常 */
    AdAlgorithmVO getByCode(String algoCode);

    /** 新增算法（自动生成算法ID） */
    AdAlgorithmVO create(AdAlgorithmRequest request);

    /** 编辑算法 */
    AdAlgorithmVO update(Long id, AdAlgorithmRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除（逻辑删除） */
    void delete(Long id);

    /** 查询引用该算法的瀑布流配置列表 */
    List<Map<String, Object>> findWaterfallReferences(Long algoId);
}
