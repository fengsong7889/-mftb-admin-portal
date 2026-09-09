package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 紧急联系人新增/编辑请求
 */
@Data
public class EmergencyContactRequest {

    @NotBlank(message = "联系人姓名不能为空")
    private String name;

    @NotBlank(message = "联系电话不能为空")
    private String phone;

    @NotBlank(message = "关系不能为空")
    private String relation;
}
