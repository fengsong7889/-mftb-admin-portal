package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材管理服务接口（主数据 / 库存 / 流水 / 入库 / 预警 / 看板）
 */
public interface EamConsumableService {

    /* ===== 主数据 ===== */
    PageResult<EamConsumableItemVO> pageItems(EamConsumableItemQuery query);
    EamConsumableItemVO itemDetail(long id);
    long createItem(EamConsumableItemSaveDTO dto);
    void updateItem(long id, EamConsumableItemSaveDTO dto);
    void deleteItem(long id);
    void toggleItemStatus(long id, String status);
    /** 下拉选项（领用/入库选品用，仅 enabled） */
    List<EamConsumableItemVO> itemOptions();

    /* ===== 库存 ===== */
    List<EamConsumableStockVO> stockList(Long itemId, Long locationId);
    /** 入库（手工/期初；采购验收分流亦复用） */
    void inbound(EamConsumableInboundDTO dto);

    /* ===== 流水 ===== */
    List<EamConsumableTxnVO> txns(Long itemId, Long locationId, Integer limit);

    /* ===== 预警 ===== */
    List<EamConsumableItemVO> alerts();

    /* ===== 看板 ===== */
    EamConsumableDashboardVO dashboard();
}
