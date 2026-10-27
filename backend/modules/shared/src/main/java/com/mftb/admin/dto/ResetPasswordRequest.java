package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 重置密码请求
 */
@Data
public class ResetPasswordRequest {

    @NotBlank(message = "密碼不能為空")
    @Size(min = 6, max = 32, message = "密碼長度需在 6~32 位之間")
    private String password;
}
