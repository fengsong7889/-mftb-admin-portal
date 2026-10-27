package com.mftb.admin.service;

import com.mftb.admin.controller.AiEmpAuthController.*;

import java.util.List;

/**
 * 员工模型权控服务：职位授权策略 + 自定义角色授权 CRUD
 */
public interface AiEmpAuthService {

    /* ═══════════════ 职位授权策略 ═══════════════ */

    /** 职位策略列表；name 非空时按策略名模糊匹配，全量返回不分页，按更新时间倒序 */
    List<PosStrategyVO> listPosStrategies(String name);

    /** 职位策略详情；id 不存在时返回 null */
    PosStrategyVO getPosStrategy(Long id);

    /** 新建职位策略，返回自增主键 id（同时生成 configCode 业务编号） */
    Long createPosStrategy(PosStrategySaveRequest request);

    /**
     * 按 id 更新职位策略。
     * <p>
     * ⚠️ 这里的 boolean 表“记录是否存在”而不是“是否写入成功”：id 不存在时返回 false
     * 且不抛异常，调用方必须自行判断并提示。本路径不写 updatedBy。
     */
    boolean updatePosStrategy(Long id, PosStrategySaveRequest request);

    /** 启用/停用职位策略；boolean 含义同 {@link #updatePosStrategy}（false=策略不存在） */
    boolean togglePosStrategyStatus(Long id, Integer status);

    /** 删除职位策略；boolean 含义同上（false=策略不存在） */
    boolean deletePosStrategy(Long id);

    /* ═══════════════ 自定义角色授权 ═══════════════ */

    /** 角色授权列表；name 非空时按角色名模糊匹配，全量不分页，按更新时间倒序 */
    List<RoleAuthVO> listRoleAuths(String name);

    /**
     * 角色授权详情。⚠️ 角色这一组均以 <b>roleCode</b> 定位（而非自增 id），
     * 与上面职位策略用 id 不一致；code 不存在时返回 null。
     */
    RoleAuthVO getRoleAuth(String roleCode);

    /** 新建角色授权，返回生成的 roleCode（前端后续增删改都靠它，不是 id） */
    String createRoleAuth(RoleAuthSaveRequest request);

    /** 按 roleCode 更新角色授权；boolean 含义同 {@link #updatePosStrategy}（false=角色不存在） */
    boolean updateRoleAuth(String roleCode, RoleAuthSaveRequest request);

    /** 启用/停用角色授权；boolean 含义同上（false=角色不存在） */
    boolean toggleRoleAuthStatus(String roleCode, Integer status);

    /** 删除角色授权；boolean 含义同上（false=角色不存在） */
    boolean deleteRoleAuth(String roleCode);
}
