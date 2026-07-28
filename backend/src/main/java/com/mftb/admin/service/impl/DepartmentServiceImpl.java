package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DepartmentRequest;
import com.mftb.admin.dto.DepartmentVO;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 集团组织架构-部门服务实现
 */
@Service
@RequiredArgsConstructor
public class DepartmentServiceImpl implements DepartmentService {

    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<DepartmentVO> list() {
        List<SysDepartment> departments = sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .orderByAsc(SysDepartment::getSort)
                        .orderByAsc(SysDepartment::getId));
        // 上级部门名称映射
        Map<Long, String> nameMap = new HashMap<>();
        departments.forEach(d -> nameMap.put(d.getId(), d.getName()));
        // 各部门在编人数
        Map<Long, Long> countMap = new HashMap<>();
        for (SysUser user : sysUserMapper.selectList(null)) {
            if (user.getDepartmentId() != null) {
                countMap.merge(user.getDepartmentId(), 1L, Long::sum);
            }
        }
        return departments.stream()
                .map(d -> DepartmentVO.from(d, nameMap.get(d.getParentId()), countMap.getOrDefault(d.getId(), 0L)))
                .toList();
    }

    @Override
    public DepartmentVO create(DepartmentRequest request) {
        requireCodeUnique(request.getCode(), null);
        if (request.getParentId() != null) {
            requireDept(request.getParentId());
        }
        SysDepartment dept = new SysDepartment();
        dept.setCode(request.getCode().trim());
        dept.setName(request.getName().trim());
        dept.setParentId(request.getParentId());
        dept.setLeader(request.getLeader());
        dept.setPermissions("[]");
        dept.setStatus(1);
        dept.setSort(request.getSort() == null ? 0 : request.getSort());
        dept.setDeleted(0);
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.insert(dept);
        return DepartmentVO.from(dept, null, 0L);
    }

    @Override
    public DepartmentVO update(Long id, DepartmentRequest request) {
        SysDepartment dept = requireDept(id);
        requireCodeUnique(request.getCode(), id);
        // 上级部门不能选择自身或其下级 (防止形成环)
        if (request.getParentId() != null) {
            Long cursor = request.getParentId();
            while (cursor != null) {
                if (Objects.equals(cursor, id)) {
                    throw new BusinessException("上级部门不能选择自身或其下级部门");
                }
                SysDepartment parent = sysDepartmentMapper.selectById(cursor);
                cursor = parent == null ? null : parent.getParentId();
            }
        }
        dept.setCode(request.getCode().trim());
        dept.setName(request.getName().trim());
        dept.setParentId(request.getParentId());
        dept.setLeader(request.getLeader());
        if (request.getSort() != null) {
            dept.setSort(request.getSort());
        }
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.updateById(dept);
        // 同步更新该部门下员工的部门名称快照
        syncUserDepartmentName(id, dept.getName());
        return DepartmentVO.from(dept, null, null);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysDepartment dept = requireDept(id);
        dept.setStatus(status);
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.updateById(dept);
    }

    @Override
    public void updatePermissions(Long id, List<MenuPermissionDTO> permissions) {
        SysDepartment dept = requireDept(id);
        dept.setPermissions(JsonUtils.toJson(permissions == null ? List.of() : permissions));
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.updateById(dept);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireDept(id);
        Long childCount = sysDepartmentMapper.selectCount(
                new LambdaQueryWrapper<SysDepartment>().eq(SysDepartment::getParentId, id));
        if (childCount != null && childCount > 0) {
            throw new BusinessException("该部门存在下级部门，请先删除下级部门");
        }
        sysDepartmentMapper.deleteById(id);
        // 解绑该部门下的员工
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getDepartmentId, id));
        for (SysUser user : users) {
            user.setDepartmentId(null);
            user.setDepartment(null);
            sysUserMapper.updateById(user);
        }
    }

    @Override
    public List<MenuPermissionDTO> permissionsOf(Long deptId) {
        if (deptId == null) {
            return List.of();
        }
        SysDepartment dept = sysDepartmentMapper.selectById(deptId);
        if (dept == null || dept.getStatus() == null || dept.getStatus() != 1) {
            return List.of();
        }
        return JsonUtils.parsePermissions(dept.getPermissions());
    }

    /** 部门编码唯一性校验 (excludeId 为编辑时排除自身) */
    private void requireCodeUnique(String code, Long excludeId) {
        if (!StringUtils.hasText(code)) {
            throw new BusinessException("部门编码不能为空");
        }
        LambdaQueryWrapper<SysDepartment> wrapper =
                new LambdaQueryWrapper<SysDepartment>().eq(SysDepartment::getCode, code.trim());
        if (excludeId != null) {
            wrapper.ne(SysDepartment::getId, excludeId);
        }
        Long count = sysDepartmentMapper.selectCount(wrapper);
        if (count != null && count > 0) {
            throw new BusinessException("部门编码已存在");
        }
    }

    /** 部门名称变更后同步员工表的部门名称快照 */
    private void syncUserDepartmentName(Long deptId, String deptName) {
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getDepartmentId, deptId));
        for (SysUser user : users) {
            user.setDepartment(deptName);
            sysUserMapper.updateById(user);
        }
    }

    private SysDepartment requireDept(Long id) {
        SysDepartment dept = sysDepartmentMapper.selectById(id);
        if (dept == null) {
            throw new BusinessException("部门不存在");
        }
        return dept;
    }
}
