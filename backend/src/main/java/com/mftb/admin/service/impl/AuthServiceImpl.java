package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.util.JwtUtil;
import com.mftb.admin.util.NetworkUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 认证服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final RoleService roleService;
    private final DepartmentService departmentService;
    private final LoginLogService loginLogService;

    /** 空闲超时时间（毫秒），与 JwtAuthenticationFilter 保持一致 */
    @Value("${session.idle-timeout:3600000}")
    private long idleTimeout;

    /** 登录失败频率限制: 同一账号 15 分钟内最多 5 次失败 */
    private static final int MAX_LOGIN_ATTEMPTS = 5;
    private static final long LOCK_DURATION_MS = 15 * 60 * 1000L;
    private final ConcurrentHashMap<String, LoginAttempt> loginAttemptMap = new ConcurrentHashMap<>();

    /** 登录失败记录 */
    private static final class LoginAttempt {
        final AtomicInteger count = new AtomicInteger(0);
        volatile long firstFailTime;
    }

    @Override
    public LoginResponse login(LoginRequest request, jakarta.servlet.http.HttpServletRequest httpRequest) {
        // 登录频率限制校验
        checkLoginRateLimit(request.getUsername());

        // 查询用户
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, request.getUsername()));
        if (user == null) {
            recordLoginFailure(request.getUsername());
            throw new BusinessException(ResultCode.ACCOUNT_NOT_EXIST);
        }
        // 校验密码
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            recordLoginFailure(request.getUsername());
            throw new BusinessException(ResultCode.LOGIN_ERROR);
        }
        // 校验状态
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ResultCode.ACCOUNT_DISABLED);
        }
        // 登录成功，清除失败记录
        loginAttemptMap.remove(request.getUsername());
        // 生成 Token
        String token = jwtUtil.generateToken(user.getId(), user.getUsername());
        // 提取客户端 IP（兼容代理）
        String clientIp = NetworkUtils.getClientIp(httpRequest);
        // 保存活跃 Token + 初始化最后活跃时间（单设备登录 & 空闲超时检测用）
        sysUserMapper.update(null,
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<SysUser>()
                        .eq(SysUser::getId, user.getId())
                        .set(SysUser::getActiveToken, token)
                        .set(SysUser::getActiveLoginIp, clientIp)
                        .set(SysUser::getLastActiveAt, LocalDateTime.now())
                        // 清除可能存在的强制下线标记
                        .set(SysUser::getForceLogoutOperator, null)
                        .set(SysUser::getForceLogoutEmpId, null)
                        .set(SysUser::getForceLogoutReason, null));
        // 记录登录日志
        try {
            loginLogService.recordLogin(user.getId(), user.getUsername(), user.getEmpId(),
                    user.getName(), user.getDepartmentId(), user.getDepartment(), httpRequest);
        } catch (Exception e) {
            // 日志记录失败不影响登录流程
            log.warn("记录登录日志失败: {}", e.getMessage());
        }
        return new LoginResponse(token, buildUserInfo(user));
    }

    @Override
    public UserInfoVO getCurrentUser(String username) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            throw new BusinessException(ResultCode.ACCOUNT_NOT_EXIST);
        }
        return buildUserInfo(user);
    }

    @Override
    public SessionCheckResult checkSession(String token, String username, SysUser user) {
        if (user == null) {
            user = sysUserMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        }
        if (user == null) {
            return SessionCheckResult.fail(ResultCode.UNAUTHORIZED.getCode(), "账号不存在", null);
        }
        // 账号停用
        if (user.getStatus() != null && user.getStatus() == 0) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reason", "ACCOUNT_DISABLED");
            return SessionCheckResult.fail(401, "您的账号已被停用，请联系管理员", data);
        }
        // 强制下线
        if (user.getForceLogoutOperator() != null) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reason", "FORCE_LOGOUT");
            data.put("operatorName", user.getForceLogoutOperator());
            data.put("operatorEmpId", user.getForceLogoutEmpId());
            return SessionCheckResult.fail(401, "您的账号已被管理员强制下线", data);
        }
        // 单设备登录冲突
        if (user.getActiveToken() != null && !token.equals(user.getActiveToken())) {
            if ("account_disabled".equals(user.getForceLogoutReason())) {
                return SessionCheckResult.fail(ResultCode.ACCOUNT_DISABLED.getCode(), "账号已被停用", null);
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reason", "SESSION_CONFLICT");
            data.put("loginIp", user.getActiveLoginIp() != null ? user.getActiveLoginIp() : "");
            data.put("loginLocation", "");
            return SessionCheckResult.fail(401, "您的账号已在其他设备登录", data);
        }
        // 空闲超时
        if (user.getLastActiveAt() != null) {
            long idleMs = java.time.Duration.between(user.getLastActiveAt(), LocalDateTime.now()).toMillis();
            if (idleMs > idleTimeout) {
                return SessionCheckResult.fail(ResultCode.SESSION_IDLE_TIMEOUT.getCode(), "您已长时间未操作，会话已过期", null);
            }
        }
        return SessionCheckResult.ok();
    }

    /** 构建用户信息: 合并「绑定角色」与「所在部门」授权的菜单权限 */
    private UserInfoVO buildUserInfo(SysUser user) {
        UserInfoVO vo = UserInfoVO.from(user);
        List<MenuPermissionDTO> rolePerms = roleService.mergePermissions(vo.getFunctionRoleIds());
        List<MenuPermissionDTO> deptPerms = departmentService.permissionsOf(user.getDepartmentId());
        vo.setPermissions(mergePermissionLists(rolePerms, deptPerms));
        // 下发角色编码，供前端审批流程校验节点权限
        vo.setFunctionRoleCodes(roleService.codesOf(vo.getFunctionRoleIds()));
        return vo;
    }

    /** 按 menuKey 合并多个权限列表的操作集合 */
    @SafeVarargs
    private static List<MenuPermissionDTO> mergePermissionLists(List<MenuPermissionDTO>... lists) {
        Map<String, Set<String>> merged = new LinkedHashMap<>();
        for (List<MenuPermissionDTO> list : lists) {
            if (list == null) {
                continue;
            }
            for (MenuPermissionDTO perm : list) {
                merged.computeIfAbsent(perm.getMenuKey(), k -> new LinkedHashSet<>())
                        .addAll(perm.getActions() == null ? List.of() : perm.getActions());
            }
        }
        List<MenuPermissionDTO> result = new ArrayList<>();
        merged.forEach((menuKey, actions) -> {
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey(menuKey);
            dto.setActions(new ArrayList<>(actions));
            result.add(dto);
        });
        return result;
    }

    /** 登录频率限制: 检查是否超过最大失败次数 */
    private void checkLoginRateLimit(String username) {
        LoginAttempt attempt = loginAttemptMap.get(username);
        if (attempt == null) {
            return;
        }
        long elapsed = System.currentTimeMillis() - attempt.firstFailTime;
        if (elapsed > LOCK_DURATION_MS) {
            // 超过锁定时间窗口，重置计数
            loginAttemptMap.remove(username);
            return;
        }
        if (attempt.count.get() >= MAX_LOGIN_ATTEMPTS) {
            long remainMinutes = (LOCK_DURATION_MS - elapsed) / 60000 + 1;
            throw new BusinessException("登录失败次数过多，请 " + remainMinutes + " 分钟后再试");
        }
    }

    /** 记录登录失败 */
    private void recordLoginFailure(String username) {
        loginAttemptMap.compute(username, (key, existing) -> {
            long now = System.currentTimeMillis();
            if (existing == null || (now - existing.firstFailTime) > LOCK_DURATION_MS) {
                LoginAttempt attempt = new LoginAttempt();
                attempt.firstFailTime = now;
                attempt.count.set(1);
                return attempt;
            }
            existing.count.incrementAndGet();
            return existing;
        });
        // 定期清理过期条目，防止内存泄漏
        if (loginAttemptMap.size() > 200) {
            long threshold = System.currentTimeMillis() - LOCK_DURATION_MS;
            loginAttemptMap.entrySet().removeIf(e -> e.getValue().firstFailTime < threshold);
        }
    }
}
