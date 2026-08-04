package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.LoginLogVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysLoginLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.LoginLogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 员工登录日志服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginLogServiceImpl implements LoginLogService {

    private final SysLoginLogMapper loginLogMapper;
    private final SysUserMapper sysUserMapper;

    @Value("${jwt.expiration:86400000}")
    private Long jwtExpiration;

    /** 空闲超时时间（毫秒），与 JwtAuthenticationFilter 保持一致 */
    @Value("${session.idle-timeout:1800000}")
    private Long sessionIdleTimeout;

    @Override
    @Transactional
    public void recordLogin(Long userId, String username, String empId, String employeeName,
                            Long departmentId, String departmentName, HttpServletRequest request) {
        // 先将该用户之前的「在线」记录标记为超时退出
        markUserTimeout(userId);

        // 写入新的登录记录
        SysLoginLog logEntry = new SysLoginLog();
        logEntry.setUserId(userId);
        logEntry.setUsername(username);
        logEntry.setEmpId(empId);
        logEntry.setEmployeeName(employeeName);
        logEntry.setDepartmentId(departmentId);
        logEntry.setDepartmentName(departmentName);
        logEntry.setLoginTime(LocalDateTime.now());
        logEntry.setIpAddress(getClientIp(request));
        logEntry.setUserAgent(truncate(request != null ? request.getHeader("User-Agent") : null, 500));
        loginLogMapper.insert(logEntry);
        log.info("记录登录日志: userId={}, username={}", userId, username);
    }

    @Override
    @Transactional
    public void recordLogout(String username) {
        // 找到该用户最近一条在线记录（logout_time 为 NULL）
        SysLoginLog latestOnline = loginLogMapper.selectOne(
                new LambdaQueryWrapper<SysLoginLog>()
                        .eq(SysLoginLog::getUsername, username)
                        .isNull(SysLoginLog::getLogoutTime)
                        .orderByDesc(SysLoginLog::getLoginTime)
                        .last("LIMIT 1"));
        if (latestOnline != null) {
            latestOnline.setLogoutTime(LocalDateTime.now());
            latestOnline.setLogoutReason("manual");
            loginLogMapper.updateById(latestOnline);
            log.info("记录主动退出: username={}", username);
        }
    }

    @Override
    @Transactional
    public void markTimeoutSessions() {
        // 使用空闲超时阈值标记离线会话（用户无操作超过阈值即视为离线）
        LocalDateTime threshold = LocalDateTime.now().minus(Duration.ofMillis(sessionIdleTimeout));

        // 查找所有在线且最后活跃时间早于阈值的记录
        List<SysLoginLog> staleSessions = loginLogMapper.selectList(
                new LambdaQueryWrapper<SysLoginLog>()
                        .isNull(SysLoginLog::getLogoutTime)
                        .lt(SysLoginLog::getLoginTime, threshold));

        for (SysLoginLog session : staleSessions) {
            session.setLogoutTime(session.getLoginTime().plus(Duration.ofMillis(jwtExpiration)));
            session.setLogoutReason("timeout");
            loginLogMapper.updateById(session);
        }

        if (!staleSessions.isEmpty()) {
            log.info("标记超时退出会话: {} 条", staleSessions.size());
        }
    }

    @Override
    public PageResult<LoginLogVO> list(long page, long size, String keyword, Long departmentId,
                                       String status, LocalDate startDate, LocalDate endDate) {
        // 查询前先标记超时会话
        markTimeoutSessions();

        LambdaQueryWrapper<SysLoginLog> wrapper = new LambdaQueryWrapper<>();

        // 关键词过滤（工号/姓名）
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(SysLoginLog::getEmpId, kw)
                    .or().like(SysLoginLog::getEmployeeName, kw));
        }

        // 部门过滤（精确匹配，前端已处理子部门展开）
        if (departmentId != null) {
            wrapper.eq(SysLoginLog::getDepartmentId, departmentId);
        }

        // 状态过滤
        if (status != null && !status.isBlank()) {
            switch (status) {
                case "online" -> wrapper.isNull(SysLoginLog::getLogoutTime);
                case "manual" -> wrapper.eq(SysLoginLog::getLogoutReason, "manual");
                case "timeout" -> wrapper.eq(SysLoginLog::getLogoutReason, "timeout");
                case "forced" -> wrapper.eq(SysLoginLog::getLogoutReason, "forced");
            }
        }

        // 日期范围过滤
        if (startDate != null) {
            wrapper.ge(SysLoginLog::getLoginTime, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(SysLoginLog::getLoginTime, endDate.plusDays(1).atStartOfDay());
        }

        // 按登录时间倒序
        wrapper.orderByDesc(SysLoginLog::getLoginTime);

        Page<SysLoginLog> pageResult = loginLogMapper.selectPage(new Page<>(page, size), wrapper);

        // 转换为 VO
        LocalDateTime now = LocalDateTime.now();
        List<LoginLogVO> voList = pageResult.getRecords().stream().map(entity -> {
            LoginLogVO vo = new LoginLogVO();
            vo.setId(entity.getId());
            vo.setEmpId(entity.getEmpId());
            vo.setEmployeeName(entity.getEmployeeName());
            vo.setDepartmentId(entity.getDepartmentId());
            vo.setDepartmentName(entity.getDepartmentName());
            vo.setLoginTime(entity.getLoginTime());
            vo.setLogoutTime(entity.getLogoutTime());
            vo.setLogoutReason(entity.getLogoutReason());
            // 计算在线时长
            if (entity.getLogoutTime() != null) {
                vo.setDuration(Duration.between(entity.getLoginTime(), entity.getLogoutTime()).getSeconds());
            } else {
                vo.setDuration(Duration.between(entity.getLoginTime(), now).getSeconds());
            }
            return vo;
        }).toList();

        return new PageResult<>(voList, pageResult.getTotal());
    }

    @Override
    @Transactional
    public void forceLogout(Long loginLogId, String operatorName, String operatorEmpId) {
        // 1. 查询登录日志记录
        SysLoginLog logEntry = loginLogMapper.selectById(loginLogId);
        if (logEntry == null || logEntry.getLogoutTime() != null) {
            throw new RuntimeException("该用户已不在线");
        }

        // 2. 更新登录日志: 标记为强制下线
        logEntry.setLogoutTime(LocalDateTime.now());
        logEntry.setLogoutReason("forced");
        loginLogMapper.updateById(logEntry);

        // 3. 更新 sys_user: 清除 activeToken, 设置强制下线标记
        sysUserMapper.update(null,
                new LambdaUpdateWrapper<SysUser>()
                        .eq(SysUser::getId, logEntry.getUserId())
                        .set(SysUser::getActiveToken, null)
                        .set(SysUser::getForceLogoutOperator, operatorName)
                        .set(SysUser::getForceLogoutEmpId, operatorEmpId)
                        .set(SysUser::getForceLogoutReason, "operator"));

        log.info("强制下线: userId={}, operator={}({})", logEntry.getUserId(), operatorName, operatorEmpId);
    }

    @Override
    @Transactional
    public void deleteById(Long id) {
        SysLoginLog logEntry = loginLogMapper.selectById(id);
        if (logEntry == null) {
            throw new RuntimeException("记录不存在");
        }
        // 在线中的记录不允许直接删除
        if (logEntry.getLogoutTime() == null) {
            throw new RuntimeException("该用户当前在线，请先强制下线后再删除");
        }
        loginLogMapper.deleteById(id);
        log.info("删除登录日志: id={}, empId={}", id, logEntry.getEmpId());
    }

    /** 将用户之前的在线记录标记为超时退出 */
    private void markUserTimeout(Long userId) {
        LocalDateTime now = LocalDateTime.now();
        loginLogMapper.update(null,
                new LambdaUpdateWrapper<SysLoginLog>()
                        .eq(SysLoginLog::getUserId, userId)
                        .isNull(SysLoginLog::getLogoutTime)
                        .set(SysLoginLog::getLogoutTime, now)
                        .set(SysLoginLog::getLogoutReason, "timeout"));
    }

    /** 获取客户端真实IP */
    private String getClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // 多级代理取第一个
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    /** 截断字符串 */
    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}
