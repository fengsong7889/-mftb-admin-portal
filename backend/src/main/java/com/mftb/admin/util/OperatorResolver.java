package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 当前操作人解析器: 从 SecurityContext 获取登录账号并解析显示姓名
 */
@Component
@RequiredArgsConstructor
public class OperatorResolver {

    private final SysUserMapper sysUserMapper;
    private final SysRoleMapper sysRoleMapper;

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

    /** 当前登录用户实体, 未登录返回 null */
    public SysUser currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        String username = String.valueOf(authentication.getPrincipal());
        return sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
    }

    /** 审批中心展示用签名: 姓名(工号), 无工号时仅姓名 */
    public String operatorSignature(SysUser user) {
        if (user == null) {
            return null;
        }
        String name = StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
        return StringUtils.hasText(user.getEmpId()) ? name + "(" + user.getEmpId() + ")" : name;
    }

    /** 用户绑定的功能角色编码集合(仅启用状态角色) */
    public Set<String> functionRoleCodes(SysUser user) {
        if (user == null) {
            return Collections.emptySet();
        }
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        if (roleIds.isEmpty()) {
            return Collections.emptySet();
        }
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>()
                        .in(SysRole::getId, roleIds)
                        .eq(SysRole::getStatus, 1));
        return roles.stream()
                .map(SysRole::getCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(HashSet::new));
    }

    /** 是否为超级管理员(可审批所有节点兜底) */
    public boolean isAdmin(SysUser user) {
        return user != null && "admin".equals(user.getRole());
    }
}
