package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
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
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    /** 活跃时间更新节流间隔（毫秒），默认 5 分钟，避免每次请求都写库 */
    private static final long UPDATE_THROTTLE_MS = 5 * 60 * 1000L;

    /** 每个用户上次更新 last_active_at 的时间戳（内存节流） */
    private final ConcurrentHashMap<String, Long> lastUpdateMap = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // /api/auth/check 由 Controller 自行校验，跳过 Filter 的冲突检测
        if ("/api/auth/check".equals(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = resolveToken(request);
        if (StringUtils.hasText(token) && jwtUtil.validateToken(token)) {
            String username = jwtUtil.getUsername(token);

            // 查询用户信息（用于会话校验和 SecurityContext 缓存）
            SysUser user = sysUserMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                            .eq(SysUser::getUsername, username));

            // 复用 AuthService 公共会话校验
            SessionCheckResult check = authService.checkSession(token, username, user);
            if (!check.isPassed()) {
                writeSessionCheckResponse(response, check);
                return;
            }

            // 认证通过，写入 SecurityContext
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            username, null,
                            Collections.singletonList(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER")));
            // 将用户实体存入 details，供 OperatorResolver 等下游复用，避免重复查库
            authentication.setDetails(user);
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // 节流更新 last_active_at（每 5 分钟最多写库一次）
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

    /** 根据 SessionCheckResult 写入统一的 JSON 响应 */
    private void writeSessionCheckResponse(HttpServletResponse response, SessionCheckResult check) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        Result<?> result = check.getData() != null
                ? new Result<>(check.getCode(), check.getMessage(), check.getData())
                : Result.error(check.getCode(), check.getMessage());
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
