package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.util.JwtUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * 认证接口
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginLogService loginLogService;
    private final JwtUtil jwtUtil;
    private final SysUserMapper sysUserMapper;

    /** 登录 */
    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return Result.success("登录成功", authService.login(request, httpRequest));
    }

    /** 登出 */
    @PostMapping("/logout")
    public Result<Void> logout(HttpServletRequest request) {
        // 记录主动退出
        try {
            String username = null;
            // 优先从 SecurityContext 获取用户名
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getName() != null
                    && !"anonymousUser".equals(authentication.getName())) {
                username = authentication.getName();
            }
            // Fallback: 直接从 JWT Token 解析用户名（防止 Filter 未设置 SecurityContext 的情况）
            if (username == null) {
                String header = request.getHeader("Authorization");
                if (header != null && header.startsWith("Bearer ")) {
                    String token = header.substring(7);
                    username = jwtUtil.getUsername(token);
                }
            }
            if (username != null) {
                loginLogService.recordLogout(username);
            }
        } catch (Exception e) {
            // 日志记录失败不影响登出流程
        }
        return Result.success();
    }

    /** 获取当前登录用户信息 */
    @GetMapping("/info")
    public Result<UserInfoVO> info() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        return Result.success(authService.getCurrentUser(authentication.getName()));
    }

    /**
     * 轻量级会话状态检查（供前端轮询）
     * 不经过 JWT Filter 的冲突检测，由本方法自行校验，
     * 返回具体异常原因以便前端主动弹窗提醒。
     */
    @GetMapping("/check")
    public Result<?> check(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        String token = header.substring(7);
        if (!jwtUtil.validateToken(token)) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        String username = jwtUtil.getUsername(token);
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        // 账号停用
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error(ResultCode.ACCOUNT_DISABLED);
        }
        // 被管理员强制下线
        if (user.getForceLogoutOperator() != null) {
            return Result.error(401, "您的账号已被管理员强制下线");
        }
        // 被其他设备登录顶下线：返回新登录设备的 IP
        if (StringUtils.hasText(user.getActiveToken()) && !token.equals(user.getActiveToken())) {
            if ("account_disabled".equals(user.getForceLogoutReason())) {
                return Result.error(ResultCode.ACCOUNT_DISABLED);
            }
            Map<String, String> data = new HashMap<>();
            data.put("loginIp", user.getActiveLoginIp() != null ? user.getActiveLoginIp() : "");
            return new Result<>(401, "您的账号已在其他设备登录", data);
        }
        return Result.success();
    }
}
