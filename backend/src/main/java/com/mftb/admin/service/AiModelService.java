package com.mftb.admin.service;

import com.mftb.admin.dto.AiModelDTO;

import java.util.List;

/**
 * AI 模型管理服务
 */
public interface AiModelService {

    /**
     * 获取模型列表
     */
    List<AiModelDTO.ModelVO> list(String modelKey, String name, String type, Integer status, String modality);

    /**
     * 获取单个模型详情
     */
    AiModelDTO.ModelVO getById(Long id);

    /**
     * 新增模型
     */
    boolean create(AiModelDTO.ModelSaveRequest request);

    /**
     * 更新模型
     */
    boolean update(Long id, AiModelDTO.ModelSaveRequest request);

    /**
     * 删除模型（逻辑删除）
     */
    boolean delete(Long id);
}
