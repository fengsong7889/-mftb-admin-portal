package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.dto.ContractExpirySummaryVO;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.ContractLedgerVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeContractService;
import com.mftb.admin.service.HrAuditService;
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
    private static final java.util.List<String> CHANGE_TYPES = java.util.List.of("NEW", "RENEW", "CHANGE");
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
    private final HrAuditService hrAuditService;

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
        contract.setUserId(userId);
        validate(contract, userId);
        contract.setId(null);
        String operator = operatorResolver.currentOperatorName();
        contract.setCreatedBy(operator);
        contract.setUpdatedBy(operator);
        contract.setDeleted(0);
        contractMapper.insert(contract);
        // 台账写入现阶段记动作级（含关键值）而不是字段级 diff：
        // 合同本身是「一行一份」的台账，行号+号号+起止+主体已足以事后重建；字段级留痕等 P5 单据化后一并接入。
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.CONTRACT_WRITE, userId)
                .detail("新增合同 " + contract.getContractNo() + "［" + contract.getContractType() + "］ "
                        + contract.getStartDate() + "~" + endDateLabel(contract.getEndDate())
                        + " 主体=" + contract.getCompany())
                .reason(contract.getRemark())
                .effectiveDate(contract.getStartDate()));
        return contract;
    }

    @Override
    public EmpContract update(Long userId, Long id, EmpContract contract) {
        requireUser(userId);
        EmpContract existing = requireOwned(userId, id);
        validate(contract, userId);
        existing.setContractNo(contract.getContractNo());
        existing.setContractType(contract.getContractType());
        existing.setCompany(contract.getCompany());
        existing.setStartDate(contract.getStartDate());
        existing.setEndDate(contract.getEndDate());
        existing.setSignDate(contract.getSignDate());
        existing.setStatus(contract.getStatus());
        existing.setChangeType(contract.getChangeType());
        existing.setPreviousContractId(contract.getPreviousContractId());
        existing.setTerminatedDate(contract.getTerminatedDate());
        existing.setTerminateReason(contract.getTerminateReason());
        existing.setEvidenceUrl(contract.getEvidenceUrl());
        existing.setEvidenceName(contract.getEvidenceName());
        existing.setRemark(contract.getRemark());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        contractMapper.updateById(existing);
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.CONTRACT_WRITE, userId)
                .detail("编辑合同 #" + id + " " + existing.getContractNo() + "［" + existing.getContractType() + "］ "
                        + existing.getStartDate() + "~" + endDateLabel(existing.getEndDate())
                        + " 主体=" + existing.getCompany())
                .reason(existing.getRemark())
                .effectiveDate(existing.getStartDate()));
        return existing;
    }

    @Override
    public void delete(Long userId, Long id) {
        requireUser(userId);
        EmpContract existing = requireOwned(userId, id);
        contractMapper.deleteById(id);
        // 删除后行只剩软删标记，审计是唯一能说「当时那份合同是什么」的地方
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.CONTRACT_WRITE, userId)
                .detail("删除合同 #" + id + " " + existing.getContractNo() + " "
                        + existing.getStartDate() + "~"
                        + (existing.getEndDate() == null ? "無固定期限" : existing.getEndDate()))
                .effectiveDate(existing.getStartDate()));
    }

    /** 审计文案里的止日：为空时必须写“无固定期限”，否则日志里只剩一个 null */
    private String endDateLabel(java.time.LocalDate endDate) {
        return endDate == null ? "無固定期限" : endDate.toString();
    }

    private void validate(EmpContract contract, Long userId) {
        if (!StringUtils.hasText(contract.getContractNo())) throw new BusinessException("合同編號不能為空");
        if (!StringUtils.hasText(contract.getContractType())) throw new BusinessException("合同類型不能為空");
        if (contract.getStartDate() == null) throw new BusinessException("合同開始日期不能為空");
        // 无固定期限合同不强制填结束日期（方案 6.2）：endDate 为空即「无固定期限」，
        // 不能再用「结束日期必填」把这类合同挡在门外；有值时仍校验不得早于开始日期
        if (contract.getEndDate() != null && contract.getEndDate().isBefore(contract.getStartDate())) {
            throw new BusinessException("合同結束日期不能早於開始日期");
        }
        // 签续变解：每份合同一行，续签/变更必须指向同一人的上一份合同，否则链路会串到别人身上
        String changeType = StringUtils.hasText(contract.getChangeType())
                ? contract.getChangeType().toUpperCase() : "NEW";
        if (!CHANGE_TYPES.contains(changeType)) {
            throw new BusinessException("變更類型只能是 NEW / RENEW / CHANGE");
        }
        contract.setChangeType(changeType);
        if (!"NEW".equals(changeType)) {
            if (contract.getPreviousContractId() == null) {
                throw new BusinessException("續簽/變更必須關聯上一份合同");
            }
            EmpContract previous = contractMapper.selectById(contract.getPreviousContractId());
            if (previous == null || !userId.equals(previous.getUserId())) {
                throw new BusinessException("關聯的上一份合同不屬於該員工");
            }
        }
        if (contract.getTerminatedDate() != null && contract.getTerminatedDate().isBefore(contract.getStartDate())) {
            throw new BusinessException("解除日期不能早於合同開始日期");
        }
        if (contract.getEvidenceUrl() != null && contract.getEvidenceUrl().length() > 500) {
            throw new BusinessException("證據地址過長");
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
