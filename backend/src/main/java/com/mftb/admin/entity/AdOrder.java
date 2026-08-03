package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 推广广告订单主实体（共享核心层，对应「订单列表/详情」）
 */
@Data
@TableName("biz_ad_order")
public class AdOrder {

    @TableId
    private Long id;

    /** 订单编号: GD + 年月日 + 4位自增 */
    private String orderNo;

    /** 算法类型快照 */
    private Integer algoType;

    /** 算法ID（关联 biz_ad_algorithm.id） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 算法编码快照 */
    private String algoCode;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道快照 */
    private Integer channel;

    /** 购买集团ID（关联 biz_merchant_group.group_code） */
    private String groupCode;

    /** 集团名称快照 */
    private String groupName;

    /** 购买门店ID */
    private String storeCode;

    /** 门店名称快照 */
    private String storeName;

    /** 归属BD */
    private String bdEmpId;

    /** 下单人类型: 1=商家 2=业务人员 */
    private Integer operatorType;

    /** 下单人ID (商家=门店ID, 业务人员=工号) */
    private String operatorId;

    /** 下单人姓名 */
    private String operatorName;

    /** 明细格子数 */
    private Integer itemCount;

    /** 原价合计 */
    private BigDecimal originalAmount;

    /** 折扣优惠金额 */
    private BigDecimal discountAmount;

    /** 实付金额（推广金扣款） */
    private BigDecimal actualAmount;

    /** 已退款金额（按取消扣费梯度） */
    private BigDecimal refundAmount;

    /** 订单状态: 1=待推广 2=推广中 3=已推广 4=已退款 5=已取消 */
    private Integer status;

    /** 下单时间 */
    private LocalDateTime orderTime;

    /** 支付时间 */
    private LocalDateTime payTime;

    /** 关联财务明细编号 */
    private String flowNo;

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
