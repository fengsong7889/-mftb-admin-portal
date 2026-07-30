package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.FinReconcileQuery;
import com.mftb.admin.dto.FinReconcileRowVO;
import com.mftb.admin.dto.FinReconcileSummaryVO;
import com.mftb.admin.dto.FinReconcileVO;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.FinReconcileService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.FinExtras;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 充消对账服务实现
 * <p>
 * 数据来源：biz_fin_detail 按集团按日聚合。空库起步下账户余额从 0 累计，
 * 因此「期初余额 = 统计起始日之前的累计变动」，「期末余额 = 期初 + 当日交易净额」，勾稽天然成立。
 * <p>
 * 列口径（与前端充消对账表格一致）：
 * <ul>
 *   <li>虚拟/实收充值总额 = 交易类型「充值」的账户变动</li>
 *   <li>营业额支付 = 充值批次扣款中备注为「營業額支付扣款」的金额；银行收款 = 实收充值总额 - 营业额支付</li>
 *   <li>消费总额 = 交易类型「消費」的虚拟账户扣减</li>
 *   <li>扣款总额 = 交易类型「扣款」的虚拟账户扣减；扣款实收变动 = 「扣款」与「消費」的实收账户扣减合计</li>
 *   <li>交易净额 = 当日全部明细的账户变动合计（签名求和），保证期末 = 期初 + 净额</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class FinReconcileServiceImpl implements FinReconcileService {

    private final FinDetailMapper detailMapper;

    @Override
    public FinReconcileVO writeoff(FinReconcileQuery query) {
        List<FinDetail> details = loadDetails(query);
        List<FinReconcileRowVO> rows = aggregate(details, query.getStartDate());

        FinReconcileVO result = new FinReconcileVO();
        result.setTotal(rows.size());
        result.setSummary(summarize(rows));
        result.setRecords(paginate(rows, query.getPage(), query.getSize()));
        return result;
    }

    /** 拉取截止统计结束日的全部明细（统计起始日之前的部分用于计算期初余额） */
    private List<FinDetail> loadDetails(FinReconcileQuery query) {
        LambdaQueryWrapper<FinDetail> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinDetail::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinDetail::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinDetail::getBrand, query.getBrand());
        }
        if (query.getEndDate() != null) {
            wrapper.lt(FinDetail::getTradeTime, query.getEndDate().plusDays(1).atStartOfDay());
        }
        wrapper.orderByAsc(FinDetail::getTradeTime).orderByAsc(FinDetail::getId);
        return detailMapper.selectList(wrapper);
    }

    /** 按集团按日聚合，日期倒序、集团正序输出 */
    private List<FinReconcileRowVO> aggregate(List<FinDetail> details, LocalDate startDate) {
        // 集团 -> 累计余额 [虚拟, 实收]，明细按时间升序遍历，切换到新日期时累计值即为该日期初
        Map<String, BigDecimal[]> running = new HashMap<>();
        Map<String, Map<LocalDate, FinReconcileRowVO>> rowsByGroup = new LinkedHashMap<>();

        for (FinDetail detail : details) {
            if (detail.getTradeTime() == null) {
                continue;
            }
            String groupCode = detail.getGroupCode();
            LocalDate date = detail.getTradeTime().toLocalDate();
            BigDecimal[] balance = running.computeIfAbsent(groupCode,
                    key -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal virtual = FinExtras.nonNull(detail.getVirtualChange());
            BigDecimal actual = FinExtras.nonNull(detail.getActualChange());

            if (startDate == null || !date.isBefore(startDate)) {
                Map<LocalDate, FinReconcileRowVO> dayRows =
                        rowsByGroup.computeIfAbsent(groupCode, key -> new LinkedHashMap<>());
                FinReconcileRowVO row = dayRows.get(date);
                if (row == null) {
                    row = newRow(detail, date, balance);
                    dayRows.put(date, row);
                }
                accumulate(row, detail, virtual, actual);
            }
            balance[0] = balance[0].add(virtual);
            balance[1] = balance[1].add(actual);
        }

        List<FinReconcileRowVO> rows = new ArrayList<>();
        rowsByGroup.values().forEach(dayRows -> dayRows.values().forEach(row -> {
            finish(row);
            rows.add(row);
        }));
        rows.sort(Comparator.comparing(FinReconcileRowVO::getDate).reversed()
                .thenComparing(FinReconcileRowVO::getGroupId));
        return rows;
    }

    private FinReconcileRowVO newRow(FinDetail detail, LocalDate date, BigDecimal[] balance) {
        FinReconcileRowVO row = new FinReconcileRowVO();
        row.setDate(DateTimeUtils.format(date));
        row.setGroupId(detail.getGroupCode());
        row.setGroupName(detail.getGroupName());
        row.setBrand(detail.getBrand());
        row.setInitVirtual(FinExtras.round2(balance[0]));
        row.setInitActual(FinExtras.round2(balance[1]));
        return row;
    }

    /** 单条明细按交易类型归入对应统计列 */
    private void accumulate(FinReconcileRowVO row, FinDetail detail, BigDecimal virtual, BigDecimal actual) {
        String tradeType = detail.getTradeType() == null ? "" : detail.getTradeType();
        switch (tradeType) {
            case FinWriteChainServiceImpl.TRADE_RECHARGE -> {
                row.setVirtualRecharge(row.getVirtualRecharge().add(virtual));
                row.setActualRecharge(row.getActualRecharge().add(actual));
            }
            case FinWriteChainServiceImpl.TRADE_DEDUCT -> {
                row.setDeductVirtual(row.getDeductVirtual().add(virtual.abs()));
                row.setDeductActual(row.getDeductActual().add(actual.abs()));
                if (FinWriteChainServiceImpl.CHANGE_BATCH_DEDUCT.equals(detail.getChangeType())
                        && FinWriteChainServiceImpl.REMARK_REVENUE_PAYMENT.equals(detail.getRemark())) {
                    row.setRevenuePayment(row.getRevenuePayment().add(virtual.abs()));
                }
            }
            case FinWriteChainServiceImpl.TRADE_CONSUME -> {
                row.setConsumeTotal(row.getConsumeTotal().add(virtual.abs()));
                row.setDeductActual(row.getDeductActual().add(actual.abs()));
            }
            case FinWriteChainServiceImpl.TRADE_IN -> {
                row.setVirtualTransferIn(row.getVirtualTransferIn().add(virtual));
                row.setActualTransferIn(row.getActualTransferIn().add(actual));
            }
            case FinWriteChainServiceImpl.TRADE_OUT -> {
                row.setVirtualTransferOut(row.getVirtualTransferOut().add(virtual.abs()));
                row.setActualTransferOut(row.getActualTransferOut().add(actual.abs()));
            }
            default -> {
                // 未归类交易类型只计入交易净额，不影响构成列
            }
        }
        row.setVirtualNet(row.getVirtualNet().add(virtual));
        row.setActualNet(row.getActualNet().add(actual));
    }

    /** 收尾：银行收款倒算 + 期末余额 + 统一两位小数 */
    private void finish(FinReconcileRowVO row) {
        BigDecimal bankReceipt = row.getActualRecharge().subtract(row.getRevenuePayment());
        row.setBankReceipt(bankReceipt.compareTo(BigDecimal.ZERO) > 0 ? bankReceipt : BigDecimal.ZERO);
        row.setEndVirtual(row.getInitVirtual().add(row.getVirtualNet()));
        row.setEndActual(row.getInitActual().add(row.getActualNet()));

        row.setVirtualRecharge(FinExtras.round2(row.getVirtualRecharge()));
        row.setActualRecharge(FinExtras.round2(row.getActualRecharge()));
        row.setBankReceipt(FinExtras.round2(row.getBankReceipt()));
        row.setRevenuePayment(FinExtras.round2(row.getRevenuePayment()));
        row.setConsumeTotal(FinExtras.round2(row.getConsumeTotal()));
        row.setDeductVirtual(FinExtras.round2(row.getDeductVirtual()));
        row.setDeductActual(FinExtras.round2(row.getDeductActual()));
        row.setVirtualTransferIn(FinExtras.round2(row.getVirtualTransferIn()));
        row.setActualTransferIn(FinExtras.round2(row.getActualTransferIn()));
        row.setVirtualTransferOut(FinExtras.round2(row.getVirtualTransferOut()));
        row.setActualTransferOut(FinExtras.round2(row.getActualTransferOut()));
        row.setVirtualNet(FinExtras.round2(row.getVirtualNet()));
        row.setActualNet(FinExtras.round2(row.getActualNet()));
        row.setEndVirtual(FinExtras.round2(row.getEndVirtual()));
        row.setEndActual(FinExtras.round2(row.getEndActual()));
    }

    /**
     * 周期总账汇总：构成类指标为全部日报行合计；
     * 期初取各集团周期首日期初、期末取各集团周期末日期末（避免同一集团跨日重复计入）
     */
    private FinReconcileSummaryVO summarize(List<FinReconcileRowVO> rows) {
        FinReconcileSummaryVO summary = new FinReconcileSummaryVO();
        Map<String, FinReconcileRowVO> firstRow = new LinkedHashMap<>();
        Map<String, FinReconcileRowVO> lastRow = new LinkedHashMap<>();

        for (FinReconcileRowVO row : rows) {
            summary.setVirtualRecharge(summary.getVirtualRecharge().add(row.getVirtualRecharge()));
            summary.setActualRecharge(summary.getActualRecharge().add(row.getActualRecharge()));
            summary.setBankReceipt(summary.getBankReceipt().add(row.getBankReceipt()));
            summary.setRevenuePayment(summary.getRevenuePayment().add(row.getRevenuePayment()));
            summary.setConsumeTotal(summary.getConsumeTotal().add(row.getConsumeTotal()));
            summary.setDeductVirtual(summary.getDeductVirtual().add(row.getDeductVirtual()));
            summary.setDeductActual(summary.getDeductActual().add(row.getDeductActual()));
            summary.setVirtualTransferIn(summary.getVirtualTransferIn().add(row.getVirtualTransferIn()));
            summary.setActualTransferIn(summary.getActualTransferIn().add(row.getActualTransferIn()));
            summary.setVirtualTransferOut(summary.getVirtualTransferOut().add(row.getVirtualTransferOut()));
            summary.setActualTransferOut(summary.getActualTransferOut().add(row.getActualTransferOut()));
            summary.setVirtualNet(summary.getVirtualNet().add(row.getVirtualNet()));
            summary.setActualNet(summary.getActualNet().add(row.getActualNet()));

            // rows 已按日期倒序排列：首次出现为该集团末日，末次出现为该集团首日
            lastRow.putIfAbsent(row.getGroupId(), row);
            firstRow.put(row.getGroupId(), row);
        }

        for (FinReconcileRowVO row : firstRow.values()) {
            summary.setInitVirtual(summary.getInitVirtual().add(row.getInitVirtual()));
            summary.setInitActual(summary.getInitActual().add(row.getInitActual()));
        }
        for (FinReconcileRowVO row : lastRow.values()) {
            summary.setEndVirtual(summary.getEndVirtual().add(row.getEndVirtual()));
            summary.setEndActual(summary.getEndActual().add(row.getEndActual()));
        }
        return summary;
    }

    /** 聚合结果内存分页 */
    private List<FinReconcileRowVO> paginate(List<FinReconcileRowVO> rows, long page, long size) {
        long current = page < 1 ? 1 : page;
        long pageSize = size < 1 ? 10 : size;
        int from = (int) Math.min((current - 1) * pageSize, rows.size());
        int to = (int) Math.min(from + pageSize, rows.size());
        return new ArrayList<>(rows.subList(from, to));
    }
}
