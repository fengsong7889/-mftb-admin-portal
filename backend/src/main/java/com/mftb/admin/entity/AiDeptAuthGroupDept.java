package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 策略-部门关联表
 */
@Data
@TableName("ai_dept_auth_group_dept")
public class AiDeptAuthGroupDept {

    @TableId
    private Long id;

    /** 策略组 ID */
    private Long groupId;

    /** 部门 ID */
    private Long departmentId;

    @TableField(fill = com.baomidou.mybatisplus.annotation.FieldFill.INSERT)
    private LocalDateTime createdAt;
}
