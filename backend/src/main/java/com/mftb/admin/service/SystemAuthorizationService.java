package com.mftb.admin.service;

import com.mftb.admin.dto.SystemAuthorizationRequest;
import com.mftb.admin.dto.SystemAuthorizationVO;

/**
 * 系统授权读写服务（Round 3）。
 * <p>把「角色 / 部门 × 单个业务系统」的准入 + 该系统内菜单动作作为一个原子单位读写，
 * 保证保存 A 系统时不会覆盖 B 系统的既有授权（区别于现有 {@code updatePermissions} 全量覆盖）。
 */
public interface SystemAuthorizationService {

    /** 目标类型：角色 */
    String TARGET_ROLE = "role";
    /** 目标类型：部门 */
    String TARGET_DEPARTMENT = "department";

    /** 读取目标在指定系统的授权快照。 */
    SystemAuthorizationVO read(String targetType, Long targetId, String systemCode);

    /**
     * 原子保存目标在指定系统的授权。
     * <p>事务内：可选版本冲突检查 → 更新 sys_role_system / sys_department_system →
     * 覆盖该系统内的 sys_role_menu / sys_department_menu → 递增全局权限 revision。
     */
    SystemAuthorizationVO save(String targetType, Long targetId, String systemCode, SystemAuthorizationRequest request);
}
