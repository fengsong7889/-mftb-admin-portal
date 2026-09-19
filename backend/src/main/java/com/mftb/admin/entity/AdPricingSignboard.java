package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 金字招牌计价主实体（对应「销售定价」菜单 → 金字招牌）
 */
@Data
@TableName("biz_ad_pricing_signboard")
public class AdPricingSignboard {

    @TableId
    private Long id;

    /** 定价编号（DJZP + YYYYMMDD + 3位） */
    private String pricingNo;

    /** 关联算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（默认 7 天） */
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 取消扣费梯度（JSON 字符串） */
    private String cancelFeeTiers;

    /** 折扣模式: global=全局折扣 local=局部折扣 */
    private String discountMode;

    /** 全局折扣梯度JSON（discount_mode=global时生效） */
    private String globalDiscountTiers;

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
