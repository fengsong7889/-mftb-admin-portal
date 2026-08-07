package com.mftb.admin.service;

import com.mftb.admin.dto.DepartmentRequest;
import com.mftb.admin.dto.DepartmentVO;
import com.mftb.admin.dto.MenuPermissionDTO;

import java.util.List;

/**
 * 集团组织架构-部门服务
 */
public interface DepartmentService {

    /** 查询全部部门 (平铺列表, 前端自行构建树) */
    List<DepartmentVO> list();

    /** 新增部门 */
    DepartmentVO create(DepartmentRequest request);

    /** 编辑部门 */
    DepartmentVO update(Long id, DepartmentRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 保存部门菜单权限 (部门授权) */
    void updatePermissions(Long id, List<MenuPermissionDTO> permissions);

    /** 删除部门 (存在下级部门时禁止删除, 同时解绑该部门下员工) */
    void delete(Long id);

    /** 查询部门授权的菜单权限 (部门不存在或已停用返回空列表) */
    List<MenuPermissionDTO> permissionsOf(Long deptId);

    /**
     * 批量翻译部门名称：将 nameEn 为空的部门按中文名自动翻译为英文
     *
     * @return 本次翻译成功的部门数
     */
    int translateNames();
}
