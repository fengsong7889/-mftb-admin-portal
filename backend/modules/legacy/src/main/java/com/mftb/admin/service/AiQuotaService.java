package com.mftb.admin.service;

import com.mftb.admin.dto.AiQuotaDTO;

import java.util.List;

/**
 * AI 配额管理服务
 */
public interface AiQuotaService {

    /**
     * 查询部门配额列表
     */
    List<AiQuotaDTO.QuotaVO> listDeptQuotas(AiQuotaDTO.DeptQuotaQueryRequest query);

    /**
     * 查询员工配额列表
     */
    List<AiQuotaDTO.QuotaVO> listEmpQuotas(AiQuotaDTO.EmpQuotaQueryRequest query);

    /**
     * 批量设置部门配额
     */
    void batchSetDeptQuotas(AiQuotaDTO.BatchQuotaRequest request);

    /**
     * 批量设置员工配额
     */
    void batchSetEmpQuotas(AiQuotaDTO.BatchQuotaRequest request);

    /**
     * 删除指定目标的配额配置
     */
    boolean deleteQuota(String type, Long targetId);
}
