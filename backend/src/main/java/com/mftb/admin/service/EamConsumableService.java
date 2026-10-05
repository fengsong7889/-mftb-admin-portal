package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;

/**
 * 耗材管理服务接口（主数据 / 库存 / 流水 / 入库 / 预警 / 看板）
 */
public interface EamConsumableService {

    /* ===== 主数据 ===== */

    /** 耗材档案分页（支持分类/品牌/状态/关键字筛选） */
    PageResult<EamConsumableItemVO> pageItems(EamConsumableItemQuery query);

    /** 耗材档案详情；返回体包含各仓库存汇总 */
    EamConsumableItemVO itemDetail(long id);

    /** 新增耗材档案，返回新建档案 id */
    long createItem(EamConsumableItemSaveDTO dto);

    /** 编辑耗材档案；不限制是否已被单据引用（与 deleteItem 不同） */
    void updateItem(long id, EamConsumableItemSaveDTO dto);

    /** 删除耗材档案；只要任一仓库仍有剩余库存就会被拦截，必须先清库存 */
    void deleteItem(long id);

    /**
     * 启用/停用耗材档案。
     * <p>
     * status 必须是 enabled 或 disabled，其他值直接报「非法狀態」——本方法不是状态取反。
     */
    void toggleItemStatus(long id, String status);

    /** 下拉选项（领用/入库选品用，仅 enabled） */
    List<EamConsumableItemVO> itemOptions();

    /* ===== 库存 ===== */

    /** 库存列表（按耗材/仓库筛选，非分页） */
    List<EamConsumableStockVO> stockList(EamConsumableStockQuery query);

    /** 入库（手工/期初；采购验收分流亦复用） */
    void inbound(EamConsumableInboundDTO dto);

    /* ===== 流水 ===== */

    /** 最近流水（看板/弹窗用），limit 控制条数 */
    List<EamConsumableTxnVO> txns(Long itemId, Long locationId, Integer limit);
    /** 流水分页查询（独立菜单页用） */
    PageResult<EamConsumableTxnVO> pageTxns(EamConsumableTxnQuery query);
    /** 流水统计聚合（独立菜单页指标卡用，与分页查询同过滤条件） */
    EamConsumableTxnStatsVO txnStats(EamConsumableTxnQuery query);

    /* ===== 预警 ===== */

    /**
     * 预警耗材清单：先查全部 enabled 档案，再按 VO 的 alert 标志在内存过滤。
     * 不是 SQL 层比较安全库存，改阈值口径要同时看 toItemVO 里的 alert 计算。
     */
    List<EamConsumableItemVO> alerts(String itemCode, String name, Long categoryId);

    /* ===== 看板 ===== */

    /**
     * 耗材看板聚合数据（档案数/库存量/库存金额/本月出入库）。
     * <p>
     * 库存金额取移动加权平均的 total_cost，<b>不取档案参考单价</b>（早期口径会估算失真）。
     */
    EamConsumableDashboardVO dashboard();
}
