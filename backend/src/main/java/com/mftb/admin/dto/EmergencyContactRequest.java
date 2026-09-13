package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 紧急联系人新增/编辑请求
 */
@Data
public class EmergencyContactRequest {

    @NotBlank(message = "聯繫人姓名不能為空")
    private String name;

    @NotBlank(message = "聯繫電話不能為空")
    private String phone;

    @NotBlank(message = "關係不能為空")
    private String relation;
}
