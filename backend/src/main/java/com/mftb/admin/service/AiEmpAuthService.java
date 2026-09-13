package com.mftb.admin.service;

import com.mftb.admin.controller.AiEmpAuthController.*;

import java.util.List;

/**
 * 员工模型权控服务：职位授权策略 + 自定义角色授权 CRUD
 */
public interface AiEmpAuthService {

    /* ═══════════════ 职位授权策略 ═══════════════ */

    List<PosStrategyVO> listPosStrategies(String name);

    PosStrategyVO getPosStrategy(Long id);

    Long createPosStrategy(PosStrategySaveRequest request);

    boolean updatePosStrategy(Long id, PosStrategySaveRequest request);

    boolean togglePosStrategyStatus(Long id, Integer status);

    boolean deletePosStrategy(Long id);

    /* ═══════════════ 自定义角色授权 ═══════════════ */

    List<RoleAuthVO> listRoleAuths(String name);

    RoleAuthVO getRoleAuth(String roleCode);

    String createRoleAuth(RoleAuthSaveRequest request);

    boolean updateRoleAuth(String roleCode, RoleAuthSaveRequest request);

    boolean toggleRoleAuthStatus(String roleCode, Integer status);

    boolean deleteRoleAuth(String roleCode);
}
