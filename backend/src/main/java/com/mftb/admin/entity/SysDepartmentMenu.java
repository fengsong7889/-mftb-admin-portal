package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 部门-菜单权限关联实体
 */
@Data
@TableName("sys_department_menu")
public class SysDepartmentMenu {

    @TableId(value = "dept_id", type = IdType.INPUT)
    private Long deptId;

    private Long menuId;

    /** 允许的操作 JSON数组: ["view","create","edit","delete"] */
    private String actions;
}
