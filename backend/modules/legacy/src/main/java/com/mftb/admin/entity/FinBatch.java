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
 * 推广金批次实体（仅充值/转账/合并生成批次，扣款不生成）
 */
@Data
@TableName("biz_fin_batch")
public class FinBatch {

    @TableId
    private Long id;

    /** 批次号: PC + 年月日 + 4位自增 */
    private String batchNo;

    /** 批次类型: recharge / transfer / merge */
    private String batchType;

    /** 关联流程编号 */
    private String flowNo;

    /** 集团ID */
    private String groupCode;

    /** 集团名称 */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 交易时间（审批通过时间） */
    private LocalDateTime tradeTime;

    /** 是否实收: 是 / 否 / -- */
    private String isActual;

    /** 虚拟账户金额（负数=转出/扣减） */
    private BigDecimal virtualAmount;

    /** 实收账户金额（NULL=不涉及） */
    private BigDecimal actualAmount;

    /** 优惠金额 */
    private BigDecimal discountAmount;

    /** 申请人 */
    private String applicant;

    /** 归属BD */
    private String bd;

    /** 备注 */
    private String remark;

    /** 批次明细页展示数据 JSON */
    private String extra;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
