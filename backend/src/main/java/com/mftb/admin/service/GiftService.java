package com.mftb.admin.service;

import com.mftb.admin.dto.GiftConsumeVO;
import com.mftb.admin.dto.GiftDeductRequest;
import com.mftb.admin.dto.GiftRecordRequest;
import com.mftb.admin.dto.GiftRecordVO;
import com.mftb.admin.dto.PageResult;

/**
 * 赠送管理服务
 */
public interface GiftService {

    /** 分页查询赠送记录（推广赠送列表） */
    PageResult<GiftRecordVO> listRecords(long page, long size, Long groupId, Long storeId, String brand, String adType);

    /** 新增赠送申请 */
    GiftRecordVO createRecord(GiftRecordRequest request);

    /** 查询赠送明细详情（按集团+门店+广告类型聚合） */
    GiftRecordVO getRecordDetail(Long id);

    /** 扣除赠送天数 */
    void deductDays(Long id, GiftDeductRequest request);

    /** 分页查询消费流水 */
    PageResult<GiftConsumeVO> listConsume(long page, long size, Long groupId, Long storeId, String brand,
                                          String adType, String tradeType, String giftId, String orderNo,
                                          String algorithmId, String startDate, String endDate);

    /** 门店在指定广告类型下的可用赠送天数合计（可用、未过期、有余额） */
    int availableDays(Long storeId, String adType);

    /**
     * 广告下单扣减赠送天数: 按到期时间 FIFO 扣减可用记录并写消费流水（tradeType=ad_purchase）
     * 余额不足时抛业务异常
     */
    void deductForOrder(Long storeId, String adType, int days, String orderNo,
                        String algorithmId, String algorithmName);
}
