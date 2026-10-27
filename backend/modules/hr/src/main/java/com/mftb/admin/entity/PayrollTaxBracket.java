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
 * 个税级距（表 payroll_tax_bracket）：规则集下的一档超额累进税率。
 * <p>
 * 用「下限 + 上限 + 税率 + 速算扣除数」表达：这是累计预扣法直接可用的形式，
 * 换成"级次 + 区间文字"在算税时还要再解析一次，容易写错边界。
 */
@Data
@TableName("payroll_tax_bracket")
public class PayrollTaxBracket {

    @TableId
    private Long id;

    /** 所属规则集 */
    private Long ruleSetId;

    /** 级次（从 1 起） */
    private Integer levelNo;

    /** 应纳税所得额下限（含） */
    private BigDecimal lowerBound;

    /** 上限（不含），空表示无上限 */
    private BigDecimal upperBound;

    /** 税率（0~1） */
    private BigDecimal rate;

    /** 速算扣除数 */
    private BigDecimal quickDeduction;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
