package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 部门新增/编辑请求
 */
@Data
public class DepartmentRequest {

    /** 部门编码 (由系统自动生成 MT+5位自增, 前端无需传入) */
    private String code;

    @NotBlank(message = "部门名称不能为空")
    private String name;

    /** 上级部门ID (顶级传 null) */
    private Long parentId;

    /** 部门对接人 */
    private String leader;

    /** 排序 */
    private Integer sort;
}
