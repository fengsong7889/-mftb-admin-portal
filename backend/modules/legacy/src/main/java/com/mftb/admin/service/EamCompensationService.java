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

    /**
     * 直接创建赔付记录（无需归还记录）
     *
     * 适用场景：
     * - 员工离职时资产损坏，资产已不在公司
     * - 第三方损坏资产（如快递损坏）
     * - 历史遗留问题补录赔付
     * - 遗失核销后需要员工赔付
     */
    long createDirect(EamCompensationSaveDTO dto);

    /** 定责 */
    void setLiability(EamCompensationLiabilityDTO dto);

    /** 免赔 */
    void waive(EamCompensationWaiveDTO dto);

    /** 收款/退款 */
    void addPayment(EamCompensationPaymentDTO dto);

    /** 找回复核 */
    void review(EamCompensationReviewDTO dto);

    /**
     * 标记遗失类型赔付记录需要找回复核（由遗失模块在登记找回时调用）。
     * 仅对 damageType=loss 且未结清的记录生效。
     *
     * @param lossId 遗失单 ID
     */
    void markLossRecoveryReview(long lossId);
}
