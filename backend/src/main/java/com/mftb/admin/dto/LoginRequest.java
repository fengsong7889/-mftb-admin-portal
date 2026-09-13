package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 登录请求参数
 */
@Data
public class LoginRequest {

    @NotBlank(message = "請輸入賬號")
    private String username;

    @NotBlank(message = "請輸入密碼")
    private String password;
}
