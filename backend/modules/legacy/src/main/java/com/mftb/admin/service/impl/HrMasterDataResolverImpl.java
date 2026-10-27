package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysHrDict;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysHrDictMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrMasterDataResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 稳定 ID 解析实现。全部走「名称精确匹配 + 只认唯一命中」，不引入模糊匹配：
 * 异动记录写的是当时发生的名字，模糊命中一次就会把这段历史永久挂错。
 */
@Service
@RequiredArgsConstructor
public class HrMasterDataResolverImpl implements HrMasterDataResolver {

    /** HR 字典类型：与 sys_hr_dict.dict_type、HrDictSchemaInitializer 种子同源 */
    private static final String DICT_EMPLOYER_COMPANY = "EMPLOYER_COMPANY";
    private static final String DICT_WORK_LOCATION = "WORK_LOCATION";

    private final SysDepartmentMapper departmentMapper;
    private final SysPositionMapper positionMapper;
    private final SysHrDictMapper hrDictMapper;
    private final SysUserMapper sysUserMapper;

    @Override
    public void applyStableIds(EmpPositionRecord record) {
        if (record == null) {
            return;
        }
        record.setDeptId(uniqueDeptId(record.getServiceDept()));
        record.setPositionId(uniquePositionId(record.getPositionName()));
        record.setEmployerCompanyId(uniqueDictId(DICT_EMPLOYER_COMPANY, record.getCompany()));
        // 工作地点取「工作城市」：合同/国家维度另有列，一期不混用
        record.setWorkLocationId(uniqueDictId(DICT_WORK_LOCATION, record.getWorkCity()));
        record.setManagerUserId(uniqueUserByName(record.getDirectSuperior()));
        record.setMentorUserId(uniqueUserByName(record.getMentor()));
    }

    private Long uniqueDeptId(String name) {
        if (isBlank(name)) {
            return null;
        }
        List<SysDepartment> hits = departmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .eq(SysDepartment::getName, name.trim())
                        .last("LIMIT 2"));
        return hits.size() == 1 ? hits.get(0).getId() : null;
    }

    private Long uniquePositionId(String name) {
        if (isBlank(name)) {
            return null;
        }
        List<SysPosition> hits = positionMapper.selectList(
                new LambdaQueryWrapper<SysPosition>()
                        .eq(SysPosition::getName, name.trim())
                        .last("LIMIT 2"));
        return hits.size() == 1 ? hits.get(0).getId() : null;
    }

    private Long uniqueDictId(String dictType, String name) {
        if (isBlank(name)) {
            return null;
        }
        List<SysHrDict> hits = hrDictMapper.selectList(
                new LambdaQueryWrapper<SysHrDict>()
                        .eq(SysHrDict::getDictType, dictType)
                        .eq(SysHrDict::getName, name.trim())
                        .last("LIMIT 2"));
        return hits.size() == 1 ? hits.get(0).getId() : null;
    }

    /** 上级/导师按姓名找人：同名多人时留空（方案「同名员工不破坏关联」要求的就是这一条） */
    private Long uniqueUserByName(String name) {
        if (isBlank(name)) {
            return null;
        }
        List<SysUser> hits = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getName, name.trim())
                        .last("LIMIT 3"));
        List<SysUser> candidates = hits.stream()
                .filter(u -> !BuiltinAccounts.isSystemAccount(u.getUsername()))
                .toList();
        return candidates.size() == 1 ? candidates.get(0).getId() : null;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
