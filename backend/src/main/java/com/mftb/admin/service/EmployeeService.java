package com.mftb.admin.service;

import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * 集团员工服务
 */
public interface EmployeeService {

    /** 分页查询员工（支持 employmentStatus 过滤：active/resigned） */
    PageResult<EmployeeVO> list(long page, long size, String keyword, String employmentStatus);

    /** 新增员工 */
    EmployeeVO create(EmployeeRequest request);

    /** 编辑员工 */
    EmployeeVO update(Long id, EmployeeRequest request);

    /** 重置密码 */
    void resetPassword(Long id, String password);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除员工 */
    void delete(Long id);

    /** 获取员工基础信息（个人信息 + 证件信息 + 通讯信息） */
    Map<String, Object> getBasicInfo(Long id);

    /** 保存员工基础信息 */
    void saveBasicInfo(Long id, BasicInfoRequest request);
}
