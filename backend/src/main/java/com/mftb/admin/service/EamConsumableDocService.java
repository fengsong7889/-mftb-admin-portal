package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 耗材单据服务接口（退料 / 库存调整 / 仓库调拨 / 入库单 CRUD）
 */
public interface EamConsumableDocService {

    /* ===== 退料 ===== */
    PageResult<EamConsumableReturnVO> pageReturns(EamConsumableReturnQuery query);
    long createReturn(EamConsumableReturnSaveDTO dto);

    /* ===== 库存调整（盘盈/盘亏） ===== */
    PageResult<EamConsumableAdjustVO> pageAdjusts(EamConsumableAdjustQuery query);
    long createAdjust(EamConsumableAdjustSaveDTO dto);

    /* ===== 仓库调拨 ===== */
    PageResult<EamConsumableTransferVO> pageTransfers(EamConsumableTransferQuery query);
    long createTransfer(EamConsumableTransferSaveDTO dto);

    /* ===== 入库单 CRUD ===== */
    PageResult<EamConsumableInboundVO> pageInbounds(EamConsumableInboundQuery query);
    EamConsumableInboundVO inboundDetail(long id);
    long createInbound(EamConsumableInboundSaveDTO dto);
}
