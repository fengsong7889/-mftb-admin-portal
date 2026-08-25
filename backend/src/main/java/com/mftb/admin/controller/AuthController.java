package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 认证接口
 */
@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginLogService loginLogService;
    private final JwtUtil jwtUtil;
    private final SysUserMapper sysUserMapper;

    /** 活跃时间更新节流间隔（毫秒），与 JwtAuthenticationFilter 保持一致 5 分钟 */
    private static final long UPDATE_THROTTLE_MS = 5 * 60 * 1000L;
    /** 每个用户上次更新 last_active_at 的时间戳（内存节流） */
    private final ConcurrentHashMap<String, Long> checkLastUpdateMap = new ConcurrentHashMap<>();

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
            log.warn("记录登出日志失败: {}", e.getMessage());
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
     * 复用 AuthService.checkSession 公共校验逻辑
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
        SessionCheckResult check = authService.checkSession(token, username, null);
        if (!check.isPassed()) {
            return check.getData() != null
                    ? new Result<>(check.getCode(), check.getMessage(), check.getData())
                    : Result.error(check.getCode(), check.getMessage());
        }
        // 会话正常 → 节流更新 last_active_at（前端轮询也代表用户在线）
        throttleUpdateLastActive(username);
        return Result.success();
    }

    /**
     * 节流更新用户最后活跃时间:
     * 同一用户每 5 分钟最多更新一次数据库，与 JwtAuthenticationFilter 逻辑一致。
     * 前端 /api/auth/check 轮询跳过了 Filter，需在此处补充更新。
     */
    private void throttleUpdateLastActive(String username) {
        long now = System.currentTimeMillis();
        Long lastUpdate = checkLastUpdateMap.get(username);
        if (lastUpdate == null || now - lastUpdate > UPDATE_THROTTLE_MS) {
            sysUserMapper.update(null,
                    new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<SysUser>()
                            .eq(SysUser::getUsername, username)
                            .set(SysUser::getLastActiveAt, LocalDateTime.now()));
            checkLastUpdateMap.put(username, now);
        }
        if (checkLastUpdateMap.size() > 500) {
            long threshold = now - UPDATE_THROTTLE_MS * 2;
            checkLastUpdateMap.entrySet().removeIf(e -> e.getValue() < threshold);
        }
    }
}
