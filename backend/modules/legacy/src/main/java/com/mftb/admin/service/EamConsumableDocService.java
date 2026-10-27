package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 耗材单据服务接口（退料 / 库存调整 / 仓库调拨 / 入库单 CRUD）
 */
public interface EamConsumableDocService {

    /* ===== 退料 ===== */

    /** 退料单分页 */
    PageResult<EamConsumableReturnVO> pageReturns(EamConsumableReturnQuery query);

    /** 登记退料，返回退料单 id；品牌与购买公司必填、退料数量必须 > 0 */
    long createReturn(EamConsumableReturnSaveDTO dto);

    /* ===== 库存调整（盘盈/盘亏） ===== */

    /** 调整单分页 */
    PageResult<EamConsumableAdjustVO> pageAdjusts(EamConsumableAdjustQuery query);

    /** 登记库存调整，返回调整单 id；direction=in 为盘盈、out 为盘亏，数量必须 > 0 */
    long createAdjust(EamConsumableAdjustSaveDTO dto);

    /* ===== 仓库调拨 ===== */

    /** 调拨单分页（同一耗材同一公司下的跨仓转移） */
    PageResult<EamConsumableTransferVO> pageTransfers(EamConsumableTransferQuery query);

    /** 登记仓库调拨，返回调拨单 id */
    long createTransfer(EamConsumableTransferSaveDTO dto);

    /* ===== 入库单 CRUD ===== */

    /** 入库单分页（采购/期初/手工入库的统一入口） */
    PageResult<EamConsumableInboundVO> pageInbounds(EamConsumableInboundQuery query);

    /** 入库单详情（含入库明细行） */
    EamConsumableInboundVO inboundDetail(long id);

    /** 登记入库单（写单据并联动增加库存），返回入库单 id */
    long createInbound(EamConsumableInboundSaveDTO dto);
}
