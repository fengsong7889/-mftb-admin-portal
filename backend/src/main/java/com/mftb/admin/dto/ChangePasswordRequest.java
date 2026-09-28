package com.mftb.admin.dto;

import com.mftb.admin.util.PasswordPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 修改密码请求（本人自助）
 * <p>目标账号只取当前登录态，不接受前端传入账号，避免越权改密。
 */
@Data
public class ChangePasswordRequest {

    /** 当前密码，服务端按 BCrypt 校验 */
    @NotBlank(message = "當前密碼不能為空")
    private String oldPassword;

    /** 新密码：长度在此兜底拦截，复杂度/弱口令等完整策略由 PasswordPolicy 在服务层裁决 */
    @NotBlank(message = "新密碼不能為空")
    @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_LENGTH,
            message = "新密碼長度需在 8~32 位之間")
    private String newPassword;

    /** 确认新密码：服务端再校验一次，防止绕过前端直接提交 */
    @NotBlank(message = "確認密碼不能為空")
    private String confirmPassword;
}
