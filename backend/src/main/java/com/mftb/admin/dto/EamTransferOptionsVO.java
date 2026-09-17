package com.mftb.admin.dto;

import java.util.List;

/** 调拨选择项只返回办理所需字段，不泄露组织权限或员工隐私。 */
public record EamTransferOptionsVO(List<DepartmentOption> departments, List<CategoryOption> categories,
                                   List<BrandOption> brands) {
    public record DepartmentOption(Long id, Long parentId, String name, Integer status) {}
    public record CategoryOption(Long id, Long parentId, String name, String code, String status) {}
    public record BrandOption(Long id, String brandZh, String brandEn, String categoryCode) {}
    public record EmployeeOption(Long id, String name, String empId, Long departmentId, String department) {}
}
