package com.mftb.admin.service;

import com.mftb.admin.dto.AiProviderDTO;

import java.util.List;

/**
 * AI 供应商管理服务
 */
public interface AiProviderService {

    /**
     * 获取供应商列表
     */
    List<AiProviderDTO.ProviderVO> list(String providerKey, String name, Integer status);

    /**
     * 获取单个供应商详情
     */
    AiProviderDTO.ProviderVO getById(Long id);

    /**
     * 新增供应商
     */
    boolean create(AiProviderDTO.ProviderSaveRequest request);

    /**
     * 更新供应商
     */
    boolean update(Long id, AiProviderDTO.ProviderSaveRequest request);

    /**
     * 删除供应商（逻辑删除）
     */
    boolean delete(Long id);
}
