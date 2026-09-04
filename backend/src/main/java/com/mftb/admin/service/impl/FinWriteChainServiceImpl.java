package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.entity.FinDebtBill;
import com.mftb.admin.entity.FinDebtRepayment;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.FinBatchMapper;
import com.mftb.admin.mapper.FinDebtBillMapper;
import com.mftb.admin.mapper.FinDebtRepaymentMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinRiskService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.FinExtras;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审批通过后的写入链路实现（移植 approvalStore.writeApprovedRecords）
 * <p>
 * 账户余额口径：账户余额变动 = 本次写入明细的变动合计，
 * 保证「账户余额」「明细流水」「充消对账期末余额」三处始终勾稽一致。
 */
@Service
@RequiredArgsConstructor
public class FinWriteChainServiceImpl implements FinWriteChainService {

    /** 集团维度交易的默认业务频道 */
    private static final String DEFAULT_CHANNEL = "外賣";

    /** 交易类型 */
    public static final String TRADE_RECHARGE = "充值";
    public static final String TRADE_DEDUCT = "扣款";
    public static final String TRADE_CONSUME = "消費";
    public static final String TRADE_OUT = "轉出";
    public static final String TRADE_IN = "轉入";

    /** 营业额支付扣款明细备注（充消对账据此识别「营业额支付」构成） */
    public static final String REMARK_REVENUE_PAYMENT = "營業額支付扣款";

    /** 变动类别 */
    private static final String CHANGE_RECHARGE = "充值";
    public static final String CHANGE_BATCH_DEDUCT = "充值批次扣款";
    private static final String CHANGE_ACCOUNT_DEDUCT = "賬戶扣款";
    private static final String CHANGE_DEBT_REPAY = "欠款償還";
    private static final String CHANGE_TRANSFER_OUT = "轉賬轉出";
    private static final String CHANGE_TRANSFER_IN = "轉賬轉入";
    private static final String CHANGE_MERGE_OUT = "合併轉出";
    private static final String CHANGE_MERGE_IN = "合併轉入";

    private final FinBatchMapper batchMapper;
    private final FinDetailMapper detailMapper;
    private final FinDebtBillMapper debtBillMapper;
    private final FinDebtRepaymentMapper repaymentMapper;
    private final FinAccountService accountService;
    private final FinRiskService finRiskService;
    private final BizSeqService bizSeqService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void writeApprovedRecords(FinApproval approval, LocalDateTime tradeTime) {
        Map<String, Object> extra = JsonUtils.parseMap(approval.getExtra());
        switch (String.valueOf(approval.getApprovalType())) {
            case "recharge" -> writeRecharge(approval, extra, tradeTime);
            case "transfer" -> writeTransfer(approval, extra, tradeTime);
            case "deduct" -> writeDeduct(approval, extra, tradeTime);
            case "merge" -> writeMerge(approval, extra, tradeTime);
            default -> throw new BusinessException("未知的审批类型: " + approval.getApprovalType());
        }
    }

    /* ==================== 充值 ==================== */

