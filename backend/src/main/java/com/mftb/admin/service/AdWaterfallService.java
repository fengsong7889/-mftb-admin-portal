package com.mftb.admin.service;

import com.mftb.admin.dto.AdWaterfallRequest;
import com.mftb.admin.dto.AdWaterfallVO;
import com.mftb.admin.dto.PageResult;

/**
 * 瀑布流策略服务
 */
public interface AdWaterfallService {

    /** 分页查询（algoId 非空时过滤包含该算法的策略） */
    PageResult<AdWaterfallVO> page(long page, long size, Long id, String strategyName,
                                   String brand, Integer status, Long algoId);

    /** 策略详情（含坑位明细 + 自然流量兜底算法），APP 按配置ID引用 */
    AdWaterfallVO detail(Long id);

    /** 新增策略 */
    AdWaterfallVO create(AdWaterfallRequest request);

    /** 编辑策略（坑位明细整体替换） */
    AdWaterfallVO update(Long id, AdWaterfallRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除策略（含坑位明细） */
    void delete(Long id);
}
