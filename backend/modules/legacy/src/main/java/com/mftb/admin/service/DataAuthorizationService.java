package com.mftb.admin.service;

import com.mftb.admin.dto.BatchDataAuthorizationRequest;
import com.mftb.admin.dto.DataAuthorizationRequest;
import com.mftb.admin.dto.DataAuthorizationVO;

import java.util.List;
import java.util.Map;

/**
 * 数据授权管理服务
 */
public interface DataAuthorizationService {

    /** 查询全部数据授权记录(关联角色/部门/商家名称) */
    List<DataAuthorizationVO> list(String targetType, Long targetId);

    /** 新增数据授权 */
    DataAuthorizationVO create(DataAuthorizationRequest request);

    /** 编辑数据授权 */
    DataAuthorizationVO update(Long id, DataAuthorizationRequest request);

    /** 删除数据授权(逻辑删除) */
    void delete(Long id);

    /** 启用状态的角色下拉选项 (id, name, userCount) */
    List<Map<String, Object>> roleOptions();

    /** 全部部门下拉选项 (id, name, nameEn, parentId, status, userCount) */
    List<Map<String, Object>> departmentOptions();

    /** 全部商家集团下拉选项 (groupCode, groupName) */
    List<Map<String, Object>> merchantGroupOptions();

    /** 诊断：检查数据授权相关表与字段是否就绪 */
    List<Map<String, Object>> diagnose();

    /** 批量新增数据授权（跳过已存在的组合） */
    List<DataAuthorizationVO> batchCreate(BatchDataAuthorizationRequest request);

    /** 批量删除数据授权 */
    void batchDelete(List<Long> ids);
}
