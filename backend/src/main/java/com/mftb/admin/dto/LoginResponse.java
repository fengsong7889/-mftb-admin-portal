package com.mftb.admin.dto;

import lombok.Data;

/**
 * 登录响应
 */
@Data
public class LoginResponse {

    /** JWT Token */
    private String token;

    /** 用户信息 */
    private UserInfoVO userInfo;

    public LoginResponse(String token, UserInfoVO userInfo) {
        this.token = token;
        this.userInfo = userInfo;
    }
}
