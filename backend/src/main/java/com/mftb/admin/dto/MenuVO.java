package com.mftb.admin.dto;

import com.mftb.admin.entity.SysMenu;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 菜单视图对象
 */
@Data
public class MenuVO {

    private Long id;
    private Long parentId;
    /** 上级菜单名称 */
    private String parentName;
    private String menuKey;
    private String name;
    /** 菜单英文名称 */
    private String nameEn;
    private String path;
    private String component;
    private String icon;
    private Integer type;
    private Integer sort;
    /** 可用操作 */
    private List<String> actions;
    private Integer status;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;
    /** 子菜单 (树形结构使用) */
    private List<MenuVO> children;

    public static MenuVO from(SysMenu menu) {
        return from(menu, null);
    }

    public static MenuVO from(SysMenu menu, String parentName) {
        MenuVO vo = new MenuVO();
        vo.setId(menu.getId());
        vo.setParentId(menu.getParentId());
        vo.setParentName(parentName);
        vo.setMenuKey(menu.getMenuKey());
        vo.setName(menu.getName());
        vo.setNameEn(menu.getNameEn());
        vo.setPath(menu.getPath());
        vo.setComponent(menu.getComponent());
        vo.setIcon(menu.getIcon());
        vo.setType(menu.getType());
        vo.setSort(menu.getSort());
        vo.setActions(JsonUtils.parseStringList(menu.getActions()));
        vo.setStatus(menu.getStatus());
        vo.setCreatedAt(menu.getCreatedAt());
        vo.setUpdatedBy(menu.getUpdatedBy());
        vo.setUpdatedAt(menu.getUpdatedAt());
        vo.setChildren(new ArrayList<>());
        return vo;
    }
}
