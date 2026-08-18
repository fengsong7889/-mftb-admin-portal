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

    /** 算法分页查询（storeCode 非空时过滤掉对该门店屏蔽的算法，供销售菜单下拉使用；hasPricing=true 时仅返回有启用定价的算法） */
    PageResult<AdAlgorithmVO> page(long page, long size, Integer algoType, String brand,
                                   Integer channel, Integer status, String keyword, String storeCode, Boolean hasPricing);

    /** 算法详情 */
    AdAlgorithmVO detail(Long id);

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
