package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 角色模型权限映射实体
 */
@Data
@TableName("ai_role_model_mapping")
public class AiRoleModelMapping {

    @TableId
    private Long id;

    /** 角色 ID */
    private Long roleId;

    /** 模型 ID */
    private Long modelId;

    /** 权限级别：full/restricted/none */
    private String permissionLevel;

    /** 每日限额（tokens） */
    private Integer dailyLimit;

    /** 月度限额（tokens） */
    private Integer monthlyLimit;

    /** 优先级（数字越大优先级越高） */
    private Integer priority;

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
