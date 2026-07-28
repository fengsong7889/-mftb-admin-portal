package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 功能角色服务实现
 */
@Service
@RequiredArgsConstructor
public class RoleServiceImpl implements RoleService {

    private final SysRoleMapper sysRoleMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<RoleVO> list() {
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>().orderByAsc(SysRole::getId));
        // 统计每个角色绑定的账号数
        Map<Long, Long> countMap = new LinkedHashMap<>();
        List<SysUser> users = sysUserMapper.selectList(null);
        for (SysUser user : users) {
            for (Long roleId : JsonUtils.parseLongList(user.getFunctionRoles())) {
                countMap.merge(roleId, 1L, Long::sum);
            }
        }
        return roles.stream().map(role -> toVO(role, countMap.getOrDefault(role.getId(), 0L))).toList();
    }

    @Override
    public RoleVO create(RoleRequest request) {
        SysRole role = new SysRole();
        role.setName(request.getName());
        // code 唯一约束, 自动生成
        role.setCode("role_" + System.currentTimeMillis());
        role.setDescription(request.getDescription());
        role.setPermissions(JsonUtils.toJson(request.getPermissions() == null ? List.of() : request.getPermissions()));
        role.setStatus(1);
        role.setDeleted(0);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.insert(role);
        return toVO(role, 0L);
    }

    @Override
    public RoleVO update(Long id, RoleRequest request) {
        SysRole role = requireRole(id);
        role.setName(request.getName());
        role.setDescription(request.getDescription());
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
        return toVO(role, null);
    }

    @Override
    public void updatePermissions(Long id, List<MenuPermissionDTO> permissions) {
        SysRole role = requireRole(id);
        role.setPermissions(JsonUtils.toJson(permissions == null ? List.of() : permissions));
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysRole role = requireRole(id);
        role.setStatus(status);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireRole(id);
        sysRoleMapper.deleteById(id);
        // 从所有员工的绑定中移除该角色
        List<SysUser> users = sysUserMapper.selectList(null);
        for (SysUser user : users) {
            List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
            if (roleIds.remove(id)) {
                user.setFunctionRoles(JsonUtils.toJson(roleIds));
                sysUserMapper.updateById(user);
            }
        }
    }

    @Override
    public List<Long> boundUserIds(Long roleId) {
        List<Long> userIds = new ArrayList<>();
        for (SysUser user : sysUserMapper.selectList(null)) {
            if (JsonUtils.parseLongList(user.getFunctionRoles()).contains(roleId)) {
                userIds.add(user.getId());
            }
        }
        return userIds;
    }

    @Override
    @Transactional
    public void bindUsers(Long roleId, List<Long> userIds) {
        requireRole(roleId);
        Set<Long> targetIds = new LinkedHashSet<>(userIds == null ? List.of() : userIds);
        for (SysUser user : sysUserMapper.selectList(null)) {
            List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
            boolean bound = roleIds.contains(roleId);
            boolean shouldBind = targetIds.contains(user.getId());
            if (bound == shouldBind) {
                continue;
            }
            if (shouldBind) {
                roleIds.add(roleId);
            } else {
                roleIds.remove(roleId);
            }
            user.setFunctionRoles(JsonUtils.toJson(roleIds));
            sysUserMapper.updateById(user);
        }
    }

    @Override
    public List<MenuPermissionDTO> mergePermissions(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return List.of();
        }
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>().in(SysRole::getId, roleIds).eq(SysRole::getStatus, 1));
        // 按 menuKey 合并操作集合
        Map<String, Set<String>> merged = new LinkedHashMap<>();
        for (SysRole role : roles) {
            for (MenuPermissionDTO perm : JsonUtils.parsePermissions(role.getPermissions())) {
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

    private RoleVO toVO(SysRole role, Long userCount) {
        RoleVO vo = new RoleVO();
        vo.setId(role.getId());
        vo.setName(role.getName());
        vo.setDescription(role.getDescription());
        vo.setStatus(role.getStatus());
        vo.setPermissions(JsonUtils.parsePermissions(role.getPermissions()));
        vo.setUserCount(userCount);
        vo.setCreatedAt(role.getCreatedAt());
        vo.setUpdatedBy(role.getUpdatedBy());
        vo.setUpdatedAt(role.getUpdatedAt());
        return vo;
    }

    private SysRole requireRole(Long id) {
        SysRole role = sysRoleMapper.selectById(id);
        if (role == null) {
            throw new BusinessException("角色不存在");
        }
        return role;
    }
}
