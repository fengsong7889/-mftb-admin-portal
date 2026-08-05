package com.mftb.admin.service;

import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 认证服务
 */
public interface AuthService {

    /** 登录 */
    LoginResponse login(LoginRequest request, HttpServletRequest httpRequest);

    /** 获取当前登录用户信息 */
    UserInfoVO getCurrentUser(String username);

    /**
     * 会话状态校验（账号停用 / 强制下线 / 单设备冲突 / 空闲超时）
     * 供 JwtAuthenticationFilter 和 AuthController.check 共用
     *
     * @param token    当前请求的 JWT Token
     * @param username 登录账号
     * @param user     用户实体（Filter 已查询则传入，否则内部查询）
     */
    SessionCheckResult checkSession(String token, String username, SysUser user);
}
