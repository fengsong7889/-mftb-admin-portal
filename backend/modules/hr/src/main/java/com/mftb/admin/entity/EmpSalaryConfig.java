package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 员工费用信息 - 薪资配置（每员工唯一）
 */
@Data
@TableName("emp_salary_config")
public class EmpSalaryConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 sys_user.id */
    private Long userId;

    /** 薪资结构（岗位工资制/绩效工资制等） */
    private String salaryStructure;

    /** 发薪方式（月结/周结/日结） */
    private String paymentMethod;

    /** 发薪日（1~31） */
    private Integer payDay;

    /** 开户银行 */
    private String bankName;

    /** 银行账号 */
    private String bankAccount;

    /** 纳税城市 */
    private String taxCity;

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
