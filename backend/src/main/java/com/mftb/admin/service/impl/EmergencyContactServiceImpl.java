package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EmergencyContactRequest;
import com.mftb.admin.dto.EmergencyContactVO;
import com.mftb.admin.entity.EmpEmergencyContact;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpEmergencyContactMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmergencyContactService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 紧急联系人服务实现
 */
@Service
@RequiredArgsConstructor
public class EmergencyContactServiceImpl implements EmergencyContactService {

    private final EmpEmergencyContactMapper emergencyContactMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<EmergencyContactVO> listByUserId(Long userId) {
        requireUser(userId);
        LambdaQueryWrapper<EmpEmergencyContact> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpEmergencyContact::getUserId, userId)
                .orderByDesc(EmpEmergencyContact::getCreatedAt);
        return emergencyContactMapper.selectList(wrapper).stream()
                .map(EmergencyContactVO::from)
                .toList();
    }

    @Override
    public EmergencyContactVO create(Long userId, EmergencyContactRequest request) {
        requireUser(userId);
        EmpEmergencyContact entity = new EmpEmergencyContact();
        entity.setUserId(userId);
        entity.setName(request.getName());
        entity.setPhone(request.getPhone());
        entity.setRelation(request.getRelation());
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        emergencyContactMapper.insert(entity);
        return EmergencyContactVO.from(entity);
    }

    @Override
    public EmergencyContactVO update(Long userId, Long contactId, EmergencyContactRequest request) {
        requireUser(userId);
        EmpEmergencyContact entity = emergencyContactMapper.selectById(contactId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("紧急联系人不存在");
        }
        entity.setName(request.getName());
        entity.setPhone(request.getPhone());
        entity.setRelation(request.getRelation());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        emergencyContactMapper.updateById(entity);
        return EmergencyContactVO.from(entity);
    }

    @Override
    public void delete(Long userId, Long contactId) {
        requireUser(userId);
        EmpEmergencyContact entity = emergencyContactMapper.selectById(contactId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("紧急联系人不存在");
        }
        emergencyContactMapper.deleteById(contactId);
    }

    private void requireUser(Long userId) {
        if (sysUserMapper.selectById(userId) == null) {
            throw new BusinessException("员工不存在");
        }
    }
}
