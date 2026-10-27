package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 薪酬项目（表 payroll_component）：工资单上的一行。
 * <p>
 * 为什么要有类型而不只是一个名字：算钱时「应发 / 扣除 / 雇主成本」三类的汇总口径完全不同，
 * 雇主承担的社保不进员工实发，但进人力成本；混在一起会让工资单与成本报表对不上。
 * <p>
 * {@code taxable} 是法定属性不是界面开关：个税累计预扣依据它区分应税与免税项。
 */
@Data
@TableName("payroll_component")
public class PayrollComponent {

    @TableId
    private Long id;

    /** 项目编码（稳定业务键，全库唯一） */
    private String code;

    /** 项目名称 */
    private String name;

    /** 英文名称 */
    private String nameEn;

    /** 类型：EARNING 应发 / DEDUCTION 扣除 / EMPLOYER_COST 雇主成本 */
    private String componentType;

    /** 是否应税：1=应税 0=免税（法定属性，不做成可选开关） */
    private Integer taxable;

    /** 币种（ISO 4217，如 CNY/HKD/MOP）；空表示随人员薪酬标准币种 */
    private String currency;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序（工资单展示顺序） */
    private Integer sortOrder;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
