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
 * 薪酬规则集（表 payroll_rule_set）：某城市某期间生效的一整套算薪口径。
 * <p>
 * 为什么以"城市 + 期间"为主键语义：社保基数上下限由各统筹区每年单独公布，
 * 内地不同城市差异很大。代码里不放任何默认值——缺配置就拒绝试算，
 * 宁可算不出来，也不能用一套猜测的数把工资发出去。
 */
@Data
@TableName("payroll_rule_set")
public class PayrollRuleSet {

    @TableId
    private Long id;

    /** 规则集编码（如 CN-SZ-2026） */
    private String code;

    /** 名称 */
    private String name;

    /** 法域：CN / HK / MO */
    private String jurisdiction;

    /** 统筹区/城市代码（内地用行政区划码，如 4403；港澳填 HK / MO） */
    private String cityCode;

    /** 城市名称（展示用） */
    private String cityName;

    /** 币种 */
    private String currency;

    /** 个税基本减除费用（起征点），按月 */
    private BigDecimal basicDeduction;

    /** 生效起（含） */
    private LocalDate effectiveFrom;

    /** 生效止（含），空表示长期有效 */
    private LocalDate effectiveTo;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 版本说明（如"2026 年社保年度"） */
    private String versionLabel;

    private String remark;
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
