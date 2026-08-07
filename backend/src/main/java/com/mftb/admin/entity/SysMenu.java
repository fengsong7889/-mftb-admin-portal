package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 系统菜单配置实体
 */
@Data
@TableName("sys_menu")
public class SysMenu {

    @TableId
    private Long id;

    /** 父菜单ID (顶级为 null) */
    private Long parentId;

    /** 菜单标识: 用于权限判断与前端路由key */
    private String menuKey;

    /** 菜单名称 */
    private String name;

    /** 菜单英文名称 */
    private String nameEn;

    /** 路由路径 */
    private String path;

    /** 前端组件路径 */
    private String component;

    /** 图标 */
    private String icon;

    /** 类型: 1=目录 2=菜单 3=按钮 */
    private Integer type;

    /** 排序 */
    @TableField("sort_order")
    private Integer sort;

    /** 可用操作 JSON数组: ["view","create","edit","delete"] */
    private String actions;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

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
