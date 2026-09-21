package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 赔付管理服务接口
 */
public interface EamCompensationService {

    /** 分页查询 */
    PageResult<EamCompensationVO> page(EamCompensationQuery query);

    /** 详情 */
    EamCompensationVO detail(long id);

    /** 创建赔付记录（从归还异常触发） */
    long create(EamReturnDTO returnDto, long returnId);

    /** 从处置流程自动创建赔付记录（仅需归还 ID） */
    long createFromDispose(long returnId);

    /** 定责 */
    void setLiability(EamCompensationLiabilityDTO dto);

    /** 免赔 */
    void waive(EamCompensationWaiveDTO dto);

    /** 收款/退款 */
    void addPayment(EamCompensationPaymentDTO dto);

    /** 找回复核 */
    void review(EamCompensationReviewDTO dto);
}
