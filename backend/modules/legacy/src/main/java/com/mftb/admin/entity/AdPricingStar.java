package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 无敌星星计价主实体（差异层，对应「销售定价」菜单）
 */
@Data
@TableName("biz_ad_pricing_star")
public class AdPricingStar {

    @TableId
    private Long id;

    /** 定价编号（按编号生成规则 config_pricing_star 生成，如 DJWD20260812000） */
    private String pricingNo;

    /** 关联算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（今天起 N 天可售，超出为待开售） */
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 多时段梯度折扣（JSON 字符串） */
    private String discountTiers;

    /** 取消扣费梯度（JSON 字符串） */
    private String cancelFeeTiers;

    /** 屏蔽商家开关: 1=启用 2=关闭 */
    private Integer blockMerchant;

    /** 屏蔽商家列表（JSON 字符串） */
    private String blockList;

    /** 可售时段（JSON 数组字符串, 如 ["breakfast","lunch"]; 空或含 fullDay 表示全部时段） */
    private String sellTimeSlots;

    /** 时段折扣配置（JSON 数组字符串, 分商圈: fullDay/breakfast/.../supper, 百分比记法） */
    private String slotDiscounts;

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
