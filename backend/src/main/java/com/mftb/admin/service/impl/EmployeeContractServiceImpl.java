package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.ContractExpirySummaryVO;
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

import java.time.LocalDate;
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

    /** 合同状态：已终止（到期预警口径中排除，与前端 contractLedger.terminated 对应） */
    private static final String STATUS_TERMINATED = "已终止";

    /** 到期分桶：已过期未处理 */
    private static final String BUCKET_EXPIRED = "expired";
    /** 到期分桶：30/60/90 天内到期 */
    private static final String BUCKET_DUE_30 = "due30";
    private static final String BUCKET_DUE_60 = "due60";
    private static final String BUCKET_DUE_90 = "due90";

    /** 预警窗口默认/上限天数 */
    private static final int DEFAULT_EXPIRY_WINDOW = 90;
    private static final int MAX_EXPIRY_WINDOW = 365;

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
                                               String company, String contractType, String status,
                                               String expiryBucket) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<EmpContract> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(company)) w.eq(EmpContract::getCompany, company);
        if (StringUtils.hasText(contractType)) w.eq(EmpContract::getContractType, contractType);
        if (StringUtils.hasText(status)) w.eq(EmpContract::getStatus, status);
        applyExpiryBucket(w, expiryBucket);
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

    /**
     * 到期分桶过滤（P0 合同到期预警）。
     * expired：结束日早于今天；due30/due60/due90：结束日落在 [今天, 今天+N]。
     * 两种桶都排除「已终止」（status 为空视为未终止，NULL 不参与 ne 比较，故用 isNull or ne）。
     */
    private void applyExpiryBucket(LambdaQueryWrapper<EmpContract> w, String expiryBucket) {
        String bucket = expiryBucket == null ? "" : expiryBucket.trim();
        if (bucket.isEmpty() || "all".equals(bucket)) {
            return;
        }
        LocalDate today = LocalDate.now();
        w.isNotNull(EmpContract::getEndDate)
                .and(x -> x.isNull(EmpContract::getStatus).or().ne(EmpContract::getStatus, STATUS_TERMINATED));
        if (BUCKET_EXPIRED.equals(bucket)) {
            w.lt(EmpContract::getEndDate, today);
            return;
        }
        int days = switch (bucket) {
            case BUCKET_DUE_30 -> 30;
            case BUCKET_DUE_60 -> 60;
            case BUCKET_DUE_90 -> 90;
            default -> throw new BusinessException("無效的到期篩選: " + bucket);
        };
        w.ge(EmpContract::getEndDate, today).le(EmpContract::getEndDate, today.plusDays(days));
    }

    @Override
    public ContractExpirySummaryVO expirySummary(int days) {
        int window = days <= 0 ? DEFAULT_EXPIRY_WINDOW : Math.min(days, MAX_EXPIRY_WINDOW);
        LocalDate today = LocalDate.now();
        List<EmpContract> all = contractMapper.selectList(new LambdaQueryWrapper<EmpContract>()
                .and(x -> x.isNull(EmpContract::getStatus).or().ne(EmpContract::getStatus, STATUS_TERMINATED)));
        long expired = 0;
        long due30 = 0;
        long due60 = 0;
        long due90 = 0;
        long noEndDate = 0;
        List<EmpContract> dueList = new java.util.ArrayList<>();
        for (EmpContract c : all) {
            if (c.getEndDate() == null) {
                noEndDate++;
                continue;
            }
            if (c.getEndDate().isBefore(today)) {
                expired++;
            } else {
                long left = java.time.temporal.ChronoUnit.DAYS.between(today, c.getEndDate());
                if (left <= 30) due30++;
                if (left <= 60) due60++;
                if (left <= 90) due90++;
                if (left <= window) dueList.add(c);
            }
        }
        // 最近到期明细：按结束日升序取前 20 条
        dueList.sort(java.util.Comparator.comparing(EmpContract::getEndDate));
        List<EmpContract> top = dueList.size() > 20 ? dueList.subList(0, 20) : dueList;
        ContractExpirySummaryVO vo = new ContractExpirySummaryVO();
        vo.setDays(window);
        // 台账「全部」页签计数：不受状态/日期分桶影响（selectCount 自带逻辑删除过滤）
        Long total = contractMapper.selectCount(null);
        vo.setTotal(total == null ? 0L : total);
        vo.setExpired(expired);
        vo.setDue30(due30);
        vo.setDue60(due60);
        vo.setDue90(due90);
        vo.setNoEndDate(noEndDate);
        vo.setSoonest(toLedgerVOs(top));
        return vo;
    }

    /** 合同列表 → 台账 VO（批量补齐员工工号/姓名/部门快照） */
    private List<ContractLedgerVO> toLedgerVOs(List<EmpContract> rows) {
        if (rows.isEmpty()) return List.of();
        List<Long> userIds = rows.stream().map(EmpContract::getUserId).distinct().toList();
        Map<Long, SysUser> userMap = sysUserMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(SysUser::getId, u -> u, (a, b) -> a));
        return rows.stream().map(c -> {
            SysUser u = userMap.get(c.getUserId());
            return ContractLedgerVO.from(c,
                    u != null ? u.getEmpId() : null,
                    u != null ? u.getName() : null,
                    u != null ? u.getDepartment() : null);
        }).toList();
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
