package com.mftb.admin.service;

import com.mftb.admin.dto.AiDeptQuotaDTO;

import java.util.List;

public interface AiDeptQuotaService {

    List<AiDeptQuotaDTO.DeptQuotaVO> listDeptQuotas(AiDeptQuotaDTO.DeptQuotaQueryRequest query);

    AiDeptQuotaDTO.DeptQuotaVO getDeptQuotaById(Long id);

    Long saveDeptQuota(AiDeptQuotaDTO.DeptQuotaRequest request, String operator);

    void deleteDeptQuota(Long id);

    void toggleDeptQuotaStatus(Long id, Integer status, String operator);
}
