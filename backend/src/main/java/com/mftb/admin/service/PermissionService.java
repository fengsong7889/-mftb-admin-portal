package com.mftb.admin.service;

import com.mftb.admin.entity.SysUser;

/**
 * 员工操作权限服务
 * <p>
 * 有效权限 = 功能角色授权(sys_role_menu) ∪ 部门授权(sys_department_menu),
 * sys_user.role=admin 或绑定 sys_admin 角色的员工直通
 */
public interface PermissionService {

    /**
     * 校验员工是否拥有指定菜单的操作权限
     *
     * @param user    当前登录员工
     * @param menuKey 菜单标识 (sys_menu.menu_key)
     * @param action  操作: view/create/edit/delete/import/export/enable/disable
     */
    boolean hasPermission(SysUser user, String menuKey, String action);

    /** 清空权限缓存 (角色/部门/员工授权变更后调用) */
    void evictAll();
}
