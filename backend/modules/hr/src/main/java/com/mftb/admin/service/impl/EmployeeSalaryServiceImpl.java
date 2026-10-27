package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.SalaryConfigRequest;
import com.mftb.admin.dto.SalaryConfigVO;
import com.mftb.admin.dto.SalaryDeductionRequest;
import com.mftb.admin.dto.SalaryDeductionVO;
import com.mftb.admin.dto.SalaryIncomeRequest;
import com.mftb.admin.dto.SalaryIncomeVO;
import com.mftb.admin.entity.EmpSalaryConfig;
import com.mftb.admin.entity.EmpSalaryDeduction;
import com.mftb.admin.entity.EmpSalaryIncome;
import com.mftb.admin.mapper.EmpSalaryConfigMapper;
import com.mftb.admin.mapper.EmpSalaryDeductionMapper;
import com.mftb.admin.mapper.EmpSalaryIncomeMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeSalaryService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 员工费用信息服务实现
 */
@Service
@RequiredArgsConstructor
public class EmployeeSalaryServiceImpl implements EmployeeSalaryService {

    private final EmpSalaryIncomeMapper salaryIncomeMapper;
    private final EmpSalaryDeductionMapper salaryDeductionMapper;
    private final EmpSalaryConfigMapper salaryConfigMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    // ── 收入项 ──

    @Override
    public List<SalaryIncomeVO> listIncomes(Long userId) {
        requireUser(userId);
        LambdaQueryWrapper<EmpSalaryIncome> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpSalaryIncome::getUserId, userId)
                .orderByAsc(EmpSalaryIncome::getCreatedAt);
        return salaryIncomeMapper.selectList(wrapper).stream()
                .map(SalaryIncomeVO::from)
                .toList();
    }

    @Override
    public SalaryIncomeVO createIncome(Long userId, SalaryIncomeRequest request) {
        requireUser(userId);
        EmpSalaryIncome entity = new EmpSalaryIncome();
        entity.setUserId(userId);
        applyIncome(entity, request);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        salaryIncomeMapper.insert(entity);
        return SalaryIncomeVO.from(entity);
    }

    @Override
    public SalaryIncomeVO updateIncome(Long userId, Long incomeId, SalaryIncomeRequest request) {
        requireUser(userId);
        EmpSalaryIncome entity = salaryIncomeMapper.selectById(incomeId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("收入項不存在");
        }
        applyIncome(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        salaryIncomeMapper.updateById(entity);
        return SalaryIncomeVO.from(entity);
    }

    @Override
    public void deleteIncome(Long userId, Long incomeId) {
        requireUser(userId);
        EmpSalaryIncome entity = salaryIncomeMapper.selectById(incomeId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("收入項不存在");
        }
        salaryIncomeMapper.deleteById(incomeId);
    }

    private void applyIncome(EmpSalaryIncome entity, SalaryIncomeRequest request) {
        entity.setName(request.getName());
        entity.setAmount(request.getAmount());
        entity.setType(request.getType());
        entity.setRemark(request.getRemark());
    }

    // ── 扣除项 ──

    @Override
    public List<SalaryDeductionVO> listDeductions(Long userId) {
        requireUser(userId);
        LambdaQueryWrapper<EmpSalaryDeduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpSalaryDeduction::getUserId, userId)
                .orderByAsc(EmpSalaryDeduction::getCreatedAt);
        return salaryDeductionMapper.selectList(wrapper).stream()
                .map(SalaryDeductionVO::from)
                .toList();
    }

    @Override
    public SalaryDeductionVO createDeduction(Long userId, SalaryDeductionRequest request) {
        requireUser(userId);
        EmpSalaryDeduction entity = new EmpSalaryDeduction();
        entity.setUserId(userId);
        applyDeduction(entity, request);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        salaryDeductionMapper.insert(entity);
        return SalaryDeductionVO.from(entity);
    }

    @Override
    public SalaryDeductionVO updateDeduction(Long userId, Long deductionId, SalaryDeductionRequest request) {
        requireUser(userId);
        EmpSalaryDeduction entity = salaryDeductionMapper.selectById(deductionId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("扣除項不存在");
        }
        applyDeduction(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        salaryDeductionMapper.updateById(entity);
        return SalaryDeductionVO.from(entity);
    }

    @Override
    public void deleteDeduction(Long userId, Long deductionId) {
        requireUser(userId);
        EmpSalaryDeduction entity = salaryDeductionMapper.selectById(deductionId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("扣除項不存在");
        }
        salaryDeductionMapper.deleteById(deductionId);
    }

    private void applyDeduction(EmpSalaryDeduction entity, SalaryDeductionRequest request) {
        entity.setName(request.getName());
        entity.setRate(request.getRate());
        entity.setAmount(request.getAmount());
        entity.setRemark(request.getRemark());
    }

    // ── 薪资配置 ──

    @Override
    public SalaryConfigVO getConfig(Long userId) {
        requireUser(userId);
        EmpSalaryConfig entity = selectConfigByUserId(userId);
        if (entity == null) {
            // 未配置时返回字段为空的 VO, 前端展示空值
            return new SalaryConfigVO();
        }
        return SalaryConfigVO.from(entity);
    }

    @Override
    public SalaryConfigVO saveConfig(Long userId, SalaryConfigRequest request) {
        requireUser(userId);
        String operator = operatorResolver.currentOperatorName();
        EmpSalaryConfig entity = selectConfigByUserId(userId);
        if (entity == null) {
            entity = new EmpSalaryConfig();
            entity.setUserId(userId);
            entity.setCreatedBy(operator);
            entity.setDeleted(0);
        }
        entity.setSalaryStructure(request.getSalaryStructure());
        entity.setPaymentMethod(request.getPaymentMethod());
        entity.setPayDay(request.getPayDay());
        entity.setBankName(request.getBankName());
        entity.setBankAccount(request.getBankAccount());
        entity.setTaxCity(request.getTaxCity());
        entity.setUpdatedBy(operator);
        if (entity.getId() == null) {
            salaryConfigMapper.insert(entity);
        } else {
            salaryConfigMapper.updateById(entity);
        }
        return SalaryConfigVO.from(entity);
    }

    private EmpSalaryConfig selectConfigByUserId(Long userId) {
        LambdaQueryWrapper<EmpSalaryConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpSalaryConfig::getUserId, userId).last("LIMIT 1");
        return salaryConfigMapper.selectOne(wrapper);
    }

    private void requireUser(Long userId) {
        if (sysUserMapper.selectById(userId) == null) {
            throw new BusinessException("員工不存在");
        }
    }
}
