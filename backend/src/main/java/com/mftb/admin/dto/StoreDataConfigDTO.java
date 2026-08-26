package com.mftb.admin.dto;

import lombok.Data;

/**
 * 门店金字招牌数据配置 DTO（GET 响应 / PUT 请求共用）
 */
@Data
public class StoreDataConfigDTO {

    /** 月订单数 */
    private Integer monthlyOrders;

    /** 月复购订单数据 */
    private Integer monthlyRepurchaseOrders;

    /** 月好评订单数据 */
    private Integer monthlyPositiveOrders;

    /** 月访问量 */
    private Integer monthlyVisits;

    /** 门店收藏数 */
    private Integer storeFavorites;

    /** 顾客数 */
    private Integer monthlyCustomers;
}