    /**
     * 充值：1 条充值批次 + 充值明细 + 每个营业额扣款门店的扣款明细与欠款单
     */
    private void writeRecharge(FinApproval approval, Map<String, Object> extra, LocalDateTime tradeTime) {
        boolean isActual = FinExtras.flag(extra, "isActual");
        BigDecimal virtualAmount = FinExtras.amount(extra, "virtualAmount");
        BigDecimal actualTotal = isActual ? FinExtras.amount(extra, "actualTotal") : null;
        String bd = FinExtras.textOrDash(extra, "bd");
        String remark = FinExtras.textOrDash(extra, "remark");
        String batchNo = bizSeqService.next(BizSeqService.RULE_BATCH_RECHARGE);

        // 首次充值自动建户
        accountService.getOrCreate(approval.getGroupCode(), approval.getGroupName(), approval.getBrand());

        FinBatch batch = baseBatch(approval, tradeTime, batchNo, "recharge");
        batch.setGroupCode(approval.getGroupCode());
        batch.setGroupName(approval.getGroupName());
        batch.setIsActual(isActual ? "是" : "否");
        batch.setVirtualAmount(virtualAmount);
        batch.setActualAmount(actualTotal);
        batch.setDiscountAmount(FinExtras.amount(extra, "discountAmount"));
        batch.setBd(bd);
        batch.setRemark(remark);
        batch.setExtra(JsonUtils.toJson(extra));
        batchMapper.insert(batch);

        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();

        // 充值明细：只记录充值本身，不生成扣款门店明细（门店扣款仅在欠款对账中体现）
        FinDetail rechargeRow = baseDetail(approval, tradeTime, batchNo);
        rechargeRow.setTradeType(TRADE_RECHARGE);
        rechargeRow.setChangeType(CHANGE_RECHARGE);
        rechargeRow.setVirtualChange(virtualAmount);
        rechargeRow.setActualChange(actualTotal);
        rechargeRow.setBd(bd);
        rechargeRow.setRemark(remark);
        saveDetail(rechargeRow, deltas);

        // 实收充值含营业额支付时，每个扣款门店生成一条欠款单（不写入批次交易明细）
        List<Map<String, Object>> stores = FinExtras.rows(extra, "deductStores");
        String channelLabel = FinExtras.textOrDash(extra, "businessChannelLabel");
        LocalDate loanDate = tradeTime.toLocalDate();
        for (Map<String, Object> store : stores) {
            BigDecimal amount = FinExtras.amount(store, "amount");
            String storeCode = FinExtras.storeId(store);
            String storeName = FinExtras.storeName(store);

            if (isActual) {
                FinDebtBill bill = new FinDebtBill();
                bill.setBillNo(bizSeqService.next(BizSeqService.RULE_DEBT));
                bill.setGroupCode(approval.getGroupCode());
                bill.setGroupName(approval.getGroupName());
                bill.setBrand(approval.getBrand());
                bill.setStoreCode(storeCode);
                bill.setStoreName(storeName);
                bill.setChannel(channelLabel);
                bill.setBd(bd);
                bill.setSource("recharge");
                bill.setLoanDate(loanDate);
                bill.setBatchNo(batchNo);
                bill.setFlowNo(approval.getFlowNo());
                bill.setDebtTotal(amount);
                bill.setPaidAmount(BigDecimal.ZERO);
                bill.setRemainAmount(amount);
                bill.setStatus("unsettled");
                debtBillMapper.insert(bill);
            }
        }

        applyDeltas(deltas, approval.getBrand());
    }

    /* ==================== 转账 ==================== */

    /**
     * 转账：仅为转入方创建 1 条批次 + 1 条转入明细；
     * 转出方不创建批次，按 FIFO 从已有批次扣减，每个被扣批次各写 1 条转出明细。
     * 转账金额全部在虚拟账户，实收账户不变动。
     */
    private void writeTransfer(FinApproval approval, Map<String, Object> extra, LocalDateTime tradeTime) {
        String fromGroup = approval.getGroupCode();
        String toGroup = FinExtras.text(extra, "toGroupId");
        String toGroupName = FinExtras.textOrDash(extra, "toGroupName");
        if (toGroup == null) {
            throw new BusinessException("转账申请缺少转入集团信息");
        }
        BigDecimal amount = FinExtras.amount(extra, "transferAmount");
        String remark = FinExtras.textOrDash(extra, "remark");

        FinAccount fromAccount = accountService.find(fromGroup, approval.getBrand());
        if (fromAccount == null || FinExtras.nonNull(fromAccount.getVirtualBalance()).compareTo(amount) < 0) {
            throw new BusinessException("转出集团推广金余额不足，无法完成转账");
        }
        // 风控拦截：转账按 FIFO 拆分会触碰含未结清欠款的批次时禁止发起，防止资产转移跑路
        requireTransferBatchesClean(fromGroup, amount);
        accountService.getOrCreate(toGroup, toGroupName, approval.getBrand());

        // 仅为转入方创建 1 条批次
        String batchNo = bizSeqService.next(BizSeqService.RULE_BATCH_TRANSFER);
        FinBatch inBatch = baseBatch(approval, tradeTime, batchNo, "transfer");
        inBatch.setGroupCode(toGroup);
        inBatch.setGroupName(toGroupName);
        inBatch.setVirtualAmount(amount);
        inBatch.setRemark(remark);
        inBatch.setExtra(JsonUtils.toJson(withDirection(extra, "in")));
        batchMapper.insert(inBatch);

        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();

        // 转出方按 FIFO 从已有批次扣减，每个被扣批次各写 1 条转出明细
        List<DeductPart> parts = splitByFifo(fromGroup, amount);
        boolean multi = parts.size() > 1;
        for (int i = 0; i < parts.size(); i++) {
            DeductPart part = parts.get(i);
            String splitTag = multi ? "（跨批次转账 " + (i + 1) + "/" + parts.size() + "）" : "";

            FinDetail outRow = baseDetail(approval, tradeTime, part.batchNo());
            outRow.setTradeType(TRADE_OUT);
            outRow.setChangeType(CHANGE_TRANSFER_OUT);
            outRow.setVirtualChange(part.amount().negate());
            outRow.setActualChange(calcActualChange(part.amount().negate(), batchActualRatio(part.batchNo())));
            outRow.setRemark(remark + splitTag);
            saveDetail(outRow, deltas);
        }

        // 转入方 1 条转入明细
        FinDetail inRow = baseDetail(approval, tradeTime, batchNo);
        inRow.setGroupCode(toGroup);
        inRow.setGroupName(toGroupName);
        inRow.setTradeType(TRADE_IN);
        inRow.setChangeType(CHANGE_TRANSFER_IN);
        inRow.setVirtualChange(amount);
        inRow.setActualChange(null); // 转账不涉及实收账户变动
        inRow.setRemark(remark);
        saveDetail(inRow, deltas);

        applyDeltas(deltas, approval.getBrand());
    }

