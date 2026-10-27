package com.mftb.admin.service;

import com.mftb.admin.dto.EmpPermissionTraceVO;

/**
 * 员工权限透视服务（授权中心 · 权限追溯）。
 * <p>按"运行时相同"的生效规则（启用角色 ∪ 有效部门，仅启用菜单）计算最终权限并集，
 * 并保留每条授权结果的来源明细；与 {@code PermissionServiceImpl} 的缓存判定解耦，
 * 属只读诊断路径，不影响权限缓存。
 */
public interface AuthorizationTraceService {

    /** 透视指定员工的最终权限及来源。 */
    EmpPermissionTraceVO trace(Long userId);
}
