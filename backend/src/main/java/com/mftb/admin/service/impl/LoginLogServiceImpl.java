package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.LoginLogVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysLoginLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.LoginLogService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.NetworkUtils;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 员工登录日志服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginLogServiceImpl implements LoginLogService {

    private final SysLoginLogMapper loginLogMapper;
    private final SysUserMapper sysUserMapper;
    private final SysConfigService sysConfigService;

    @Override
    @Transactional
    public void recordLogin(Long userId, String username, String empId, String employeeName,
                            Long departmentId, String departmentName, HttpServletRequest request) {
        // 先将该用户之前的「在线」记录标记为超时退出
        markTimeout(userId);

        // 写入新的登录记录
        SysLoginLog logEntry = new SysLoginLog();
        logEntry.setUserId(userId);
        logEntry.setUsername(username);
        logEntry.setEmpId(empId);
        logEntry.setEmployeeName(employeeName);
        logEntry.setDepartmentId(departmentId);
        logEntry.setDepartmentName(departmentName);
        logEntry.setLoginTime(LocalDateTime.now());
        logEntry.setIpAddress(NetworkUtils.getClientIp(request));
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
    @Scheduled(fixedRate = 60000) // 每 60 秒执行一次，由定时任务驱动而非每次请求触发
    public void markTimeoutSessions() {
        // 使用空闲超时阈值标记离线会话（从 DB 动态读取管理员配置的值）
        LocalDateTime threshold = LocalDateTime.now().minus(Duration.ofMillis(sysConfigService.getSessionIdleTimeoutMs()));

        // 查找所有在线记录（logoutTime 为 NULL）
        List<SysLoginLog> onlineSessions = loginLogMapper.selectList(
                new LambdaQueryWrapper<SysLoginLog>()
                        .isNull(SysLoginLog::getLogoutTime));

        if (onlineSessions.isEmpty()) {
            return;
        }

        // 批量加载所有相关用户，避免 N+1 查询
        Set<Long> userIds = onlineSessions.stream()
                .map(SysLoginLog::getUserId)
                .collect(Collectors.toSet());
        Map<Long, SysUser> userMap = sysUserMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(SysUser::getId, Function.identity(), (a, b) -> a));

        int marked = 0;
        for (SysLoginLog session : onlineSessions) {
            SysUser user = userMap.get(session.getUserId());
            if (user == null) {
                // 用户不存在，直接标记超时
                session.setLogoutTime(LocalDateTime.now());
                session.setLogoutReason("timeout");
                loginLogMapper.updateById(session);
                marked++;
                continue;
            }

            // 判断用户是否仍然活跃：lastActiveAt 在阈值之内说明用户仍在操作
            if (user.getLastActiveAt() != null && user.getLastActiveAt().isAfter(threshold)) {
                continue;
            }

            // 用户确实已不活跃，标记为超时退出
            LocalDateTime actualTimeout = user.getLastActiveAt() != null
                    ? user.getLastActiveAt().plus(Duration.ofMillis(sysConfigService.getSessionIdleTimeoutMs()))
                    : session.getLoginTime().plus(Duration.ofMillis(sysConfigService.getSessionIdleTimeoutMs()));
            session.setLogoutTime(actualTimeout);
            session.setLogoutReason("timeout");
            loginLogMapper.updateById(session);
            marked++;
        }

        if (marked > 0) {
            log.info("标记超时退出会话: {} 条", marked);
        }
    }

    @Override
    public PageResult<LoginLogVO> list(long page, long size, String keyword, Long departmentId,
                                       String status, LocalDate startDate, LocalDate endDate) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
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
            throw new BusinessException("该用户已不在线");
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
            throw new BusinessException("记录不存在");
        }
        // 在线中的记录不允许直接删除
        if (logEntry.getLogoutTime() == null) {
            throw new BusinessException("该用户当前在线，请先强制下线后再删除");
        }
        loginLogMapper.deleteById(id);
        log.info("删除登录日志: id={}, empId={}", id, logEntry.getEmpId());
    }

    /** 将用户之前的在线记录标记为超时退出 */
    private void markTimeout(Long userId) {
        LocalDateTime now = LocalDateTime.now();
        loginLogMapper.update(null,
                new LambdaUpdateWrapper<SysLoginLog>()
                        .eq(SysLoginLog::getUserId, userId)
                        .isNull(SysLoginLog::getLogoutTime)
                        .set(SysLoginLog::getLogoutTime, now)
                        .set(SysLoginLog::getLogoutReason, "timeout"));
    }

    /** 截断字符串 */
    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}