    /** 转账欠款批次拦截：按 FIFO 模拟拆分触碰欠款批次时抛出异常并列出批次号 */
    private void requireTransferBatchesClean(String groupCode, BigDecimal amount) {
        List<FinRiskService.FinTransferBlock> blocks = finRiskService.checkTransferBatches(groupCode, amount);
        if (blocks.isEmpty()) {
            return;
        }
        String batchNos = blocks.stream().map(FinRiskService.FinTransferBlock::batchNo)
                .distinct().reduce((a, b) -> a + "、" + b).orElse("");
        throw new BusinessException("本次转账将扣及充值批次「" + batchNos
                + "」，该批次尚有未结清欠款，禁止发起转账；如需转账请先结清对应批次欠款");
    }

    /* ==================== 扣款 ==================== */

    /**
     * 扣款：不生成批次，按批次交易时间 FIFO 拆分明细，实收按所扣批次的实收比例等比例扣减
     */
    private void writeDeduct(FinApproval approval, Map<String, Object> extra, LocalDateTime tradeTime) {
        String method = FinExtras.text(extra, "deductMethod");
        method = method == null ? "account" : method;
        BigDecimal amount = FinExtras.amount(extra, "deductAmount");
        String remark = FinExtras.textOrDash(extra, "remark");

        FinAccount account = accountService.find(approval.getGroupCode(), approval.getBrand());
        if (account == null || FinExtras.nonNull(account.getVirtualBalance()).compareTo(amount) < 0) {
            throw new BusinessException("集团推广金余额不足，无法完成扣款");
        }

        boolean consume = "consume".equals(method);
        String changeType = consume
                ? FinExtras.textOrDash(extra, "consumeType")
                : "batch".equals(method) ? CHANGE_BATCH_DEDUCT : CHANGE_ACCOUNT_DEDUCT;
        String storeLabel = consume ? FinExtras.text(extra, "consumeStore") : null;
        String channel = consume ? FinExtras.textOrDash(extra, "consumeChannel") : DEFAULT_CHANNEL;
        String bd = consume ? FinExtras.textOrDash(extra, "consumeBd") : FinExtras.DASH;

        List<DeductPart> parts = "batch".equals(method)
                ? List.of(new DeductPart(FinExtras.textOrDash(extra, "batchNo"), amount))
                : splitByFifo(approval.getGroupCode(), amount);

        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();
        boolean multi = parts.size() > 1;
        for (int i = 0; i < parts.size(); i++) {
            DeductPart part = parts.get(i);
            String splitTag = multi ? "（跨批次扣款 " + (i + 1) + "/" + parts.size() + "）" : "";

            FinDetail row = baseDetail(approval, tradeTime, part.batchNo());
            if (consume) {
                row.setStoreCode(FinExtras.storeIdOf(storeLabel));
                row.setStoreName(FinExtras.storeNameOf(storeLabel));
            }
            row.setChannel(channel);
            row.setTradeType(TRADE_DEDUCT);
            row.setChangeType(changeType);
            row.setVirtualChange(part.amount().negate());
            row.setActualChange(calcActualChange(part.amount().negate(), batchActualRatio(part.batchNo())));
            row.setBd(bd);
            row.setRemark(remark + splitTag);
            saveDetail(row, deltas);
        }

        applyDeltas(deltas, approval.getBrand());
    }

