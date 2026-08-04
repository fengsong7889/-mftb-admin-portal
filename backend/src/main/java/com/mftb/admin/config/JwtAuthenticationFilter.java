package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JWT 认证过滤器: 每次请求校验 Token、检测空闲超时、节流更新最后活跃时间
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final SysUserMapper sysUserMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    /** 空闲超时时间（毫秒），默认 30 分钟 */
    @Value("${session.idle-timeout:1800000}")
    private long idleTimeout;

    /** 活跃时间更新节流间隔（毫秒），默认 5 分钟，避免每次请求都写库 */
    private static final long UPDATE_THROTTLE_MS = 5 * 60 * 1000L;

    /** 每个用户上次更新 last_active_at 的时间戳（内存节流） */
    private final ConcurrentHashMap<String, Long> lastUpdateMap = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = resolveToken(request);
        if (StringUtils.hasText(token) && jwtUtil.validateToken(token)) {
            String username = jwtUtil.getUsername(token);

            // ── 查询用户信息 ──
            SysUser user = sysUserMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>()
                            .eq(SysUser::getUsername, username));

            if (user != null) {
                // ── 账号停用检测: 账号被停用但 Token 仍存在 ──
                if (user.getStatus() != null && user.getStatus() == 0) {
                    writeAccountDisabledResponse(response);
                    return;
                }

                // ── 强制下线标记检测（独立于 activeToken，因为强制下线会将 activeToken 置为 null）──
                if (user.getForceLogoutOperator() != null) {
                    // 被管理员强制下线 → 返回操作人信息
                    writeForceLogoutResponse(response, user.getForceLogoutOperator(), user.getForceLogoutEmpId());
                    return;
                }

                // ── 单设备登录校验: 检查 Token 是否为当前活跃 Token ──
                if (user.getActiveToken() != null && !token.equals(user.getActiveToken())) {
                    if ("account_disabled".equals(user.getForceLogoutReason())) {
                        // 账号被停用 → 返回 ACCOUNT_DISABLED
                        writeAccountDisabledResponse(response);
                        return;
                    } else {
                        // 被其他设备登录顶下线 → 返回 SESSION_CONFLICT
                        writeSessionConflictResponse(response, user.getActiveLoginIp());
                        return;
                    }
                }

                // ── 空闲超时检测 ──
                if (user.getLastActiveAt() != null) {
                    long idleMs = java.time.Duration.between(user.getLastActiveAt(), LocalDateTime.now()).toMillis();
                    if (idleMs > idleTimeout) {
                        // 空闲超时 → 返回 1004，前端触发登出
                        writeIdleTimeoutResponse(response);
                        return;
                    }
                }
            }

            // ── 认证通过，写入 SecurityContext ──
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            username, null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER")));
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // ── 节流更新 last_active_at（每 5 分钟最多写库一次）──
            throttleUpdateLastActive(username);
        }
        filterChain.doFilter(request, response);
    }

    /**
     * 节流更新用户最后活跃时间:
     * 同一用户每 5 分钟最多更新一次数据库，减少 DB 写入压力。
     * 定期清理过期条目，防止内存泄漏。
     */
    private void throttleUpdateLastActive(String username) {
        long now = System.currentTimeMillis();
        Long lastUpdate = lastUpdateMap.get(username);
        if (lastUpdate == null || now - lastUpdate > UPDATE_THROTTLE_MS) {
            sysUserMapper.update(null,
                    new LambdaUpdateWrapper<SysUser>()
                            .eq(SysUser::getUsername, username)
                            .set(SysUser::getLastActiveAt, LocalDateTime.now()));
            lastUpdateMap.put(username, now);
        }
        // 每 1000 次操作清理一次过期条目（用户名已不活跃的）
        if (lastUpdateMap.size() > 500) {
            long threshold = now - UPDATE_THROTTLE_MS * 2;
            lastUpdateMap.entrySet().removeIf(e -> e.getValue() < threshold);
        }
    }

    /** 返回空闲超时响应（HTTP 200 + 业务码 1004） */
    private void writeIdleTimeoutResponse(HttpServletResponse response) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        Result<Void> result = Result.error(ResultCode.SESSION_IDLE_TIMEOUT);
        response.getWriter().write(objectMapper.writeValueAsString(result));
    }

    /** 返回账号被停用响应（HTTP 200 + 业务码 401 + ACCOUNT_DISABLED 原因） */
    private void writeAccountDisabledResponse(HttpServletResponse response) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        java.util.Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("reason", "ACCOUNT_DISABLED");
        Result<java.util.Map<String, Object>> result = new Result<>(401, "您的账号已被停用，请联系管理员", data);
        response.getWriter().write(objectMapper.writeValueAsString(result));
    }

    /** 返回被强制下线响应（HTTP 200 + 业务码 401 + FORCE_LOGOUT 原因） */
    private void writeForceLogoutResponse(HttpServletResponse response, String operatorName, String operatorEmpId) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        // 构建包含操作人信息的响应
        java.util.Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("reason", "FORCE_LOGOUT");
        data.put("operatorName", operatorName);
        data.put("operatorEmpId", operatorEmpId);
        Result<java.util.Map<String, Object>> result = new Result<>(401, "您的账号已被管理员强制下线", data);
        response.getWriter().write(objectMapper.writeValueAsString(result));
    }

    /** 返回被顶下线响应（HTTP 200 + 业务码 401 + SESSION_CONFLICT 原因） */
    private void writeSessionConflictResponse(HttpServletResponse response, String loginIp) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        java.util.Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("reason", "SESSION_CONFLICT");
        data.put("loginIp", loginIp != null ? loginIp : "");
        data.put("loginLocation", ""); // 预留: 后续可接入 IP 地理位置库
        Result<java.util.Map<String, Object>> result = new Result<>(401, "您的账号已在其他设备登录", data);
        response.getWriter().write(objectMapper.writeValueAsString(result));
    }

    /** 从请求头解析 Token */
    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader(HEADER);
        if (StringUtils.hasText(bearer) && bearer.startsWith(PREFIX)) {
            return bearer.substring(PREFIX.length());
        }
        return null;
    }
}
