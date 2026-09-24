package com.mftb.admin.service;

import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;

/**
 * 认证服务
 */
public interface AuthService {

    /** 登录 */
    LoginResponse login(LoginRequest request, HttpServletRequest httpRequest);

    /** 获取当前登录用户信息 */
    UserInfoVO getCurrentUser(String username);

    /** 会话状态校验（账号停用 / 强制下线 / 单设备冲突 / 空闲超时）
     * 供 JwtAuthenticationFilter 和 AuthController.check 共用
     *
     * @param token    当前请求的 JWT Token
     * @param username 登录账号
     * @param user     用户实体（Filter 已查询则传入，否则内部查询）
     */
    SessionCheckResult checkSession(String token, String username, SysUser user);

    /**
     * 服务端撤销会话（Round 5 · 统一登出）。
     * <p>仅当 {@code sys_user.active_token} 与传入的 presentingToken 完全一致时才写 NULL，
     * 避免旧标签页里的延迟 logout 误伤新登录刚拿到的新会话（新会话会先写 active_token）。
     * <p>撤销后旧 token 下次请求会命中 {@link #checkSession} 中新增的"active_token 为空 → 会话已失效" 分支，
     * 不再像旧实现那样允许已登出的 JWT 继续存活到自然过期。
     */
    void revokeActiveToken(String username, String presentingToken);

    /** 节流更新用户最后活跃时间 */
    void throttleUpdateLastActive(String username, long throttleMs, java.util.concurrent.ConcurrentHashMap<String, Long> cache);

    /** 更新用户头像 */
    void updateAvatar(String username, String avatar);

    /** 获取用户快捷入口 */
    List<String> getQuickFavorites(String username);

    /** 保存用户快捷入口 */
    void saveQuickFavorites(String username, String json);

    /** 保存用户在线头像 URL（含 fallback） */
    void saveAvatarUrl(String username, String avatarUrl);

    /** 获取用户在线头像 URL（含 fallback） */
    String getAvatarUrl(String username);

    /** 根据用户名查询用户实体 */
    SysUser findByUsername(String username);
}
