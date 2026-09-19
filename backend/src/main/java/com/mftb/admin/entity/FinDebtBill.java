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
 * 欠款单实体
 * 来源: 充值申请（混合支付/营业额支付，每个扣款门店一条）、商户合并申请（存续集团每个偿还门店一条）
 */
@Data
@TableName("biz_fin_debt_bill")
public class FinDebtBill {

    @TableId
    private Long id;

    /** 账单编号: QK + 年月日 + 4位自增 */
    private String billNo;

    /** 集团ID */
    private String groupCode;

    /** 集团名称 */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 门店ID */
    private String storeCode;

    /** 门店名称 */
    private String storeName;

    /** 业务频道 */
    private String channel;

    /** 归属BD */
    private String bd;

    /** 账单来源: recharge=充值营业额扣款 merge=合并欠款转入 */
    private String source;

    /** 借款日期（审批通过日期） */
    private LocalDate loanDate;

    /** 关联批次号 */
    private String batchNo;

    /** 流程编号 */
    private String flowNo;

    /** 欠款总额 */
    private BigDecimal debtTotal;

    /** 已还金额（还款明细合计，含转移结算） */
    private BigDecimal paidAmount;

    /** 剩余待还 = 欠款总额 - 已还金额 */
    private BigDecimal remainAmount;

    /** 账单状态: unsettled=未结清 settled=已结清 transferred=已转结 */
    private String status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
