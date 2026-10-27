package com.mftb.admin.service;

import com.mftb.admin.dto.AiEmpQuotaDTO;

import java.util.List;

/**
 * 员工额度服务接口
 */
public interface AiEmpQuotaService {

    /* ══════════ 职位额度 ══════════ */

    /** 查询职位额度列表 */
    List<AiEmpQuotaDTO.PosQuotaVO> listPosQuotas(AiEmpQuotaDTO.QuotaQueryRequest query);

    /** 根据 ID 查询职位额度详情 */
    AiEmpQuotaDTO.PosQuotaVO getPosQuotaById(Long id);

    /** 保存/更新职位额度 */
    Long savePosQuota(AiEmpQuotaDTO.PosQuotaRequest request, String operator);

    /** 删除职位额度 */
    void deletePosQuota(Long id);

    /** 切换启用/停用状态 */
    void togglePosQuotaStatus(Long id, Integer status, String operator);

    /* ══════════ 角色额度 ══════════ */

    /** 查询角色额度列表 */
    List<AiEmpQuotaDTO.RoleQuotaVO> listRoleQuotas(AiEmpQuotaDTO.QuotaQueryRequest query);

    /** 根据 ID 查询角色额度详情 */
    AiEmpQuotaDTO.RoleQuotaVO getRoleQuotaById(Long id);

    /** 保存/更新角色额度 */
    Long saveRoleQuota(AiEmpQuotaDTO.RoleQuotaRequest request, String operator);

    /** 删除角色额度 */
    void deleteRoleQuota(Long id);

    /** 切换启用/停用状态 */
    void toggleRoleQuotaStatus(Long id, Integer status, String operator);
}
