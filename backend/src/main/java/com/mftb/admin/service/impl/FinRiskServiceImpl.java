package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.FinRiskConfigDTO;
import com.mftb.admin.dto.FinRiskPageRow;
import com.mftb.admin.dto.FinRiskQuery;
import com.mftb.admin.dto.FinRiskVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.entity.FinDebtBill;
import com.mftb.admin.entity.FinRiskConfig;
import com.mftb.admin.mapper.FinAccountMapper;
import com.mftb.admin.mapper.FinBatchMapper;
import com.mftb.admin.mapper.FinDebtBillMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.mapper.FinRiskConfigMapper;
import com.mftb.admin.service.FinRiskService;
import com.mftb.admin.util.FinExtras;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 推广金消费风控服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinRiskServiceImpl implements FinRiskService {

    private final FinRiskConfigMapper riskConfigMapper;
    private final FinDebtBillMapper debtBillMapper;
    private final FinBatchMapper batchMapper;
    private final FinDetailMapper detailMapper;
    private final FinAccountMapper accountMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 额度计算 ==================== */

    @Override
    public FinRiskCheck check(String groupCode, String brand) {
        BigDecimal debt = FinExtras.nonNull(debtBillMapper.sumUnsettled(groupCode, brand));
        FinRiskConfig config = findConfig(groupCode, brand);
        String releaseMode = config == null || config.getReleaseMode() == null
                ? RELEASE_REPAY : config.getReleaseMode();
        BigDecimal consumed = FinExtras.nonNull(detailMapper.sumNetConsume(groupCode, brand));

        // 登记制：未登记 / 停用 / 无未结清欠款 的集团均不限制消费
        boolean active = config != null && STATUS_ENABLED.equals(config.getStatus());
        if (!active || debt.compareTo(BigDecimal.ZERO) <= 0) {
            BigDecimal base = calcBatchPool(groupCode, brand, BigDecimal.ZERO).base();
            return new FinRiskCheck(false, releaseMode, debt, base, consumed, BigDecimal.ZERO, null);
        }

        // 可用 = MAX(0, 全额池 + 分期已付 - 累计已消费) + 当月释放（monthly=Σ批次未付×比例 / repay=0）
        BigDecimal ratio = RELEASE_MONTHLY.equals(releaseMode)
                ? FinExtras.nonNull(config.getMonthlyReleaseRatio()) : BigDecimal.ZERO;
        BatchPool pool = calcBatchPool(groupCode, brand, ratio);
        BigDecimal available = pool.base().subtract(consumed).max(BigDecimal.ZERO).add(pool.monthlyRelease());
        return new FinRiskCheck(true, releaseMode, debt, pool.base(), consumed,
                FinExtras.round2(pool.monthlyRelease()), FinExtras.round2(available));
    }

    /**
     * 批次级池拆解：
     * - 全额支付批次（对公转账）与赠送批次：不限制，虚拟充值金额全额计入自由池；
     * - 分期支付批次（混合/营业额支付）：已付 = 实收 - 未结清欠款，可直接消费；
     *   未付 = 未结清欠款，按「每月释放比例」逐批次授予当月额度。
     */
    private BatchPool calcBatchPool(String groupCode, String brand, BigDecimal ratio) {
        List<FinBatch> batches = batchMapper.selectList(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getGroupCode, groupCode)
                        .eq(FinBatch::getBrand, brand)
                        .eq(FinBatch::getBatchType, "recharge")
                        .gt(FinBatch::getVirtualAmount, BigDecimal.ZERO)
                        .orderByAsc(FinBatch::getTradeTime)
                        .orderByAsc(FinBatch::getId));
        Map<String, BigDecimal> unpaidByBatch = debtBillMapper.selectList(
                new LambdaQueryWrapper<FinDebtBill>()
                        .eq(FinDebtBill::getGroupCode, groupCode)
                        .eq(FinDebtBill::getBrand, brand)
                        .eq(FinDebtBill::getStatus, "unsettled"))
                .stream().collect(Collectors.groupingBy(FinDebtBill::getBatchNo,
                        Collectors.reducing(BigDecimal.ZERO, b -> FinExtras.nonNull(b.getRemainAmount()), BigDecimal::add)));

        BigDecimal free = BigDecimal.ZERO;
        BigDecimal paidInst = BigDecimal.ZERO;
        BigDecimal releaseTotal = BigDecimal.ZERO;
        for (FinBatch batch : batches) {
            Map<String, Object> extra = JsonUtils.parseMap(batch.getExtra());
            String payMethod = extra.get("payMethod") == null ? "" : String.valueOf(extra.get("payMethod"));
            boolean isActual = "是".equals(batch.getIsActual());
            boolean installment = isActual && !PAY_CORPORATE.equals(payMethod);

            if (!installment) {
                // 全额支付 / 赠送批次：不限制，全额计入自由池
                free = free.add(FinExtras.nonNull(batch.getVirtualAmount()));
            } else {
                // 分期批次：已付可直接消费；未付按比例逐月释放
                BigDecimal unpaid = unpaidByBatch.getOrDefault(batch.getBatchNo(), BigDecimal.ZERO);
                paidInst = paidInst.add(FinExtras.nonNull(batch.getActualAmount()).subtract(unpaid).max(BigDecimal.ZERO));
                releaseTotal = releaseTotal.add(FinExtras.round2(unpaid.multiply(FinExtras.nonNull(ratio))));
            }
        }
        return new BatchPool(free, paidInst, releaseTotal);
    }

    /** 批次池拆解（base = 自由池 + 分期已付） */
    private record BatchPool(BigDecimal freePool, BigDecimal paidInstallment, BigDecimal monthlyRelease) {
        BigDecimal base() {
            return freePool.add(paidInstallment);
        }
    }

    @Override
    public void requireConsumable(String groupCode, String brand, BigDecimal amount) {
        FinRiskCheck check = check(groupCode, brand);
        if (!check.limited()) {
            return;
        }
        if (FinExtras.nonNull(amount).compareTo(check.availableAmount()) > 0) {
            throw new BusinessException("集團 " + groupCode + "（" + brandLabel(brand)
                    + "）推廣金消費受風控限額：當前可用額度 MOP " + check.availableAmount().toPlainString()
                    + "，本次消費 MOP " + FinExtras.round2(amount).toPlainString()
                    + "，請先償還欠款或聯繫財務調整風控額度");
        }
    }

    /* ==================== 转账欠款批次检查 ==================== */

    /**
     * 按批次交易时间升序 FIFO 模拟转账扣款拆分（口径与写入链 splitByFifo 保持一致），
     * 返回会触碰的含未结清欠款批次
     */
    @Override
    public List<FinTransferBlock> checkTransferBatches(String groupCode, BigDecimal amount) {
        List<FinBatch> batches = batchMapper.selectList(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getGroupCode, groupCode)
                        .gt(FinBatch::getVirtualAmount, BigDecimal.ZERO)
                        .orderByAsc(FinBatch::getTradeTime)
                        .orderByAsc(FinBatch::getId));
        List<FinTransferBlock> blocks = new ArrayList<>();
        BigDecimal remaining = FinExtras.nonNull(amount);
        for (FinBatch batch : batches) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
            BigDecimal deductible = FinExtras.nonNull(batch.getVirtualAmount())
                    .subtract(FinExtras.nonNull(detailMapper.sumDeductedByBatchNo(batch.getBatchNo())));
            if (deductible.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal take = deductible.min(remaining);
            BigDecimal unsettled = FinExtras.nonNull(debtBillMapper.sumUnsettledByBatchNo(batch.getBatchNo()));
            if (unsettled.compareTo(BigDecimal.ZERO) > 0) {
                blocks.add(new FinTransferBlock(batch.getBatchNo(), unsettled));
            }
            remaining = remaining.subtract(take);
        }
        return blocks;
    }

    /* ==================== 列表 ==================== */

    @Override
    public PageResult<FinRiskVO> page(FinRiskQuery query) {
        LocalDateTime updatedFrom = parseDateStart(query.getUpdatedFrom());
        LocalDateTime updatedTo = parseDateEndExclusive(query.getUpdatedTo());
        long total = riskConfigMapper.countRisk(query.getGroupId(), query.getGroupName(),
                query.getBrand(), query.getAccountStatus(), query.getReleaseMode(),
                query.getUpdatedBy(), updatedFrom, updatedTo);
        long offset = (PageResult.normalizePage(query.getPage()) - 1) * PageResult.normalizeSize(query.getSize());
        List<FinRiskVO> records = total == 0 ? List.of()
                : riskConfigMapper.selectRiskPage(query.getGroupId(), query.getGroupName(),
                        query.getBrand(), query.getAccountStatus(), query.getReleaseMode(),
                        query.getUpdatedBy(), updatedFrom, updatedTo,
                        offset, PageResult.normalizeSize(query.getSize()))
                        .stream().map(this::buildVO).toList();
        return new PageResult<>(records, total);
    }

    /** 日期下界（当天 00:00:00），非法格式返回 null */
    private static LocalDateTime parseDateStart(String date) {
        try {
            return date == null || date.isBlank() ? null : java.time.LocalDate.parse(date).atStartOfDay();
        } catch (Exception e) {
            return null;
        }
    }

    /** 日期上界（次日 00:00:00 开区间），非法格式返回 null */
    private static LocalDateTime parseDateEndExclusive(String date) {
        try {
            return date == null || date.isBlank() ? null : java.time.LocalDate.parse(date).plusDays(1).atStartOfDay();
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public FinRiskVO getConfig(String groupCode, String brand) {
        FinRiskPageRow row = new FinRiskPageRow();
        row.setGroupId(groupCode);
        row.setGroupName(resolveGroupName(groupCode, brand));
        row.setBrand(brand);
        FinAccount account = findAccount(groupCode, brand);
        row.setAccountStatus(account == null || account.getStatus() == null ? "normal" : account.getStatus());
        FinRiskConfig config = findConfig(groupCode, brand);
        row.setReleaseMode(config == null || config.getReleaseMode() == null ? RELEASE_REPAY : config.getReleaseMode());
        row.setMonthlyReleaseRatio(config == null ? null : config.getMonthlyReleaseRatio());
        row.setStatus(config == null ? STATUS_DISABLED : config.getStatus());
        row.setRemark(config == null ? null : config.getRemark());
        row.setUpdatedBy(config == null ? null : config.getUpdatedBy());
        return buildVO(row);
    }

    /** 原始行 + 额度聚合 → 列表视图对象 */
    private FinRiskVO buildVO(FinRiskPageRow row) {
        FinRiskCheck check = check(row.getGroupId(), row.getBrand());
        FinRiskVO vo = new FinRiskVO();
        vo.setGroupId(row.getGroupId());
        vo.setGroupName(row.getGroupName());
        vo.setBrand(row.getBrand());
        vo.setUnsettledDebt(check.unsettledDebt());
        vo.setPaidPool(check.paidPool());
        vo.setTotalConsumed(check.totalConsumed());
        vo.setMonthlyRelease(check.monthlyRelease());
        vo.setAvailableAmount(check.availableAmount());
        vo.setLimited(check.limited());
        vo.setReleaseMode(check.releaseMode());
        vo.setMonthlyReleaseRatio(row.getMonthlyReleaseRatio());
        vo.setStatus(row.getStatus());
        vo.setAccountStatus(row.getAccountStatus());
        vo.setRemark(row.getRemark());
        vo.setUpdatedBy(row.getUpdatedBy());
        vo.setUpdatedAt(row.getUpdatedAt());
        return vo;
    }

    /* ==================== 配置保存 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveConfig(FinRiskConfigDTO dto) {
        if (!StringUtils.hasText(dto.getGroupId()) || !StringUtils.hasText(dto.getBrand())) {
            throw new BusinessException("缺少集团或品牌信息");
        }
        String releaseMode = StringUtils.hasText(dto.getReleaseMode()) ? dto.getReleaseMode() : RELEASE_REPAY;
        if (!RELEASE_REPAY.equals(releaseMode) && !RELEASE_MONTHLY.equals(releaseMode)) {
            throw new BusinessException("未知的风控模式: " + releaseMode);
        }
        if (RELEASE_MONTHLY.equals(releaseMode)
                && (dto.getMonthlyReleaseRatio() == null
                || dto.getMonthlyReleaseRatio().compareTo(BigDecimal.ZERO) <= 0
                || dto.getMonthlyReleaseRatio().compareTo(BigDecimal.ONE) > 0)) {
            throw new BusinessException("每月释放比例需大于 0 且不超过 100%");
        }

        FinRiskConfig config = findConfig(dto.getGroupId(), dto.getBrand());
        boolean isNew = config == null;
        if (isNew) {
            config = new FinRiskConfig();
            config.setGroupCode(dto.getGroupId());
            config.setBrand(dto.getBrand());
        }
        config.setGroupName(StringUtils.hasText(dto.getGroupName())
                ? dto.getGroupName() : resolveGroupName(dto.getGroupId(), dto.getBrand()));
        config.setReleaseMode(releaseMode);
        config.setMonthlyReleaseRatio(RELEASE_MONTHLY.equals(releaseMode) ? dto.getMonthlyReleaseRatio() : null);
        config.setRemark(StringUtils.hasText(dto.getRemark()) ? dto.getRemark() : null);
        config.setUpdatedBy(operatorResolver.currentOperatorName());
        if (isNew) {
            // 新增登记默认启用，立即生效限额管控
            config.setStatus(STATUS_ENABLED);
            riskConfigMapper.insert(config);
        } else {
            riskConfigMapper.updateById(config);
        }
        log.info("保存推广金风控配置: group={}, brand={}, release={}, ratio={}",
                dto.getGroupId(), dto.getBrand(), releaseMode, config.getMonthlyReleaseRatio());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStatus(String groupCode, String brand, String status) {
        if (!STATUS_ENABLED.equals(status) && !STATUS_DISABLED.equals(status)) {
            throw new BusinessException("未知的风控状态: " + status);
        }
        FinRiskConfig config = findConfig(groupCode, brand);
        if (config == null) {
            throw new BusinessException("集团 " + groupCode + "（" + brandLabel(brand) + "）未登记消费风控，请先新增");
        }
        config.setStatus(status);
        config.setUpdatedBy(operatorResolver.currentOperatorName());
        riskConfigMapper.updateById(config);
        log.info("更新推广金风控状态: group={}, brand={}, status={}", groupCode, brand, status);
    }

    /* ==================== 公共方法 ==================== */

    /** 按集团+品牌查询风控配置 */
    private FinRiskConfig findConfig(String groupCode, String brand) {
        return riskConfigMapper.selectOne(
                new LambdaQueryWrapper<FinRiskConfig>()
                        .eq(FinRiskConfig::getGroupCode, groupCode)
                        .eq(FinRiskConfig::getBrand, brand));
    }

    /** 按集团+品牌查询账户 */
    private FinAccount findAccount(String groupCode, String brand) {
        return accountMapper.selectOne(
                new LambdaQueryWrapper<FinAccount>()
                        .eq(FinAccount::getGroupCode, groupCode)
                        .eq(FinAccount::getBrand, brand));
    }

    /** 集团名称：优先账户快照，缺失时回退集团编码 */
    private String resolveGroupName(String groupCode, String brand) {
        FinAccount account = findAccount(groupCode, brand);
        if (account != null && StringUtils.hasText(account.getGroupName())) {
            return account.getGroupName();
        }
        FinAccount any = accountMapper.selectOne(
                new LambdaQueryWrapper<FinAccount>()
                        .eq(FinAccount::getGroupCode, groupCode)
                        .last("LIMIT 1"));
        return any != null && StringUtils.hasText(any.getGroupName()) ? any.getGroupName() : groupCode;
    }

    /** 品牌展示名（flashBee=闪蜂） */
    private static String brandLabel(String brand) {
        return "flashBee".equals(brand) ? "闪蜂" : String.valueOf(brand);
    }
}
