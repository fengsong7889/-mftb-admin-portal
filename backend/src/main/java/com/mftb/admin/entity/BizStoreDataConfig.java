package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 门店金字招牌数据配置实体
 */
@Data
@TableName("biz_store_data_config")
public class BizStoreDataConfig {

    @TableId
    private Long id;

    /** 门店主键 (关联 biz_store.id) */
    private Long storeId;

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

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
