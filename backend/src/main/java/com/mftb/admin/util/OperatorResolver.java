package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 当前操作人解析器: 从 SecurityContext 获取登录账号并解析显示姓名
 */
@Component
@RequiredArgsConstructor
public class OperatorResolver {

    private final SysUserMapper sysUserMapper;

    /** 当前登录人显示名: 优先姓名, 无姓名时回退登录账号 */
    public String currentOperatorName() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        String username = String.valueOf(authentication.getPrincipal());
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        return user != null && StringUtils.hasText(user.getName()) ? user.getName() : username;
    }
}
