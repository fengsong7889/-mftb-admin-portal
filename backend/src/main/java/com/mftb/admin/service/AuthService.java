package com.mftb.admin.service;

import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.UserInfoVO;

/**
 * 认证服务
 */
public interface AuthService {

    /** 登录 */
    LoginResponse login(LoginRequest request);

    /** 获取当前登录用户信息 */
    UserInfoVO getCurrentUser(String username);
}
