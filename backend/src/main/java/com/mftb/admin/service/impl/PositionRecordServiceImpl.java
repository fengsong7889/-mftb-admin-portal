package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PositionRecordService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * 职务记录服务实现
 */
@Service
@RequiredArgsConstructor
public class PositionRecordServiceImpl implements PositionRecordService {

    private final EmpPositionRecordMapper positionRecordMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<PositionRecordVO> listByUserId(Long userId) {
        requireUser(userId);
        LambdaQueryWrapper<EmpPositionRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpPositionRecord::getUserId, userId)
                .orderByDesc(EmpPositionRecord::getEffectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq);
        return positionRecordMapper.selectList(wrapper).stream()
                .map(PositionRecordVO::from)
                .toList();
    }

    @Override
    public PositionRecordVO create(Long userId, PositionRecordRequest request) {
        requireUser(userId);
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        EmpPositionRecord entity = new EmpPositionRecord();
        entity.setUserId(userId);
        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        entity.setOperation(request.getOperation());
        entity.setReason(request.getReason());
        entity.setServiceDept(request.getServiceDept());
        entity.setSequenceType(request.getSequenceType());
        entity.setPositionLevel(request.getPositionLevel());
        entity.setRankCode(request.getRankCode());
        entity.setCompany(request.getCompany());
        entity.setEmployeeCategory(request.getEmployeeCategory());
        entity.setWorkSystem(request.getWorkSystem());
        entity.setPositionName(request.getPositionName());
        entity.setDirectSuperior(request.getDirectSuperior());
        entity.setMentor(request.getMentor());
        entity.setWorkCountry(request.getWorkCountry());
        entity.setWorkCity(request.getWorkCity());
        entity.setOfficeAddress(request.getOfficeAddress());
        entity.setContractLocation(request.getContractLocation());
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        positionRecordMapper.insert(entity);
        return PositionRecordVO.from(entity);
    }

    @Override
    public PositionRecordVO update(Long userId, Long recordId, PositionRecordRequest request) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("职务记录不存在");
        }
        // 编辑时按新日期重新计算 effectiveSeq（同日期第 N 条 = N-1）
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        entity.setOperation(request.getOperation());
        entity.setReason(request.getReason());
        entity.setServiceDept(request.getServiceDept());
        entity.setSequenceType(request.getSequenceType());
        entity.setPositionLevel(request.getPositionLevel());
        entity.setRankCode(request.getRankCode());
        entity.setCompany(request.getCompany());
        entity.setEmployeeCategory(request.getEmployeeCategory());
        entity.setWorkSystem(request.getWorkSystem());
        entity.setPositionName(request.getPositionName());
        entity.setDirectSuperior(request.getDirectSuperior());
        entity.setMentor(request.getMentor());
        entity.setWorkCountry(request.getWorkCountry());
        entity.setWorkCity(request.getWorkCity());
        entity.setOfficeAddress(request.getOfficeAddress());
        entity.setContractLocation(request.getContractLocation());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        positionRecordMapper.updateById(entity);
        return PositionRecordVO.from(entity);
    }

    @Override
    public void delete(Long userId, Long recordId) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("职务记录不存在");
        }
        positionRecordMapper.deleteById(recordId);
    }

    /** 获取指定员工在指定日期的下一个 effectiveSeq（同日期当前最大值 + 1，无记录则返回 0） */
    private int getNextEffectiveSeq(Long userId, LocalDate effectiveDate) {
        LambdaQueryWrapper<EmpPositionRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpPositionRecord::getUserId, userId)
                .eq(EmpPositionRecord::getEffectiveDate, effectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq)
                .last("LIMIT 1");
        EmpPositionRecord latest = positionRecordMapper.selectOne(wrapper);
        return latest == null ? 0 : latest.getEffectiveSeq() + 1;
    }

    private void requireUser(Long userId) {
        if (sysUserMapper.selectById(userId) == null) {
            throw new BusinessException("员工不存在");
        }
    }
}
