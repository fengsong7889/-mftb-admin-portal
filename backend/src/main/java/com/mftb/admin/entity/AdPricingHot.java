package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 人气商家计价主实体（差异层，对应「销售定价」菜单）
 */
@Data
@TableName("biz_ad_pricing_hot")
public class AdPricingHot {

    @TableId
    private Long id;

    /** 关联算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（今天起 N 天可售，超出为待开售），默认 30 */
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 多格梯度折扣（JSON 字符串，按购买格子数匹配，如 [{"minDays":3,"discount":95}]） */
    private String discountTiers;

    /** 取消扣费梯度（JSON 字符串） */
    private String cancelFeeTiers;

    /** 屏蔽商家开关: 1=启用 2=关闭 */
    private Integer blockMerchant;

    /** 屏蔽商家列表（JSON 字符串） */
    private String blockList;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
