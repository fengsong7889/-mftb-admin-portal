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

import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
        SysUser user = currentUser();
        return user != null && StringUtils.hasText(user.getName()) ? user.getName() : extractUsername();
    }

    /** 当前登录用户实体, 未登录返回 null（优先复用 Filter 已查的缓存，避免重复查库） */
    public SysUser currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        // 优先从 details 获取 JwtAuthenticationFilter 已缓存的用户实体
        if (authentication.getDetails() instanceof SysUser cached) {
            return cached;
        }
        String username = String.valueOf(authentication.getPrincipal());
        return sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
    }

    /** 从 SecurityContext 提取登录账号 */
    private String extractUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        return String.valueOf(authentication.getPrincipal());
    }

    /** 审批中心展示用签名: 姓名(工号), 无工号时仅姓名 */
    public String operatorSignature(SysUser user) {
        if (user == null) {
            return null;
        }
        String name = StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
        return StringUtils.hasText(user.getEmpId()) ? name + "(" + user.getEmpId() + ")" : name;
    }

    /**
     * 按用户 ID 批量解析展示签名「姓名(工号)」，返回顺序与入参去重后的顺序一致。
     *
     * <p>为什么放在本类而不是各服务自己查 sys_user：本类已持有 SysUserMapper，且
     * {@link #operatorSignature(SysUser)} 就是审批中心的拼接口径，再写一份必然漂移。
     *
     * <p>一次 IN 查询，禁止逐 id 回查：单据的人员字段动辄十几个，N+1 会直接拖慢详情首屏。
     *
     * <p>只取展示必需的 id/name/username/empId 四列，不得在这里顺手带出部门/职位/职级——
     * 调用方多是选人、展示人员的业务页，多给一列就会被拼进界面文案。
     *
     * @param ids 用户 ID 集合（可含 null/重复，内部去重）；空集合返回空列表
     * @return 展示签名列表；库中查不到的 id 直接跳过（宁可不显示，也不能把裸 ID 推到界面上）
     */
    public List<String> signaturesByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> distinct = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (distinct.isEmpty()) {
            return Collections.emptyList();
        }
        Map<Long, String> byId = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .select(SysUser::getId, SysUser::getName, SysUser::getUsername, SysUser::getEmpId)
                        .in(SysUser::getId, distinct))
                .stream()
                .collect(Collectors.toMap(SysUser::getId, this::operatorSignature, (a, b) -> a));
        return distinct.stream().map(byId::get).filter(StringUtils::hasText)
                .collect(Collectors.toList());
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
