package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 欠款还款明细实体
 * 转移结算记录由商户合并审批通过时系统自动生成，canDelete=0 不可删除
 */
@Data
@TableName("biz_fin_debt_repayment")
public class FinDebtRepayment {

    @TableId
    private Long id;

    /** 欠款单ID（关联 biz_fin_debt_bill.id） */
    private Long billId;

    /** 账单编号快照 */
    private String billNo;

    /** 还款日期 */
    private LocalDate repayDate;

    /** 还款渠道: 推广金扣款 / 营业额扣款 / 对公转账 / 转移结算 */
    private String channel;

    /** 还款金额 */
    private BigDecimal amount;

    /** 备注 */
    private String remark;

    /** 操作人 */
    private String operator;

    /** 操作时间 */
    private LocalDateTime operateTime;

    /** 是否可删除: 1=可删除 0=系统生成不可删除 */
    private Integer canDelete;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

