package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 赠送消费流水实体
 */
@Data
@TableName("biz_gift_consume")
public class BizGiftConsume {

    @TableId
    private Long id;

    /** 关联赠送记录ID */
    private Long giftRecordId;

    /** 关联赠送ID */
    private String giftId;

    /** 集团ID */
    private Long groupId;

    /** 集团名称快照 */
    private String groupName;

    /** 门店ID */
    private Long storeId;

    /** 门店名称快照 */
    private String storeName;

    /** 品牌 */
    private String brand;

    /** 广告类型 */
    private String adType;

    /** 交易类型 */
    private String tradeType;

    /** 余额变动 */
    private Integer balanceChange;

    /** 变动日期 */
    private LocalDate changeDate;

    /** 广告算法ID */
    private String algorithmId;

    /** 广告算法名称 */
    private String algorithmName;

    /** 关联订单号 */
    private String orderNo;

    /** 变动后剩余天数 */
    private Integer remainingDays;

    /** 备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
