package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 菜单新增/编辑请求
 */
@Data
public class MenuRequest {

    /** 父菜单ID (顶级传 null) */
    private Long parentId;

    /** 菜单标识: 用于权限判断与前端路由key */
    @NotBlank(message = "菜单标识不能为空")
    private String menuKey;

    /** 菜单名称 */
    @NotBlank(message = "菜单名称不能为空")
    private String name;

    /** 菜单英文名称 (可选, 留空时前端回退显示中文名称) */
    private String nameEn;

    /** 路由路径 */
    private String path;

    /** 前端组件路径 */
    private String component;

    /** 图标 */
    private String icon;

    /** 类型: 1=目录 2=菜单 3=按钮 */
    @NotNull(message = "菜单类型不能为空")
    private Integer type;

    /** 排序 */
    private Integer sort;

    /** 可用操作: view/create/edit/delete/import/export/enable/disable */
    private List<String> actions;

    /** 状态: 1=启用 0=停用 */
    private Integer status;
}
