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

    /**
     * 校验员工能否进入指定业务系统（不等同于菜单权限）。
     * <p>超管直通；否则取 sys_role_system ∩ sys_department_system 启用集，且 sys_system.status=1。
     * {@code 'portal'} 不列入可访问集，接口预留给内部入口。
     */
    boolean hasSystemAccess(SysUser user, String systemCode);

    /**
     * 当前用户可进入的业务系统编码集合（按 sys_system.sort_order 排序）。
     * <p>超管返回全部启用系统；普通用户 = 角色 ∪ 部门；不返 {@code 'portal'}。
     */
    java.util.List<String> listAccessibleSystems(SysUser user);

    /**
     * 菜单归属的业务系统编码（供 {@code PermissionAspect} 判定系统准入）。
     * <p>返回 null 代表未登记菜单或内部接口；返回 {@code 'portal'} 时为个人工作台哨兵，
     * 两者均跳过系统准入判定。
     */
    String resolveSystemCodeOfMenu(String menuKey);

    /** 清空权限缓存 (角色/部门/员工授权变更后调用) */
    void evictAll();
}
