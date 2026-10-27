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

    /** 滑块安全验证 Token（连续失败达到阈值后必填，一次性使用） */
    private String captchaToken;
}
