package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.ContractLedgerVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeContractService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 员工合同台账服务实现 (P1-B)
 * 幂等/校验: 归属校验、必填与起止日期先后; 增删改写入操作人。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeContractServiceImpl implements EmployeeContractService {

    private final EmpContractMapper contractMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<EmpContract> listByUserId(Long userId) {
        requireUser(userId);
        return contractMapper.selectList(new LambdaQueryWrapper<EmpContract>()
                .eq(EmpContract::getUserId, userId)
                .orderByDesc(EmpContract::getStartDate)
                .orderByDesc(EmpContract::getId));
    }

    @Override
    public PageResult<ContractLedgerVO> ledger(long page, long size, String keyword,
                                               String company, String contractType, String status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<EmpContract> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(company)) w.eq(EmpContract::getCompany, company);
        if (StringUtils.hasText(contractType)) w.eq(EmpContract::getContractType, contractType);
        if (StringUtils.hasText(status)) w.eq(EmpContract::getStatus, status);
        if (StringUtils.hasText(keyword)) {
            final String kw = keyword.trim();
            List<Long> matchedUserIds = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                            .select(SysUser::getId)
                            .and(x -> x.like(SysUser::getName, kw).or().like(SysUser::getEmpId, kw)))
                    .stream().map(SysUser::getId).toList();
            // 关键字：匹配合同编号，或匹配到员工（姓名/工号）的合同
            w.and(x -> {
                x.like(EmpContract::getContractNo, kw);
                if (!matchedUserIds.isEmpty()) x.or().in(EmpContract::getUserId, matchedUserIds);
            });
        }
        w.orderByDesc(EmpContract::getStartDate).orderByDesc(EmpContract::getId);
        List<EmpContract> all = contractMapper.selectList(w);
        long total = all.size();
        int from = (int) Math.min((page - 1) * size, total);
        int to = (int) Math.min(from + size, total);
        List<EmpContract> pageRows = from < total ? all.subList(from, to) : List.of();
        if (pageRows.isEmpty()) return new PageResult<>(List.of(), total);
        List<Long> userIds = pageRows.stream().map(EmpContract::getUserId).distinct().toList();
        Map<Long, SysUser> userMap = sysUserMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(SysUser::getId, u -> u, (a, b) -> a));
        List<ContractLedgerVO> vos = pageRows.stream().map(c -> {
            SysUser u = userMap.get(c.getUserId());
            return ContractLedgerVO.from(c,
                    u != null ? u.getEmpId() : null,
                    u != null ? u.getName() : null,
                    u != null ? u.getDepartment() : null);
        }).toList();
        return new PageResult<>(vos, total);
    }

    @Override
    public EmpContract create(Long userId, EmpContract contract) {
        requireUser(userId);
        validate(contract);
        contract.setId(null);
        contract.setUserId(userId);
        String operator = operatorResolver.currentOperatorName();
        contract.setCreatedBy(operator);
        contract.setUpdatedBy(operator);
        contract.setDeleted(0);
        contractMapper.insert(contract);
        return contract;
    }

    @Override
    public EmpContract update(Long userId, Long id, EmpContract contract) {
        requireUser(userId);
        EmpContract existing = requireOwned(userId, id);
        validate(contract);
        existing.setContractNo(contract.getContractNo());
        existing.setContractType(contract.getContractType());
        existing.setCompany(contract.getCompany());
        existing.setStartDate(contract.getStartDate());
        existing.setEndDate(contract.getEndDate());
        existing.setSignDate(contract.getSignDate());
        existing.setStatus(contract.getStatus());
        existing.setRemark(contract.getRemark());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        contractMapper.updateById(existing);
        return existing;
    }

    @Override
    public void delete(Long userId, Long id) {
        requireUser(userId);
        requireOwned(userId, id);
        contractMapper.deleteById(id);
    }

    private void validate(EmpContract contract) {
        if (!StringUtils.hasText(contract.getContractNo())) throw new BusinessException("合同編號不能為空");
        if (!StringUtils.hasText(contract.getContractType())) throw new BusinessException("合同類型不能為空");
        if (contract.getStartDate() == null) throw new BusinessException("合同開始日期不能為空");
        if (contract.getEndDate() == null) throw new BusinessException("合同結束日期不能為空");
        if (contract.getEndDate().isBefore(contract.getStartDate())) {
            throw new BusinessException("合同結束日期不能早於開始日期");
        }
    }

    private EmpContract requireOwned(Long userId, Long id) {
        EmpContract existing = id == null ? null : contractMapper.selectById(id);
        if (existing == null || !userId.equals(existing.getUserId())) {
            throw new BusinessException("合同記錄不存在");
        }
        return existing;
    }

    private void requireUser(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) throw new BusinessException("員工不存在");
    }
}
