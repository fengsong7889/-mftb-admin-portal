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
 * 福利參保方案（表 payroll_benefit_plan）：某法域下的一类法定/補充福利及费率。
 * <p>
 * 费率分开存雇主与雇员两份而不是只存合计：工资单要分别做「雇主成本」与「个人扣除」两行，
 * 合成一个比率后无法拆回，代扣代缴申报也就对不上。
 * <p>
 * 缴费基数上下限是法定约束，放在方案上而不是每人手填：基数越界时社保局会整批退回。
 */
@Data
@TableName("payroll_benefit_plan")
public class PayrollBenefitPlan {

    @TableId
    private Long id;

    /** 方案编码（业务主键） */
    private String code;

    /** 方案名称 */
    private String name;

    /** 英文名称 */
    private String nameEn;

    /** 类型：SOCIAL_INSURANCE 社保 / HOUSING_FUND 公积金 / MEDICAL 補充醫療 / GROUP_LIFE 團體壽險 / OTHER */
    private String planType;

    /** 法域：CN / HK / MO */
    private String jurisdiction;

    /** 雇主承担比例（0~1，四位小数足够表示 0.1050） */
    private BigDecimal employerRatio;

    /** 雇员承担比例 */
    private BigDecimal employeeRatio;

    /** 缴费基数下限 */
    private BigDecimal minBase;

    /** 缴费基数上限 */
    private BigDecimal maxBase;

    /** 币种 */
    private String currency;

    /** 生效起（含） */
    private LocalDate effectiveFrom;

    /** 生效止（含），空表示长期有效 */
    private LocalDate effectiveTo;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
