package com.mftb.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 门店金字招牌数据配置 DTO（GET 响应 / PUT 请求共用）
 */
@Data
public class StoreDataConfigDTO {

    /** 月订单数 */
    @NotNull(message = "月訂單數不能為空")
    @Min(value = 0, message = "月訂單數不能為負數")
    private Integer monthlyOrders;

    /** 月复购订单数据 */
    @NotNull(message = "月復購訂單數據不能為空")
    @Min(value = 0, message = "月復購訂單數據不能為負數")
    private Integer monthlyRepurchaseOrders;

    /** 月好评订单数据 */
    @NotNull(message = "月好評訂單數據不能為空")
    @Min(value = 0, message = "月好評訂單數據不能為負數")
    private Integer monthlyPositiveOrders;

    /** 月访问量 */
    @NotNull(message = "月訪問量不能為空")
    @Min(value = 0, message = "月訪問量不能為負數")
    private Integer monthlyVisits;

    /** 门店收藏数 */
    @NotNull(message = "門店收藏數不能為空")
    @Min(value = 0, message = "門店收藏數不能為負數")
    private Integer storeFavorites;

    /** 顾客数 */
    @NotNull(message = "顧客數不能為空")
    @Min(value = 0, message = "顧客數不能為負數")
    private Integer monthlyCustomers;
}
