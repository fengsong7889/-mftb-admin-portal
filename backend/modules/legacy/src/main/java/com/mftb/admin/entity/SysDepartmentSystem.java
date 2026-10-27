package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 部门 × 系统 准入关联。
 */
@Data
@TableName("sys_department_system")
public class SysDepartmentSystem {

    @TableId(value = "dept_id", type = IdType.INPUT)
    private Long deptId;

    @TableField("system_code")
    private String systemCode;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
