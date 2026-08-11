package com.mftb.admin.service;

import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;

import java.util.List;

/**
 * 功能角色服务
 */
public interface RoleService {

    /** 查询全部角色 */
    List<RoleVO> list();

    /** 新增角色 */
    RoleVO create(RoleRequest request);

    /** 编辑角色基础信息 */
    RoleVO update(Long id, RoleRequest request);

    /** 保存角色菜单权限 */
    void updatePermissions(Long id, List<MenuPermissionDTO> permissions);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除角色 (同时从所有员工的绑定中移除) */
    void delete(Long id);

    /** 查询绑定该角色的用户ID列表 */
    List<Long> boundUserIds(Long roleId);

    /** 全量设置绑定该角色的用户 */
    void bindUsers(Long roleId, List<Long> userIds);

    /** 合并多个角色的菜单权限 (仅启用状态角色) */
    List<MenuPermissionDTO> mergePermissions(List<Long> roleIds);

    /** 根据角色ID列表查询对应的角色编码列表 (仅启用状态角色) */
    List<String> codesOf(List<Long> roleIds);
}
