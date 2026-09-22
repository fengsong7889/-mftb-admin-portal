package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamConsumableClaimService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * 耗材领用服务实现（提交即领用：自动通过 + 直接出库扣减，无审批节点）
 * <p>
 * 简化后的库存生命周期：
 * <ul>
 *   <li>submit：逐项校验可用量 → lock 占用 → deductOnIssue 直接扣减 → 写 out_claim 流水；单据直接落为 issued</li>
 *   <li>approve / issue：保留以兼容历史「待审批 / 已审批」单据的流转，新流程不再经过</li>
 *   <li>cancel：仅历史 pending/approved 单可撤销并释放占用；issued 单不可撤销</li>
 * </ul>
 * 所有状态流转前 selectForUpdate 加行锁，防并发重复出库。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamConsumableClaimServiceImpl implements EamConsumableClaimService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter TXN_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final EamConsumableClaimMapper claimMapper;
    private final EamConsumableClaimItemMapper claimItemMapper;
    private final EamConsumableStockMapper stockMapper;
    private final EamConsumableItemMapper itemMapper;
    private final EamConsumableTxnMapper txnMapper;
    private final EamLocationMapper locationMapper;
    private final SysUserMapper userMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<EamConsumableClaimVO> page(EamConsumableClaimQuery query) {
        LambdaQueryWrapper<EamConsumableClaim> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(EamConsumableClaim::getClaimNo, kw)
                    .or().like(EamConsumableClaim::getApplicantName, kw)
                    .or().like(EamConsumableClaim::getReason, kw));
        }
        if (StringUtils.hasText(query.getStatus())) wrapper.eq(EamConsumableClaim::getStatus, query.getStatus());
        if (query.getApplicantId() != null) wrapper.eq(EamConsumableClaim::getApplicantId, query.getApplicantId());
        wrapper.orderByDesc(EamConsumableClaim::getId);

        Page<EamConsumableClaim> page = claimMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableClaim> rows = page.getRecords();
        Map<Long, List<EamConsumableClaimItem>> itemMap = loadItemsByClaimIds(
                rows.stream().map(EamConsumableClaim::getId).toList());
        List<EamConsumableClaimVO> records = rows.stream()
                .map(c -> toVO(c, itemMap.getOrDefault(c.getId(), List.of()))).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamConsumableClaimVO detail(long claimId) {
        EamConsumableClaim claim = requireClaim(claimId);
        return toVO(claim, loadItems(claimId));
    }

    @Override
    public PageResult<EamConsumableClaimVO> myClaims(EamConsumableClaimQuery query) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) throw new BusinessException("未登錄");
        query.setApplicantId(current.getId());
        query.setMine(null);
        return page(query);
    }

    @Override
    public EamConsumableClaimVO myDetail(long claimId) {
        SysUser current = operatorResolver.currentUser();
        EamConsumableClaim claim = requireClaim(claimId);
        if (current == null || !Objects.equals(current.getId(), claim.getApplicantId()))
            throw new BusinessException(403, "僅可查看本人領用");
        return toVO(claim, loadItems(claimId));
    }

    /* ==================== 提交申请 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long submit(EamConsumableClaimSaveDTO dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) throw new BusinessException("未登錄");
        if (dto.getItems() == null || dto.getItems().isEmpty()) throw new BusinessException("請至少選擇一項耗材");
        if (!StringUtils.hasText(dto.getReason())) throw new BusinessException("請填寫領用事由");

        // 确定领用人：指定 applicantId（sys_user 主键）且非本人时查库校验存在
        SysUser applicant = current;
        if (dto.getApplicantId() != null && !dto.getApplicantId().equals(current.getId())) {
            applicant = userMapper.selectById(dto.getApplicantId());
            if (applicant == null) throw new BusinessException("領用人不存在");
        }

        // 预校验：启用 + 归属已设置 + 单品牌/单公司 + 按耗材合并限领量
        Map<Long, Integer> qtyByItem = new LinkedHashMap<>();
        Long brand = null;
        Long company = null;
        String companyName = "";
        for (EamConsumableClaimSaveDTO.Line line : dto.getItems()) {
            if (line.getItemId() == null) throw new BusinessException("明細缺少耗材");
            if (line.getQty() == null || line.getQty() <= 0) throw new BusinessException("領用數量必須大於 0");
            EamConsumableItem item = itemMapper.selectById(line.getItemId());
            if (item == null) throw new BusinessException("耗材不存在");
            if (!"enabled".equals(item.getStatus())) throw new BusinessException("耗材已停用：" + item.getName());
            if (item.getCompanyBrand() == null || item.getPurchaseCompanyId() == null)
                throw new BusinessException("耗材檔案未設置所屬品牌/購買公司：" + item.getName());
            if (brand == null) {
                brand = item.getCompanyBrand();
                company = item.getPurchaseCompanyId();
                companyName = nullToEmpty(item.getPurchaseCompany());
            } else if (!brand.equals(item.getCompanyBrand()) || !company.equals(item.getPurchaseCompanyId())) {
                throw new BusinessException("一張領用單僅限同一所屬品牌與購買公司");
            }
            qtyByItem.merge(line.getItemId(), line.getQty(), Integer::sum);
        }
        for (Map.Entry<Long, Integer> e : qtyByItem.entrySet()) {
            EamConsumableItem item = itemMapper.selectById(e.getKey());
            if (item != null && item.getPerClaimLimit() != null && item.getPerClaimLimit() > 0
                    && e.getValue() > item.getPerClaimLimit()) {
                throw new BusinessException(item.getName() + " 單次限領 " + item.getPerClaimLimit() + item.getUnit());
            }
        }

        String claimNo = bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_CLAIM);
        EamConsumableClaim claim = new EamConsumableClaim();
        claim.setClaimNo(claimNo);
        claim.setApplicantId(applicant.getId());
        claim.setApplicantName(StringUtils.hasText(applicant.getName()) ? applicant.getName() : applicant.getUsername());
        claim.setApplicantEmpId(nullToEmpty(applicant.getEmpId()));
        claim.setDepartment(nullToEmpty(applicant.getDepartment()));
        claim.setCompanyBrand(brand);
        claim.setPurchaseCompanyId(company);
        claim.setPurchaseCompany(companyName);
        claim.setReason(dto.getReason().trim());
        // 提交即占用进入待发放（pending），不自动出库；实际成本在仓管确认发放时按加权均价结转
        claim.setStatus("pending");
        claim.setCostAmount(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        String op = operatorResolver.currentOperatorName();
        claim.setCreatedBy(op);
        claim.setUpdatedBy(op);
        claimMapper.insert(claim);

        // 逐项占用库存（任一失败整体回滚）
        for (EamConsumableClaimSaveDTO.Line line : dto.getItems()) {
            EamConsumableItem item = itemMapper.selectById(line.getItemId());
            long locationId = line.getLocationId() == null ? 0L : line.getLocationId();
            String locationName = resolveLocationName(locationId);
            if (locationId != 0 && locationName == null) throw new BusinessException("倉庫不存在");

            int locked = stockMapper.lock(item.getId(), locationId, line.getQty());
            if (locked == 0) {
                EamConsumableStock s = stockMapper.selectForUpdate(item.getId(), locationId);
                int available = s == null ? 0 : (nz(s.getQty()) - nz(s.getLockedQty()));
                throw new BusinessException(item.getName() + " 可用庫存不足（當前可用 " + available + "）");
            }

            EamConsumableClaimItem ci = new EamConsumableClaimItem();
            ci.setClaimId(claim.getId());
            ci.setItemId(item.getId());
            ci.setItemCode(item.getItemCode());
            ci.setItemName(item.getName());
            ci.setSpec(nullToEmpty(item.getSpec()));
            ci.setUnit(nullToEmpty(item.getUnit()));
            ci.setQty(line.getQty());
            ci.setLocationId(locationId);
            ci.setLocationName(locationName == null ? "" : locationName);
            ci.setCompanyBrand(item.getCompanyBrand());
            ci.setPurchaseCompanyId(item.getPurchaseCompanyId());
            ci.setReturnedQty(0);
            claimItemMapper.insert(ci);
        }
        return claim.getId();
    }

    /* ==================== 审批 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approve(EamConsumableApproveDTO dto) {
        if (dto.getClaimId() == null) throw new BusinessException("缺少領用單 ID");
        EamConsumableClaim claim = claimMapper.selectForUpdate(dto.getClaimId());
        if (claim == null) throw new BusinessException("領用單不存在");
        if (!"pending".equals(claim.getStatus())) throw new BusinessException("僅待審批單可審批，當前狀態：" + claim.getStatus());

        SysUser approver = operatorResolver.currentUser();
        boolean pass = Boolean.TRUE.equals(dto.getPass());
        claim.setApproverId(approver != null ? approver.getId() : null);
        claim.setApproverName(operatorResolver.currentOperatorName());
        claim.setApprovedAt(LocalDateTime.now());
        claim.setApproveRemark(nullToEmpty(dto.getRemark()));
        claim.setUpdatedBy(operatorResolver.currentOperatorName());

        if (pass) {
            claim.setStatus("approved");
            claimMapper.updateById(claim);
        } else {
            claim.setStatus("rejected");
            claimMapper.updateById(claim);
            releaseAll(claim.getId()); // 驳回释放占用
        }
    }

    /* ==================== 出库核销 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void issue(long claimId) {
        EamConsumableClaim claim = claimMapper.selectForUpdate(claimId);
        if (claim == null) throw new BusinessException("領用單不存在");
        // 新流程：待发放(pending)直接发放出库；历史已审批(approved)兼容出库
        if (!"pending".equals(claim.getStatus()) && !"approved".equals(claim.getStatus()))
            throw new BusinessException("僅待發放/待出庫單可發放，當前狀態：" + claim.getStatus());

        SysUser op = operatorResolver.currentUser();
        BigDecimal cost = deductAllForIssue(claim);

        claim.setStatus("issued");
        claim.setCostAmount(cost);
        claim.setIssueOperatorId(op != null ? op.getId() : null);
        claim.setIssueOperator(operatorResolver.currentOperatorName());
        claim.setIssuedAt(LocalDateTime.now());
        claim.setUpdatedBy(operatorResolver.currentOperatorName());
        claimMapper.updateById(claim);
    }

    /**
     * 逐项扣减库存并按移动加权均价结转成本、写出库流水（submit 不再调用，仅 issue 调用）。
     * 调用前明细已插入且库存已 lock 占用，此处 deductOnIssue 同时扣减 qty 与 locked_qty，
     * 并基于 FOR UPDATE 快照写入新 total_cost（清仓时置 0 避免尾差）。
     * @return 本单出库成本合计
     */
    private BigDecimal deductAllForIssue(EamConsumableClaim claim) {
        List<EamConsumableClaimItem> items = loadItems(claim.getId());
        String op = operatorResolver.currentOperatorName();
        BigDecimal total = BigDecimal.ZERO;
        for (EamConsumableClaimItem ci : items) {
            EamConsumableStock before = stockMapper.selectForUpdate(ci.getItemId(), ci.getLocationId());
            int beforeQty = before == null ? 0 : nz(before.getQty());
            int qty = nz(ci.getQty());
            BigDecimal avg = before != null && before.getAvgCost() != null
                    ? before.getAvgCost() : BigDecimal.ZERO;
            BigDecimal oldTotal = before != null && before.getTotalCost() != null
                    ? before.getTotalCost() : BigDecimal.ZERO;
            BigDecimal costAmount = EamConsumableServiceImpl.money(avg.multiply(BigDecimal.valueOf(qty)));
            int afterQty = beforeQty - qty;
            BigDecimal newTotal = afterQty <= 0
                    ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                    : EamConsumableServiceImpl.money(oldTotal.subtract(costAmount).max(BigDecimal.ZERO));

            int rows = stockMapper.deductOnIssue(ci.getItemId(), ci.getLocationId(), qty, newTotal, op);
            if (rows == 0) throw new BusinessException("庫存不足，出庫失敗：" + ci.getItemName());

            ci.setActualUnitCost(avg.setScale(6, RoundingMode.HALF_UP));
            ci.setAmount(costAmount);
            ci.setUnitCost(avg.setScale(2, RoundingMode.HALF_UP));
            claimItemMapper.updateById(ci);

            writeTxn(claim, ci, "out_claim", -qty, beforeQty, afterQty, costAmount.negate(),
                    "領用出庫 " + claim.getClaimNo());
            total = total.add(costAmount);
        }
        return EamConsumableServiceImpl.money(total);
    }

    /* ==================== 撤销 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long claimId, String reason) {
        EamConsumableClaim claim = claimMapper.selectForUpdate(claimId);
        if (claim == null) throw new BusinessException("領用單不存在");
        // 仅申请人本人或管理员可撤销
        SysUser current = operatorResolver.currentUser();
        if (current == null) throw new BusinessException("未登錄");
        boolean owner = Objects.equals(current.getId(), claim.getApplicantId());
        if (!owner && !operatorResolver.isAdmin(current)
                && !operatorResolver.functionRoleCodes(current).contains("admin")) {
            throw new BusinessException(403, "僅本人或管理員可撤銷");
        }
        if (!"pending".equals(claim.getStatus()) && !"approved".equals(claim.getStatus()))
            throw new BusinessException("僅待審批/已審批單可撤銷，當前狀態：" + claim.getStatus());
        releaseAll(claimId);
        claim.setStatus("cancelled");
        claim.setCancelReason(nullToEmpty(reason));
        claim.setUpdatedBy(operatorResolver.currentOperatorName());
        claimMapper.updateById(claim);
    }

    /* ==================== 内部工具 ==================== */

    /** 释放某领用单全部明细的库存占用 */
    private void releaseAll(long claimId) {
        for (EamConsumableClaimItem ci : loadItems(claimId)) {
            stockMapper.releaseLock(ci.getItemId(), ci.getLocationId(), ci.getQty());
        }
    }

    private void writeTxn(EamConsumableClaim claim, EamConsumableClaimItem ci, String txnType,
                          int qty, int beforeQty, int afterQty, BigDecimal amount, String remark) {
        EamConsumableTxn txn = new EamConsumableTxn();
        txn.setTxnNo("CK" + LocalDateTime.now().format(TXN_FMT) + ThreadLocalRandom.current().nextInt(1000, 9999));
        txn.setItemId(ci.getItemId());
        txn.setItemCode(ci.getItemCode());
        txn.setItemName(ci.getItemName());
        txn.setLocationId(ci.getLocationId());
        txn.setLocationName(ci.getLocationName());
        txn.setTxnType(txnType);
        txn.setQty(qty);
        txn.setBeforeQty(beforeQty);
        txn.setAfterQty(afterQty);
        txn.setUnitCost(ci.getActualUnitCost() != null ? ci.getActualUnitCost() : ci.getUnitCost());
        txn.setAmount(amount);
        txn.setCompanyBrand(claim.getCompanyBrand());
        txn.setPurchaseCompanyId(claim.getPurchaseCompanyId());
        txn.setDepartmentId(claim.getDepartmentId());
        txn.setDepartment(claim.getDepartment());
        txn.setApplicantId(claim.getApplicantId());
        txn.setApplicantEmpId(claim.getApplicantEmpId());
        txn.setApplicantName(claim.getApplicantName());
        txn.setBizDate(LocalDate.now());
        txn.setRefType("claim");
        txn.setRefId(claim.getId());
        SysUser op = operatorResolver.currentUser();
        txn.setOperatorId(op != null ? op.getId() : null);
        txn.setOperator(operatorResolver.currentOperatorName());
        txn.setRemark(remark);
        txnMapper.insert(txn);
    }

    private EamConsumableClaim requireClaim(long id) {
        EamConsumableClaim claim = claimMapper.selectById(id);
        if (claim == null) throw new BusinessException("領用單不存在");
        return claim;
    }

    private List<EamConsumableClaimItem> loadItems(long claimId) {
        return claimItemMapper.selectList(new LambdaQueryWrapper<EamConsumableClaimItem>()
                .eq(EamConsumableClaimItem::getClaimId, claimId)
                .orderByAsc(EamConsumableClaimItem::getId));
    }

    private Map<Long, List<EamConsumableClaimItem>> loadItemsByClaimIds(List<Long> claimIds) {
        if (claimIds == null || claimIds.isEmpty()) return Map.of();
        List<EamConsumableClaimItem> all = claimItemMapper.selectList(
                new LambdaQueryWrapper<EamConsumableClaimItem>().in(EamConsumableClaimItem::getClaimId, claimIds));
        return all.stream().collect(Collectors.groupingBy(EamConsumableClaimItem::getClaimId));
    }

    private EamConsumableClaimVO toVO(EamConsumableClaim c, List<EamConsumableClaimItem> items) {
        EamConsumableClaimVO vo = new EamConsumableClaimVO();
        vo.setId(c.getId());
        vo.setClaimNo(c.getClaimNo());
        vo.setApplicantId(c.getApplicantId());
        vo.setApplicantName(c.getApplicantName());
        vo.setApplicantEmpId(c.getApplicantEmpId());
        vo.setDepartment(c.getDepartment());
        vo.setDepartmentId(c.getDepartmentId());
        vo.setCompanyBrand(c.getCompanyBrand());
        vo.setPurchaseCompanyId(c.getPurchaseCompanyId());
        vo.setPurchaseCompany(c.getPurchaseCompany());
        vo.setCostAmount(c.getCostAmount());
        vo.setReason(c.getReason());
        vo.setStatus(c.getStatus());
        vo.setApproverId(c.getApproverId());
        vo.setApproverName(c.getApproverName());
        vo.setApprovedAt(dt(c.getApprovedAt()));
        vo.setApproveRemark(c.getApproveRemark());
        vo.setIssueOperator(c.getIssueOperator());
        vo.setIssuedAt(dt(c.getIssuedAt()));
        vo.setCancelReason(c.getCancelReason());
        vo.setCreatedBy(c.getCreatedBy());
        vo.setCreatedAt(dt(c.getCreatedAt()));
        vo.setUpdatedBy(c.getUpdatedBy());
        vo.setUpdatedAt(dt(c.getUpdatedAt()));
        List<EamConsumableClaimItemVO> itemVOs = items.stream().map(ci -> {
            EamConsumableClaimItemVO iv = new EamConsumableClaimItemVO();
            iv.setId(ci.getId());
            iv.setItemId(ci.getItemId());
            iv.setItemCode(ci.getItemCode());
            iv.setItemName(ci.getItemName());
            iv.setSpec(ci.getSpec());
            iv.setUnit(ci.getUnit());
            iv.setQty(ci.getQty());
            iv.setLocationId(ci.getLocationId());
            iv.setLocationName(ci.getLocationName());
            iv.setUnitCost(ci.getUnitCost());
            iv.setActualUnitCost(ci.getActualUnitCost());
            iv.setAmount(ci.getAmount());
            iv.setReturnedQty(ci.getReturnedQty());
            return iv;
        }).toList();
        vo.setItems(itemVOs);
        vo.setTotalKinds(itemVOs.size());
        vo.setTotalQty(itemVOs.stream().mapToInt(i -> nz(i.getQty())).sum());
        return vo;
    }

    private String resolveLocationName(long locationId) {
        if (locationId == 0) return "默認倉";
        EamLocation loc = locationMapper.selectById(locationId);
        return loc == null ? null : loc.getName();
    }

    private static int nz(Integer v) { return v == null ? 0 : v; }
    private static String nullToEmpty(String s) { return s == null ? "" : s; }
    private static String dt(LocalDateTime t) { return t == null ? null : t.format(DT_FMT); }
}
