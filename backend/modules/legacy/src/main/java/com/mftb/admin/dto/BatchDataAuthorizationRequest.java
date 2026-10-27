package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.List;

/**
 * 数据授权批量新增请求
 */
@Data
public class BatchDataAuthorizationRequest {

    /** 授权对象类型: role / department */
    @NotBlank(message = "授權對象類型不能為空")
    @Pattern(regexp = "role|department", message = "授權對象類型僅支持 role 或 department")
    private String targetType;

    /** 角色ID 或 部门ID */
    @NotNull(message = "授權對象不能為空")
    private Long targetId;

    /** 商家集团编码列表 */
    @NotEmpty(message = "商家集團編碼列表不能為空")
    private List<String> groupCodes;

    /** 状态: 1=启用 0=停用 (默认启用) */
    private Integer status;
}
