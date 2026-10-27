package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamTransferOptionsVO;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;

/** 共用分类、品牌、组织的真实数据源；不要求取得基础资料管理权限。 */
@Service
@RequiredArgsConstructor
public class EamTransferLookup {
    private final SysDepartmentMapper departmentMapper;
    private final EamCategoryMapper categoryMapper;
    private final EamBrandMapper brandMapper;
    private final SysUserMapper userMapper;
    public static final int ENABLED = 1;

    public EamTransferOptionsVO options() {
        return new EamTransferOptionsVO(
                departments().stream().map(d -> new EamTransferOptionsVO.DepartmentOption(d.getId(), d.getParentId(), d.getName(), d.getStatus())).toList(),
                categories().stream().map(c -> new EamTransferOptionsVO.CategoryOption(c.getId(), c.getParentId(), c.getName(), c.getCode(), c.getStatus())).toList(),
                brandMapper.selectList(new LambdaQueryWrapper<EamBrand>().orderByAsc(EamBrand::getId)).stream()
                        .map(b -> new EamTransferOptionsVO.BrandOption(b.getId(), b.getBrandZh(), b.getBrandEn(), b.getCategoryCode())).toList());
    }

    public List<EamTransferOptionsVO.EmployeeOption> employees(String keyword) {
        String value = keyword == null ? "" : keyword.trim();
        if (value.length() > 128) throw new BusinessException("搜尋內容過長");
        return userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .select(SysUser::getId, SysUser::getName, SysUser::getUsername, SysUser::getEmpId, SysUser::getDepartmentId, SysUser::getDepartment)
                .eq(SysUser::getStatus, ENABLED)
                .and(!value.isEmpty(), w -> w.like(SysUser::getName, value).or().like(SysUser::getEmpId, value))
                .orderByAsc(SysUser::getEmpId).last("LIMIT 50")).stream()
                .map(u -> new EamTransferOptionsVO.EmployeeOption(u.getId(), u.getName() == null ? u.getUsername() : u.getName(),
                        u.getEmpId(), u.getDepartmentId(), u.getDepartment())).toList();
    }

    public SysDepartment requireDepartment(Long id) {
        SysDepartment d = id == null ? null : departmentMapper.selectById(id);
        if (d == null || !Objects.equals(d.getStatus(), ENABLED)) throw new BusinessException("調入部門不存在或已停用");
        // 台账仍以名称存储，拒绝有歧义的部门，避免静默映射到错误组织。
        if (departments().stream().filter(x -> Objects.equals(x.getName(), d.getName())).count() != 1)
            throw new BusinessException("部門名稱不唯一，請先整理組織資料");
        return d;
    }

    public Long uniqueDepartmentId(String name) {
        List<SysDepartment> matches = departments().stream().filter(d -> Objects.equals(name, d.getName())).toList();
        return matches.size() == 1 ? matches.get(0).getId() : null;
    }

    public Set<Long> departmentIds(long root) {
        return descendants(departments(), root, SysDepartment::getId, SysDepartment::getParentId);
    }

    public List<String> departmentNames(long root) {
        List<SysDepartment> all = departments();
        Set<Long> ids = descendants(all, root, SysDepartment::getId, SysDepartment::getParentId);
        return all.stream().filter(d -> ids.contains(d.getId()))
                .filter(d -> all.stream().filter(x -> Objects.equals(x.getName(), d.getName())).count() == 1)
                .map(SysDepartment::getName).toList();
    }

    public Set<Long> categoryIds(long root) {
        return descendants(categories(), root, EamCategory::getId, EamCategory::getParentId);
    }

    private List<SysDepartment> departments() {
        return departmentMapper.selectList(new LambdaQueryWrapper<SysDepartment>().orderByAsc(SysDepartment::getSort, SysDepartment::getId));
    }
    private List<EamCategory> categories() {
        return categoryMapper.selectList(new LambdaQueryWrapper<EamCategory>().orderByAsc(EamCategory::getSort, EamCategory::getId));
    }

    static <T> Set<Long> descendants(List<T> all, long root, Function<T, Long> id, Function<T, Long> parent) {
        if (all.stream().noneMatch(x -> Objects.equals(id.apply(x), root))) throw new BusinessException("所選分類或部門不存在");
        Set<Long> result = new HashSet<>();
        result.add(root);
        boolean changed;
        do {
            changed = false;
            for (T item : all) if (result.contains(parent.apply(item))) changed |= result.add(id.apply(item));
        } while (changed);
        return result;
    }
}
