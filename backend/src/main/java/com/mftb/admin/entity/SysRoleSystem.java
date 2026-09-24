package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 角色 × 系统 准入关联。
 * <p>
 * 与 {@code sys_role_menu} 独立：撤销系统准入不会删除菜单授权，反之亦然；
 * 两者共同决定「用户能否进入系统 / 能做什么操作」。
 */
@Data
@TableName("sys_role_system")
public class SysRoleSystem {

    @TableId(value = "role_id", type = IdType.INPUT)
    private Long roleId;

    @TableField("system_code")
    private String systemCode;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
