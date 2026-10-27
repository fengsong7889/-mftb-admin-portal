package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 角色-菜单权限关联实体
 */
@Data
@TableName("sys_role_menu")
public class SysRoleMenu {

    @TableId(value = "role_id", type = IdType.INPUT)
    private Long roleId;

    private Long menuId;

    /** 允许的操作 JSON数组: ["view","create","edit","delete"] */
    private String actions;
}
