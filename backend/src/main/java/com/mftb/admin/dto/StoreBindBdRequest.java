package com.mftb.admin.dto;

import lombok.Data;

/**
 * 门店绑定BD请求（bdEmpId 为空表示解除绑定）
 */
@Data
public class StoreBindBdRequest {

    /** BD员工工号 (sys_user.emp_id) */
    private String bdEmpId;
}
