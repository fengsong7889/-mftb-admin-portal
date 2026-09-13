package com.mftb.admin.service;

import com.mftb.admin.dto.AiDeptAuthGroupDTO;

import java.util.List;

/**
 * 部门模型授权策略管理服务
 */
public interface AiDeptAuthGroupService {

    /**
     * 获取策略列表
     */
    List<AiDeptAuthGroupDTO.GroupVO> list(String name, Integer dataResidency);

    /**
     * 获取策略详情
     */
    AiDeptAuthGroupDTO.GroupDetailVO detail(Long id);

    /**
     * 新增策略
     */
    boolean create(AiDeptAuthGroupDTO.GroupSaveRequest request);

    /**
     * 编辑策略
     */
    boolean update(Long id, AiDeptAuthGroupDTO.GroupSaveRequest request);

    /**
     * 启停策略
     */
    boolean toggleStatus(Long id, Integer status);

    /**
     * 删除策略
     */
    boolean delete(Long id);

    /**
     * 获取所有部门选项（供 Transfer 组件使用）
     */
    List<AiDeptAuthGroupDTO.DeptOptionVO> deptOptions();
}
