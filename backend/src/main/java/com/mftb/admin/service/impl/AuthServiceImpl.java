package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.LoginRequest;
import com.mftb.admin.dto.LoginResponse;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.UserInfoVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 认证服务实现
 */
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final RoleService roleService;
    private final DepartmentService departmentService;

    @Override
    public LoginResponse login(LoginRequest request) {
        // 查询用户
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, request.getUsername()));
        if (user == null) {
            throw new BusinessException(ResultCode.ACCOUNT_NOT_EXIST);
        }
        // 校验密码
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(ResultCode.LOGIN_ERROR);
        }
        // 校验状态
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ResultCode.ACCOUNT_DISABLED);
        }
        // 生成 Token
        String token = jwtUtil.generateToken(user.getId(), user.getUsername());
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

    /** 构建用户信息: 合并「绑定角色」与「所在部门」授权的菜单权限 */
    private UserInfoVO buildUserInfo(SysUser user) {
        UserInfoVO vo = UserInfoVO.from(user);
        List<MenuPermissionDTO> rolePerms = roleService.mergePermissions(vo.getFunctionRoleIds());
        List<MenuPermissionDTO> deptPerms = departmentService.permissionsOf(user.getDepartmentId());
        vo.setPermissions(mergePermissionLists(rolePerms, deptPerms));
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
}
