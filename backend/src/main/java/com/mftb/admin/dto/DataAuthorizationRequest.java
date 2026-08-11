package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 数据授权新增/编辑请求
 */
@Data
public class DataAuthorizationRequest {

    /** 授权对象类型: role / department */
    @NotBlank(message = "授權對象類型不能為空")
    @Pattern(regexp = "role|department", message = "授權對象類型僅支持 role 或 department")
    private String targetType;

    /** 角色ID 或 部门ID */
    @NotNull(message = "授權對象不能為空")
    private Long targetId;

    /** 商家集团编码 */
    @NotBlank(message = "商家集團編碼不能為空")
    private String groupCode;

    /** 状态: 1=启用 0=停用 (默认启用) */
    @Min(value = 0, message = "狀態值僅支持 0 或 1")
    @Max(value = 1, message = "狀態值僅支持 0 或 1")
    private Integer status;
}
