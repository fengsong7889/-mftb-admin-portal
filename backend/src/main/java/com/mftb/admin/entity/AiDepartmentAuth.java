package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 部门模型权限实体
 */
@Data
@TableName("ai_department_auth")
public class AiDepartmentAuth {

    @TableId
    private Long id;

    /** 部门 ID */
    private Long departmentId;

    /** 模型 ID */
    private Long modelId;

    /** 是否有权限：1=有权限 0=无权限 */
    private Integer hasPermission;

    /** 限制类型：none/daily/monthly/custom */
    private String limitType;

    /** 每日限额（tokens） */
    private Integer dailyLimit;

    /** 月度限额（tokens） */
    private Integer monthlyLimit;

    /** 自定义限额 */
    private Integer customLimit;

    /** 生效开始日期 */
    private LocalDate startDate;

    /** 生效结束日期 */
    private LocalDate endDate;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
