package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.AvatarUpdateRequest;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
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
        authService.throttleUpdateLastActive(username, UPDATE_THROTTLE_MS, checkLastUpdateMap);
    }

    /* ────────────── 头像管理 ────────────── */

    /** 更新当前用户头像 */
    @PutMapping("/avatar")
    public Result<Void> updateAvatar(@Valid @RequestBody AvatarUpdateRequest request) {
        String username = currentUsername();
        if (username == null) return Result.error(ResultCode.UNAUTHORIZED);
        authService.updateAvatar(username, request.getAvatar());
        return Result.success();
    }

    /** 上传头像图片，返回 Base64 Data URL */
    @PostMapping("/avatar/upload")
    public Result<Map<String, String>> uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return Result.error("文件不能为空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return Result.error("仅支持上传图片文件");
        }
        if (file.getSize() > 2 * 1024 * 1024) {
            return Result.error("文件大小不能超过 2MB");
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + contentType + ";base64," + base64;
            return Result.success(Map.of("base64", dataUrl));
        } catch (IOException e) {
            log.error("头像上传失败: {}", e.getMessage());
            return Result.error("头像上传失败");
        }
    }

    /* ────────────── 快捷入口收藏 ────────────── */

    /** 获取当前用户快捷入口 */
    @GetMapping("/quick-favorites")
    public Result<List<String>> getQuickFavorites() {
        String username = currentUsername();
        if (username == null) return Result.error(ResultCode.UNAUTHORIZED);
        return Result.success(authService.getQuickFavorites(username));
    }

    /** 保存当前用户快捷入口 */
    @PutMapping("/quick-favorites")
    public Result<Void> saveQuickFavorites(@RequestBody List<String> keys) {
        String username = currentUsername();
        if (username == null) return Result.error(ResultCode.UNAUTHORIZED);
        String json = keys != null && !keys.isEmpty() ? toJson(keys) : null;
        authService.saveQuickFavorites(username, json);
        return Result.success();
    }

    /**
     * 保存用户选中的在线头像 URL（IconFont 等外部 URL）
     * @param request
     */
    @PutMapping("/avatar-url")
    public Result<Void> saveAvatarUrl(@RequestBody Map<String, String> body, HttpServletRequest httpRequest) {
        String avatarUrl = body.get("avatarUrl");
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return Result.error("Invalid avatar URL");
        }
        String username = currentUsername();
        if (username == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        try {
            authService.saveAvatarUrl(username, avatarUrl);
            return Result.success();
        } catch (Exception e) {
            return Result.error("Failed to save avatar URL: " + e.getMessage());
        }
    }

    /**
     * 获取用户已保存的在线头像 URL
     */
    @GetMapping("/avatar-url")
    public Result<String> getAvatarUrl(HttpServletRequest httpRequest) {
        String username = currentUsername();
        if (username == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        String avatarUrl = authService.getAvatarUrl(username);
        return Result.success(avatarUrl);
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
    }

    private String toJson(List<String> keys) {
        return com.mftb.admin.util.JsonUtils.toJson(keys);
    }
}
