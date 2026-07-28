package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 菜单权限项: 某个菜单下允许的功能操作
 */
@Data
public class MenuPermissionDTO {

    /** 菜单 key */
    private String menuKey;

    /** 允许的操作: view/create/edit/delete/import/export/enable/disable */
    private List<String> actions;
}
