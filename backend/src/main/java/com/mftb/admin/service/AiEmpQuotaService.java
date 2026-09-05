package com.mftb.admin.service;

import com.mftb.admin.dto.AiEmpQuotaDTO;

import java.util.List;

/**
 * 員工額度服務接口
 */
public interface AiEmpQuotaService {

    /* ══════════ 職位額度 ══════════ */

    /** 查詢職位額度列表 */
    List<AiEmpQuotaDTO.PosQuotaVO> listPosQuotas(AiEmpQuotaDTO.QuotaQueryRequest query);

    /** 根據 ID 查詢職位額度詳情 */
    AiEmpQuotaDTO.PosQuotaVO getPosQuotaById(Long id);

    /** 保存/更新職位額度 */
    Long savePosQuota(AiEmpQuotaDTO.PosQuotaRequest request, String operator);

    /** 刪除職位額度 */
    void deletePosQuota(Long id);

    /** 切換啟用/停用狀態 */
    void togglePosQuotaStatus(Long id, Integer status, String operator);

    /* ══════════ 角色額度 ══════════ */

    /** 查詢角色額度列表 */
    List<AiEmpQuotaDTO.RoleQuotaVO> listRoleQuotas(AiEmpQuotaDTO.QuotaQueryRequest query);

    /** 根據 ID 查詢角色額度詳情 */
    AiEmpQuotaDTO.RoleQuotaVO getRoleQuotaById(Long id);

    /** 保存/更新角色額度 */
    Long saveRoleQuota(AiEmpQuotaDTO.RoleQuotaRequest request, String operator);

    /** 刪除角色額度 */
    void deleteRoleQuota(Long id);

    /** 切換啟用/停用狀態 */
    void toggleRoleQuotaStatus(Long id, Integer status, String operator);
}
