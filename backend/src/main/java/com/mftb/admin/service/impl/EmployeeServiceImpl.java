package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 集团员工服务实现
 */
@Service
@RequiredArgsConstructor
public class EmployeeServiceImpl implements EmployeeService {

    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysPositionMapper sysPositionMapper;
    private final PasswordEncoder passwordEncoder;

    /** 内置管理员账号, 禁止停用/删除 */
    private static final String BUILTIN_ADMIN = "admin";

    @Override
    public PageResult<EmployeeVO> list(long page, long size, String keyword, Integer status) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getName, keyword)
                    .or().like(SysUser::getEmpId, keyword));
        }
        if (status != null) {
            wrapper.eq(SysUser::getStatus, status);
        }
        wrapper.orderByDesc(SysUser::getCreatedAt);
        Page<SysUser> result = sysUserMapper.selectPage(new Page<>(page, size), wrapper);
        List<EmployeeVO> records = result.getRecords().stream()
                .map(u -> EmployeeVO.from(u, JsonUtils.parseLongList(u.getFunctionRoles())))
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public EmployeeVO create(EmployeeRequest request) {
        if (!StringUtils.hasText(request.getUsername())) {
            throw new BusinessException("登录账号不能为空");
        }
        if (!StringUtils.hasText(request.getPassword()) || request.getPassword().length() < 6) {
            throw new BusinessException("登录密码不能为空且长度不少于 6 位");
        }
        // 账号唯一性校验
        Long count = sysUserMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, request.getUsername()));
        if (count > 0) {
            throw new BusinessException("登录账号已存在");
        }
        SysUser user = new SysUser();
        user.setUsername(request.getUsername().trim());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setName(request.getName());
        user.setEmpId(request.getEmpId());
        user.setAvatar("pikachu-default");
        user.setRole(StringUtils.hasText(request.getRole()) ? request.getRole() : "guest");
        user.setFunctionRoles(JsonUtils.toJson(request.getFunctionRoleIds() == null ? List.of() : request.getFunctionRoleIds()));
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        user.setStatus(1);
        user.setDeleted(0);
        sysUserMapper.insert(user);
        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    @Override
    public EmployeeVO update(Long id, EmployeeRequest request) {
        SysUser user = requireUser(id);
        user.setName(request.getName());
        user.setEmpId(request.getEmpId());
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        if (StringUtils.hasText(request.getRole()) && !BUILTIN_ADMIN.equals(user.getUsername())) {
            user.setRole(request.getRole());
        }
        if (request.getFunctionRoleIds() != null) {
            user.setFunctionRoles(JsonUtils.toJson(request.getFunctionRoleIds()));
        }
        sysUserMapper.updateById(user);
        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    @Override
    public void resetPassword(Long id, String password) {
        SysUser user = requireUser(id);
        user.setPassword(passwordEncoder.encode(password));
        sysUserMapper.updateById(user);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysUser user = requireUser(id);
        if (BUILTIN_ADMIN.equals(user.getUsername()) && status != null && status == 0) {
            throw new BusinessException("内置管理员账号不允许停用");
        }
        user.setStatus(status);
        sysUserMapper.updateById(user);
    }

    @Override
    public void delete(Long id) {
        SysUser user = requireUser(id);
        if (BUILTIN_ADMIN.equals(user.getUsername())) {
            throw new BusinessException("内置管理员账号不允许删除");
        }
        sysUserMapper.deleteById(id);
    }

    /** 设置员工所在部门: 校验部门存在并写入部门名称快照 */
    private void applyDepartment(SysUser user, Long departmentId) {
        if (departmentId == null) {
            user.setDepartmentId(null);
            user.setDepartment(null);
            return;
        }
        SysDepartment dept = sysDepartmentMapper.selectById(departmentId);
        if (dept == null) {
            throw new BusinessException("所选部门不存在");
        }
        user.setDepartmentId(dept.getId());
        user.setDepartment(dept.getName());
    }

    /** 设置员工职位: 校验职位存在并写入职位名称/职级快照 */
    private void applyPosition(SysUser user, Long positionId) {
        if (positionId == null) {
            user.setPositionId(null);
            user.setPosition(null);
            user.setJobLevel(null);
            return;
        }
        SysPosition position = sysPositionMapper.selectById(positionId);
        if (position == null) {
            throw new BusinessException("所选职位不存在");
        }
        user.setPositionId(position.getId());
        user.setPosition(position.getName());
        user.setJobLevel(position.getJobLevel());
    }

    private SysUser requireUser(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("员工不存在");
        }
        return user;
    }
}
