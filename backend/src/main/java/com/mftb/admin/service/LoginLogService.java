package com.mftb.admin.service;

import com.mftb.admin.dto.LoginLogVO;
import com.mftb.admin.dto.PageResult;
import jakarta.servlet.http.HttpServletRequest;

import java.time.LocalDate;

/**
 * 员工登录日志服务
 */
public interface LoginLogService {

    /**
     * 记录登录日志
     */
    void recordLogin(Long userId, String username, String empId, String employeeName,
                     Long departmentId, String departmentName, HttpServletRequest request);

    /**
     * 记录主动退出
     */
    void recordLogout(String username);

    /**
     * 检测超时会话并标记
     */
    void markTimeoutSessions();

    /**
     * 分页查询登录日志
     */
    PageResult<LoginLogVO> list(long page, long size, String keyword, Long departmentId,
                                String status, LocalDate startDate, LocalDate endDate);

    /**
     * 强制下线指定用户
     * @param loginLogId 登录日志 ID（在线记录）
     * @param operatorName 操作人姓名
     * @param operatorEmpId 操作人工号
     */
    void forceLogout(Long loginLogId, String operatorName, String operatorEmpId);

    /**
     * 删除登录日志
     * @param id 登录日志 ID
     */
    void deleteById(Long id);
}