    /**
     * 按批次交易时间升序 FIFO 拆分扣款金额
     * 批次可扣余额 = 批次虚拟充值金额 - 已在该批次上发生的扣减合计
     */
    private List<DeductPart> splitByFifo(String groupCode, BigDecimal amount) {
        List<FinBatch> batches = batchMapper.selectList(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getGroupCode, groupCode)
                        .gt(FinBatch::getVirtualAmount, BigDecimal.ZERO)
                        .orderByAsc(FinBatch::getTradeTime)
                        .orderByAsc(FinBatch::getId));
        List<DeductPart> parts = new ArrayList<>();
        BigDecimal remaining = amount;
        for (FinBatch batch : batches) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
            BigDecimal deductible = FinExtras.nonNull(batch.getVirtualAmount()).subtract(deductedAmount(batch.getBatchNo()));
            if (deductible.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal take = deductible.min(remaining);
            parts.add(new DeductPart(batch.getBatchNo(), take));
            remaining = remaining.subtract(take);
        }
        // 现有批次不足以覆盖扣款金额时，剩余部分挂在虚拟批次（--）上，避免污染真实批次的扣款统计
        if (remaining.compareTo(BigDecimal.ZERO) > 0 || parts.isEmpty()) {
            String fallback = FinExtras.DASH;
            parts.add(new DeductPart(fallback, remaining.compareTo(BigDecimal.ZERO) > 0 ? remaining : amount));
        }
        return parts;
    }

    /** 某批次上已发生的扣减合计（绝对值） */
    private BigDecimal deductedAmount(String batchNo) {
        return detailMapper.sumDeductedByBatchNo(batchNo);
    }

    /* ==================== 广告消费 ==================== */

    /**
     * 广告消费（商家购买广告算法扣款）: 变动类别记录广告类型（如無敵星星），
     * 按充值批次交易时间 FIFO 拆分明细并挂批次号，批次明细页据此展示消费记录
     * @return 首条明细ID（供订单 flowNo 关联）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public String writeAdConsume(String groupCode, String groupName, String brand,
                                 String storeCode, String storeName, String channel,
                                 BigDecimal amount, String changeType, String bd,
                                 String remark, String flowNo, LocalDateTime tradeTime) {
        // 消费风控：有未结清欠款的集团按风控配置限额，超限直接拦截（白名单/无欠款集团不受限）
        finRiskService.requireConsumable(groupCode, brand, amount);
        List<DeductPart> parts = splitByFifo(groupCode, amount);
        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();
        boolean multi = parts.size() > 1;
        String firstDetailId = null;
        for (int i = 0; i < parts.size(); i++) {
            DeductPart part = parts.get(i);
            String splitTag = multi ? "（跨批次扣款 " + (i + 1) + "/" + parts.size() + "）" : "";

            BigDecimal virtualChange = part.amount().negate();
            FinDetail row = buildAdDetail(groupCode, groupName, brand, storeCode, storeName, channel,
                    tradeTime, part.batchNo(), StringUtils.hasText(flowNo) ? flowNo : FinExtras.DASH,
                    bd, TRADE_CONSUME, changeType, virtualChange,
                    calcActualChange(virtualChange, batchActualRatio(part.batchNo())),
                    remark + splitTag);
            if (firstDetailId == null) {
                firstDetailId = row.getDetailId();
            }
            saveDetail(row, deltas);
        }
        applyDeltas(deltas, brand);
        return firstDetailId;
    }

    /* ==================== 广告退款 ==================== */

    /**
     * 广告退款: 按原消费明细占比回退原批次，实收按对应批次实收比例等比例回补。
     * 找不到原消费明细（存量旧订单）时单条写入，实收按集团综合实收比例回补。
     * @return 首条明细ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public String writeAdRefund(String groupCode, String groupName, String brand,
                                String storeCode, String storeName, String channel,
                                BigDecimal amount, String changeType, String bd,
                                String remark, String orderNo, LocalDateTime tradeTime) {
        List<FinDetail> consumes = detailMapper.selectList(
                new LambdaQueryWrapper<FinDetail>()
                        .eq(FinDetail::getFlowNo, orderNo)
                        .eq(FinDetail::getTradeType, TRADE_CONSUME)
                        .lt(FinDetail::getVirtualChange, BigDecimal.ZERO)
                        .orderByAsc(FinDetail::getId));

        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();
        String firstDetailId = null;
        if (!consumes.isEmpty()) {
            BigDecimal consumeTotal = BigDecimal.ZERO;
            for (FinDetail consume : consumes) {
                consumeTotal = consumeTotal.add(FinExtras.nonNull(consume.getVirtualChange()).abs());
            }
            BigDecimal allocated = BigDecimal.ZERO;
            for (int i = 0; i < consumes.size(); i++) {
                FinDetail src = consumes.get(i);
                // 按原消费占比分摊退款额，末条承担尾差，保证合计精确
                BigDecimal partAmount;
                if (i == consumes.size() - 1) {
                    partAmount = amount.subtract(allocated);
                } else {
                    partAmount = consumeTotal.compareTo(BigDecimal.ZERO) > 0
                            ? FinExtras.round2(amount
                                    .multiply(FinExtras.nonNull(src.getVirtualChange()).abs())
                                    .divide(consumeTotal, 10, RoundingMode.HALF_UP))
                            : amount;
                    allocated = allocated.add(partAmount);
                }
                if (partAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                FinDetail row = buildAdDetail(groupCode, groupName, brand, storeCode, storeName, channel,
                        tradeTime, src.getBatchNo(), orderNo, bd, TRADE_CONSUME, changeType,
                        partAmount, calcActualChange(partAmount, batchActualRatio(src.getBatchNo())), remark);
                if (firstDetailId == null) {
                    firstDetailId = row.getDetailId();
                }
                saveDetail(row, deltas);
            }
        } else {
            FinDetail row = buildAdDetail(groupCode, groupName, brand, storeCode, storeName, channel,
                    tradeTime, FinExtras.DASH, orderNo, bd, TRADE_CONSUME, changeType,
                    amount, calcActualChange(amount, groupActualRatio(groupCode)), remark);
            firstDetailId = row.getDetailId();
            saveDetail(row, deltas);
        }
        applyDeltas(deltas, brand);
        return firstDetailId;
    }

    /** 广告消费/退款明细公共构造 */
    private FinDetail buildAdDetail(String groupCode, String groupName, String brand,
                                    String storeCode, String storeName, String channel,
                                    LocalDateTime tradeTime, String batchNo, String flowNo,
                                    String bd, String tradeType, String changeType,
                                    BigDecimal virtualChange, BigDecimal actualChange, String remark) {
        FinDetail row = new FinDetail();
        row.setDetailId(bizSeqService.next(BizSeqService.RULE_DETAIL));
        row.setGroupCode(groupCode);
        row.setGroupName(groupName);
        row.setBrand(brand);
        row.setStoreCode(StringUtils.hasText(storeCode) ? storeCode : FinExtras.DASH);
        row.setStoreName(StringUtils.hasText(storeName) ? storeName : FinExtras.DASH);
        row.setChannel(StringUtils.hasText(channel) ? channel : DEFAULT_CHANNEL);
        row.setTradeTime(tradeTime);
        row.setBatchNo(StringUtils.hasText(batchNo) ? batchNo : FinExtras.DASH);
        row.setFlowNo(flowNo);
        row.setBd(StringUtils.hasText(bd) ? bd : FinExtras.DASH);
        row.setTradeType(tradeType);
        row.setChangeType(changeType);
        row.setVirtualChange(virtualChange);
        row.setActualChange(actualChange);
        row.setRemark(remark);
        return row;
    }

    /* ==================== 商户合并 ==================== */

    /**
     * 合并：注销方偿还欠款后余额转入存续方 + 双方批次明细
     * + 存续方每个偿还门店生成新欠款单 + 注销方未结清欠款单转结（追加「轉移結算」还款记录）
     */
    private void writeMerge(FinApproval approval, Map<String, Object> extra, LocalDateTime tradeTime) {
        String sourceGroup = approval.getGroupCode();
        String targetGroup = FinExtras.text(extra, "targetGroupId");
        String targetGroupName = FinExtras.textOrDash(extra, "targetGroupName");
        if (targetGroup == null) {
            throw new BusinessException("合并申请缺少存续集团信息");
        }
        String remark = FinExtras.textOrDash(extra, "remark");
        List<Map<String, Object>> repayStores = FinExtras.rows(extra, "repayStores");

        FinAccount source = accountService.find(sourceGroup, approval.getBrand());
        BigDecimal sourceVirtual = source == null ? BigDecimal.ZERO : FinExtras.nonNull(source.getVirtualBalance());
        BigDecimal sourceActual = source == null ? BigDecimal.ZERO : FinExtras.nonNull(source.getActualBalance());

        BigDecimal repayTotal = BigDecimal.ZERO;
        for (Map<String, Object> store : repayStores) {
            repayTotal = repayTotal.add(FinExtras.amount(store, "amount"));
        }
        if (repayTotal.compareTo(sourceVirtual) > 0) {
            throw new BusinessException("注销集团推广金余额不足以偿还欠款，无法完成合并");
        }
        // 偿还欠款后的剩余余额结转至存续集团
        BigDecimal transferVirtual = sourceVirtual.subtract(repayTotal);
        BigDecimal ratio = groupActualRatio(sourceGroup);

        accountService.getOrCreate(targetGroup, targetGroupName, approval.getBrand());
        String batchNo = bizSeqService.next(BizSeqService.RULE_BATCH_MERGE);

        FinBatch outBatch = baseBatch(approval, tradeTime, batchNo, "merge");
        outBatch.setGroupCode(sourceGroup);
        outBatch.setGroupName(approval.getGroupName());
        outBatch.setVirtualAmount(transferVirtual.negate());
        outBatch.setRemark(remark);
        outBatch.setExtra(JsonUtils.toJson(withDirection(extra, "out")));
        batchMapper.insert(outBatch);

        FinBatch inBatch = baseBatch(approval, tradeTime, batchNo, "merge");
        inBatch.setGroupCode(targetGroup);
        inBatch.setGroupName(targetGroupName);
        inBatch.setVirtualAmount(transferVirtual);
        inBatch.setRemark(remark);
        inBatch.setExtra(JsonUtils.toJson(withDirection(extra, "in")));
        batchMapper.insert(inBatch);

        Map<String, BalanceDelta> deltas = new LinkedHashMap<>();
        LocalDate loanDate = tradeTime.toLocalDate();

        // 1. 注销集团按门店写入欠款偿还明细
        BigDecimal repayActualTotal = BigDecimal.ZERO;
        for (Map<String, Object> store : repayStores) {
            BigDecimal amount = FinExtras.amount(store, "amount");
            BigDecimal actualChange = calcActualChange(amount.negate(), ratio);
            FinDetail row = baseDetail(approval, tradeTime, batchNo);
            row.setStoreCode(FinExtras.storeId(store));
            row.setStoreName(FinExtras.storeName(store));
            row.setTradeType(TRADE_DEDUCT);
            row.setChangeType(CHANGE_DEBT_REPAY);
            row.setVirtualChange(amount.negate());
            row.setActualChange(actualChange);
            row.setBd(FinExtras.textOrDash(store, "bd"));
            row.setRemark("集團合併欠款償還");
            saveDetail(row, deltas);
            if (actualChange != null) {
                repayActualTotal = repayActualTotal.add(actualChange.abs());
            }
        }

        // 2. 剩余余额转出/转入（注销集团实收余额一并结转，确保注销后双账户归零）
        BigDecimal transferActual = ratio == null
                ? null
                : sourceActual.subtract(repayActualTotal).max(BigDecimal.ZERO);

        FinDetail outRow = baseDetail(approval, tradeTime, batchNo);
        outRow.setTradeType(TRADE_OUT);
        outRow.setChangeType(CHANGE_MERGE_OUT);
        outRow.setVirtualChange(transferVirtual.negate());
        outRow.setActualChange(transferActual == null ? null : transferActual.negate());
        outRow.setRemark(remark);
        saveDetail(outRow, deltas);

        FinDetail inRow = baseDetail(approval, tradeTime, batchNo);
        inRow.setGroupCode(targetGroup);
        inRow.setGroupName(targetGroupName);
        inRow.setTradeType(TRADE_IN);
        inRow.setChangeType(CHANGE_MERGE_IN);
        inRow.setVirtualChange(transferVirtual);
        inRow.setActualChange(transferActual);
        inRow.setRemark(remark);
        saveDetail(inRow, deltas);

        // 3. 存续集团每个偿还门店生成新欠款单
        List<String> newBillNos = new ArrayList<>();
        for (Map<String, Object> store : repayStores) {
            BigDecimal amount = FinExtras.amount(store, "amount");
            FinDebtBill bill = new FinDebtBill();
            bill.setBillNo(bizSeqService.next(BizSeqService.RULE_DEBT));
            bill.setGroupCode(targetGroup);
            bill.setGroupName(targetGroupName);
            bill.setBrand(approval.getBrand());
            bill.setStoreCode(FinExtras.storeId(store));
            bill.setStoreName(FinExtras.storeName(store));
            bill.setChannel(FinExtras.DASH);
            bill.setBd(FinExtras.textOrDash(store, "bd"));
            bill.setSource("merge");
            bill.setLoanDate(loanDate);
            bill.setBatchNo(batchNo);
            bill.setFlowNo(approval.getFlowNo());
            bill.setDebtTotal(amount);
            bill.setPaidAmount(BigDecimal.ZERO);
            bill.setRemainAmount(amount);
            bill.setStatus("unsettled");
            debtBillMapper.insert(bill);
            newBillNos.add(bill.getBillNo());
        }

        // 4. 注销集团原未结清欠款单转结，追加「轉移結算」还款记录
        transferSourceDebts(sourceGroup, targetGroupName, newBillNos, loanDate, tradeTime);

        applyDeltas(deltas, approval.getBrand());

        // 5. 账户状态：注销方注销、存续方解除合并冻结
        accountService.updateStatus(sourceGroup, approval.getBrand(), FinAccountServiceImpl.STATUS_CANCELLED);
        accountService.updateStatus(targetGroup, approval.getBrand(), FinAccountServiceImpl.STATUS_NORMAL);
    }

    /** 注销集团未结清欠款单标记已转结并追加转移结算还款记录 */
    private void transferSourceDebts(String sourceGroup, String targetGroupName, List<String> newBillNos,
                                     LocalDate repayDate, LocalDateTime operateTime) {
        List<FinDebtBill> bills = debtBillMapper.selectList(
                new LambdaQueryWrapper<FinDebtBill>()
                        .eq(FinDebtBill::getGroupCode, sourceGroup)
                        .eq(FinDebtBill::getStatus, "unsettled"));
        if (bills.isEmpty()) {
            return;
        }
        String billNoText = String.join("、", newBillNos);
        for (FinDebtBill bill : bills) {
            BigDecimal remain = FinExtras.nonNull(bill.getRemainAmount());

            FinDebtRepayment repayment = new FinDebtRepayment();
            repayment.setBillId(bill.getId());
            repayment.setBillNo(bill.getBillNo());
            repayment.setRepayDate(repayDate);
            repayment.setChannel("轉移結算");
            repayment.setAmount(remain);
            repayment.setRemark("商戶合併，該筆欠款已轉移至存續集團「" + targetGroupName + "」"
                    + (billNoText.isEmpty() ? "" : "，新賬單編號：" + billNoText));
            repayment.setOperator("系統");
            repayment.setOperateTime(operateTime);
            repayment.setCanDelete(0);
            repaymentMapper.insert(repayment);

            bill.setPaidAmount(FinExtras.round2(FinExtras.nonNull(bill.getPaidAmount()).add(remain)));
            bill.setRemainAmount(BigDecimal.ZERO);
            bill.setStatus("transferred");
            debtBillMapper.updateById(bill);
        }
    }

    /* ==================== 等比例扣款 ==================== */

    /** 充值批次的实收比例（实收充值 ÷ 虚拟充值），纯赠送批次返回 null */
    private BigDecimal batchActualRatio(String batchNo) {
        if (batchNo == null || FinExtras.DASH.equals(batchNo)) {
            return null;
        }
        FinBatch batch = batchMapper.selectOne(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getBatchNo, batchNo)
                        .eq(FinBatch::getBatchType, "recharge")
                        .last("LIMIT 1"));
        if (batch == null || batch.getActualAmount() == null
                || FinExtras.nonNull(batch.getVirtualAmount()).compareTo(BigDecimal.ZERO) <= 0
                || batch.getActualAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return ratioOf(batch.getActualAmount(), batch.getVirtualAmount());
    }

    /** 集团综合实收比例（Σ实收充值 ÷ Σ虚拟充值），用于转账/合并等集团维度交易 */
    private BigDecimal groupActualRatio(String groupCode) {
        List<FinBatch> batches = batchMapper.selectList(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getGroupCode, groupCode)
                        .eq(FinBatch::getBatchType, "recharge")
                        .gt(FinBatch::getVirtualAmount, BigDecimal.ZERO));
        BigDecimal virtualTotal = BigDecimal.ZERO;
        BigDecimal actualTotal = BigDecimal.ZERO;
        for (FinBatch batch : batches) {
            virtualTotal = virtualTotal.add(FinExtras.nonNull(batch.getVirtualAmount()));
            actualTotal = actualTotal.add(FinExtras.nonNull(batch.getActualAmount()));
        }
        if (virtualTotal.compareTo(BigDecimal.ZERO) <= 0 || actualTotal.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return ratioOf(actualTotal, virtualTotal);
    }

    private static BigDecimal ratioOf(BigDecimal actual, BigDecimal virtual) {
        return actual.divide(virtual, 10, RoundingMode.HALF_UP);
    }

    /** 按比例计算实收变动金额（保留两位小数），无比例返回 null */
    private static BigDecimal calcActualChange(BigDecimal virtualValue, BigDecimal ratio) {
        return ratio == null ? null : FinExtras.round2(virtualValue.multiply(ratio));
    }

    /* ==================== 公共构造 ==================== */

    /** 批次公共字段（集团/金额由调用方按方向设置） */
    private FinBatch baseBatch(FinApproval approval, LocalDateTime tradeTime, String batchNo, String batchType) {
        FinBatch batch = new FinBatch();
        batch.setBatchNo(batchNo);
        batch.setBatchType(batchType);
        batch.setFlowNo(approval.getFlowNo());
        batch.setBrand(approval.getBrand());
        batch.setTradeTime(tradeTime);
        batch.setIsActual(FinExtras.DASH);
        batch.setApplicant(approval.getApplicant());
        batch.setBd(FinExtras.DASH);
        return batch;
    }

    /** 明细公共字段（默认集团维度：无门店、外賣频道） */
    private FinDetail baseDetail(FinApproval approval, LocalDateTime tradeTime, String batchNo) {
        FinDetail detail = new FinDetail();
        detail.setDetailId(bizSeqService.next(BizSeqService.RULE_DETAIL));
        detail.setGroupCode(approval.getGroupCode());
        detail.setGroupName(approval.getGroupName());
        detail.setBrand(approval.getBrand());
        detail.setStoreCode(FinExtras.DASH);
        detail.setStoreName(FinExtras.DASH);
        detail.setChannel(DEFAULT_CHANNEL);
        detail.setTradeTime(tradeTime);
        detail.setBatchNo(batchNo);
        detail.setFlowNo(approval.getFlowNo());
        detail.setBd(FinExtras.DASH);
        detail.setRemark(FinExtras.DASH);
        return detail;
    }

    /** 批次 extra 追加资金方向标记（批次明细页据此区分转出/转入） */
    private static Map<String, Object> withDirection(Map<String, Object> extra, String direction) {
        Map<String, Object> copy = new LinkedHashMap<>(extra);
        copy.put("direction", direction);
        return copy;
    }

    /** 写入明细并累计所属集团的账户余额变动 */
    private void saveDetail(FinDetail detail, Map<String, BalanceDelta> deltas) {
        detailMapper.insert(detail);
        deltas.computeIfAbsent(detail.getGroupCode(), key -> new BalanceDelta())
                .add(detail.getVirtualChange(), detail.getActualChange());
    }

    /** 将累计的余额变动写入账户（同一审批单内所有明细归属同一品牌） */
    private void applyDeltas(Map<String, BalanceDelta> deltas, String brand) {
        deltas.forEach((groupCode, delta) ->
                accountService.changeBalance(groupCode, brand, delta.virtual, delta.actual));
    }

    /** 扣款拆分片段 */
    private record DeductPart(String batchNo, BigDecimal amount) {
    }

    /** 账户余额变动累计（actual 为 null 表示本次不涉及实收账户） */
    private static final class BalanceDelta {
        private BigDecimal virtual = BigDecimal.ZERO;
        private BigDecimal actual;

        private void add(BigDecimal virtualChange, BigDecimal actualChange) {
            if (virtualChange != null) {
                virtual = virtual.add(virtualChange);
            }
            if (actualChange != null) {
                actual = FinExtras.nonNull(actual).add(actualChange);
            }
        }
    }
}
