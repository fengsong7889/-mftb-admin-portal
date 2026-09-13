package com.mftb.admin.service;

import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * EAM 验收入库服务
 */
public interface EamInboundService {

    /**
     * 分页查询入库批次
     */
    PageResult<Map<String, Object>> pageBatches(int page, int size);

    /**
     * 入库批次详情
     */
    Map<String, Object> getBatchDetail(long batchId);

    /**
     * 创建入库批次：
     * 1. 生成资产编号
     * 2. 写入资产台账
     * 3. 回写采购订单 status / acceptedQty / receivedQty
     */
    Map<String, Object> createBatch(EamInboundCreateDTO dto);
}
