package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.AvatarUpdateRequest;
import com.mftb.admin.dto.AvatarUrlDTO;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.service.CaptchaService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.util.FileValidator;
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
    private final CaptchaService captchaService;

    /** 活跃时间更新节流间隔（毫秒），与 JwtAuthenticationFilter 保持一致 5 分钟 */
    private static final long UPDATE_THROTTLE_MS = 5 * 60 * 1000L;
    /** 每个用户上次更新 last_active_at 的时间戳（内存节流） */
    private final ConcurrentHashMap<String, Long> checkLastUpdateMap = new ConcurrentHashMap<>();

    /** 登录 */
    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return Result.success("登錄成功", authService.login(request, httpRequest));
    }

    /** 签发滑块安全验证 Token（5 分钟有效，一次性使用，登录时随 captchaToken 提交） */
    @GetMapping("/captcha")
    public Result<Map<String, Object>> issueCaptchaToken() {
        return Result.success(Map.of(
                "token", captchaService.issueToken(),
                "expireSeconds", 300));
    }

    /** 登出 */
    @PostMapping("/logout")
    public Result<Void> logout(HttpServletRequest request) {
        // 提取 username + token，同时完成：
        //  1. 服务端撤销会话（清 active_token，旧 JWT 下次请求直接 401）
        //  2. 写登出日志（与旧行为一致，不阻断主流程）
        String username = null;
        String presentingToken = null;
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            presentingToken = header.substring(7);
        }
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getName() != null
                    && !"anonymousUser".equals(authentication.getName())) {
                username = authentication.getName();
            }
        } catch (Exception ignore) { /* SecurityContext 不可用时回退 JWT 解析 */ }
        if (username == null && presentingToken != null) {
            username = jwtUtil.getUsername(presentingToken);
        }
        // 1. 服务端撤销：失败不阻断日志写入，也不影响前端本地登出
        if (username != null && presentingToken != null) {
            try {
                authService.revokeActiveToken(username, presentingToken);
            } catch (Exception e) {
                log.warn("服务端撤销会话失败: {}", e.getMessage());
            }
        }
        // 2. 登出日志
        if (username != null) {
            try {
                loginLogService.recordLogout(username);
            } catch (Exception e) {
                log.warn("记录登出日志失败: {}", e.getMessage());
            }
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
            return Result.error("文件不能為空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return Result.error("僅支持上傳圖片文件");
        }
        if (file.getSize() > 2 * 1024 * 1024) {
            return Result.error("文件大小不能超過 2MB");
        }
        // Magic bytes 校验：防止伪造 Content-Type 的恶意文件
        String magicError = FileValidator.validateImageMagicBytes(file);
        if (magicError != null) {
            return Result.error(magicError);
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + contentType + ";base64," + base64;
            return Result.success(Map.of("base64", dataUrl));
        } catch (IOException e) {
            log.error("头像上传失败: {}", e.getMessage());
            return Result.error("頭像上傳失敗");
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
    public Result<Void> saveAvatarUrl(@RequestBody AvatarUrlDTO dto, HttpServletRequest httpRequest) {
        String avatarUrl = dto.getAvatarUrl();
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return Result.error("頭像URL不能為空");
        }
        // 安全校验: 仅允许 http/https 协议，禁止 javascript:/file://data: 等危险协议
        String trimmed = avatarUrl.trim();
        if (trimmed.length() > 500) {
            return Result.error("頭像URL長度超出限制");
        }
        if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
            return Result.error("頭像URL僅支持 http/https 協議");
        }
        String username = currentUsername();
        if (username == null) {
            return Result.error(ResultCode.UNAUTHORIZED);
        }
        try {
            authService.saveAvatarUrl(username, trimmed);
            return Result.success();
        } catch (Exception e) {
            log.error("保存头像URL失败: {}", e.getMessage());
            return Result.error("保存頭像URL失敗，請稍後重試");
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
