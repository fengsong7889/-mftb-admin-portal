package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PositionRecordService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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
    private final EmployeeService employeeService;
    private final HrMasterDataResolver masterDataResolver;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final HrAuditService hrAuditService;

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
    @Transactional
    public PositionRecordVO create(Long userId, PositionRecordRequest request) {
        requireUser(userId);
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        EmpPositionRecord entity = new EmpPositionRecord();
        entity.setUserId(userId);
        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        applyOperation(entity, request);
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
        // 名称→稳定 ID 归一（只认唯一命中），失败留 NULL：写错关联比留空更难发现
        masterDataResolver.applyStableIds(entity);
        positionRecordMapper.insert(entity);
        syncPeriods(userId);
        // P1-F: 离职记录且生效日 <= 今天时，自动停用账号并强制下线（复用员工服务，同一事务）
        // 判定看 code 而不是中文名称（方案 §5.3）：名称存简体、界面显示繁体，历史上已踩过。
        if (HrOperationCode.DIMISSION.equals(entity.getOperationCode())
                && request.getEffectiveDate() != null
                && !request.getEffectiveDate().isAfter(LocalDate.now())) {
            employeeService.updateStatus(userId, 0);
        }
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("新增异动 #" + entity.getId() + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .reason(request.getReason())
                .effectiveDate(request.getEffectiveDate()));
        return PositionRecordVO.from(entity);
    }

    @Override
    @Transactional
    public PositionRecordVO update(Long userId, Long recordId, PositionRecordRequest request) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("職務記錄不存在");
        }
        // 编辑时按新日期重新计算 effectiveSeq（同日期第 N 条 = N-1）
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        applyOperation(entity, request);
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
        masterDataResolver.applyStableIds(entity);
        positionRecordMapper.updateById(entity);
        syncPeriods(userId);
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("编辑异动 #" + recordId + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .reason(request.getReason())
                .effectiveDate(request.getEffectiveDate()));
        return PositionRecordVO.from(entity);
    }

    @Override
    @Transactional
    public void delete(Long userId, Long recordId) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("職務記錄不存在");
        }
        positionRecordMapper.deleteById(recordId);
        // 删一条异动同样会改变雇佣期间（比如删掉误登记的离职），必须重算
        syncPeriods(userId);
        // 删除异动是最难事后重建的操作（行已软删，只能靠审计知道它当时是什么）
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("删除异动 #" + recordId + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .effectiveDate(entity.getEffectiveDate()));
    }

    /**
     * 任职事实变动后同步雇佣期间。
     * <p>双轨期间雇佣期间表是「旁路投影」，投影不跟着事实走就永远是旧账；
     * 这里的自动同步只针对「本次被动过的这个人」，不构成历史批量迁移。
     */
    private void syncPeriods(Long userId) {
        employmentPeriodService.syncFromRecords(userId, operatorResolver.currentOperatorName());
    }

    /**
     * 写入异动动作：以 code 为准，名称作为展示快照同步规范化。
     * <p>两个都没给就拒写：在职/离职完全由这个动作派生，缺它就不能猜。
     */
    private void applyOperation(EmpPositionRecord entity, PositionRecordRequest request) {
        String raw = StringUtils.hasText(request.getOperationCode())
                ? request.getOperationCode()
                : request.getOperation();
        if (!StringUtils.hasText(raw)) {
            throw new BusinessException("操作類型或動作 code 至少填一個");
        }
        String code = HrOperationCode.codeForWrite(raw);
        entity.setOperationCode(code);
        // 能识别的写规范简体名（与历史写法一致）；识别不了时保留原输入，不编造一个错的名称
        entity.setOperation(HrOperationCode.OTHER.equals(code)
                ? raw.trim() : HrOperationCode.nameForWrite(code));
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
            throw new BusinessException("員工不存在");
        }
    }
}
