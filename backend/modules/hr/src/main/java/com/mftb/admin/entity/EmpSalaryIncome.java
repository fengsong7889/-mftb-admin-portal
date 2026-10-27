package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 员工费用信息 - 收入项
 */
@Data
@TableName("emp_salary_income")
public class EmpSalaryIncome {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 sys_user.id */
    private Long userId;

    /** 项目名称（基本工资/岗位津贴等） */
    private String name;

    /** 金额（元） */
    private BigDecimal amount;

    /** 类型（fixed=固定, variable=浮动） */
    private String type;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

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
