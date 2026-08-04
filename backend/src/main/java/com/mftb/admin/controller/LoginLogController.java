package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.LoginLogVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.LoginLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 员工动态（登录日志）接口
 */
@RestController
@RequestMapping("/api/login-logs")
@RequiredArgsConstructor
public class LoginLogController {

    private final LoginLogService loginLogService;
    private final SysUserMapper sysUserMapper;

    /** 分页查询登录日志 */
    @GetMapping
    public Result<PageResult<LoginLogVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return Result.success(loginLogService.list(page, size, keyword, departmentId, status, startDate, endDate));
    }

    /** 强制下线指定用户 */
    @PostMapping("/{id}/force-logout")
    public Result<Void> forceLogout(@PathVariable Long id) {
        // 获取当前操作人信息
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();
        SysUser operator = sysUserMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, username));
        if (operator == null) {
            return Result.error("操作人信息不存在");
        }
        try {
            loginLogService.forceLogout(id, operator.getName(), operator.getEmpId());
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /** 删除登录日志 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        try {
            loginLogService.deleteById(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
