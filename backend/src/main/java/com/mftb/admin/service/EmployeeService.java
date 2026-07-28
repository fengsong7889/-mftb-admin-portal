package com.mftb.admin.service;

import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;

/**
 * 集团员工服务
 */
public interface EmployeeService {

    /** 分页查询员工 */
    PageResult<EmployeeVO> list(long page, long size, String keyword, Integer status);

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
}
