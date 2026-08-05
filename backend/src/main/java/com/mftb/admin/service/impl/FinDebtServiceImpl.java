package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.DebtRepaymentDTO;
import com.mftb.admin.dto.FinDebtBillVO;
import com.mftb.admin.dto.FinDebtPageVO;
import com.mftb.admin.dto.FinDebtQuery;
import com.mftb.admin.dto.FinDebtRepaymentVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinDebtBill;
import com.mftb.admin.entity.FinDebtRepayment;
import com.mftb.admin.mapper.FinDebtBillMapper;
import com.mftb.admin.mapper.FinDebtRepaymentMapper;
import com.mftb.admin.service.FinDebtService;
import com.mftb.admin.util.FinExtras;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 欠款对账服务实现
 */
@Service
@RequiredArgsConstructor
public class FinDebtServiceImpl implements FinDebtService {

    /** 账单状态 */
    public static final String STATUS_UNSETTLED = "unsettled";
    public static final String STATUS_SETTLED = "settled";
    public static final String STATUS_TRANSFERRED = "transferred";

    private final FinDebtBillMapper billMapper;
    private final FinDebtRepaymentMapper repaymentMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public FinDebtPageVO page(FinDebtQuery query) {
        long p = PageResult.normalizePage(query.getPage());
        long sz = PageResult.normalizeSize(query.getSize());
        Page<FinDebtBill> result = billMapper.selectPage(
                new Page<>(p, sz), buildWrapper(query, true));

        FinDebtPageVO vo = new FinDebtPageVO();
        vo.setRecords(result.getRecords().stream().map(FinDebtBillVO::from).toList());
        vo.setTotal(result.getTotal());
        vo.setBrandStats(brandStats(query));
        return vo;
    }

    @Override
    public FinDebtBillVO detail(String billNo) {
        FinDebtBill bill = requireBill(billNo);
        FinDebtBillVO vo = FinDebtBillVO.from(bill);
        vo.setRepayments(loadRepayments(bill.getId()));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void addRepayment(String billNo, DebtRepaymentDTO request) {
        FinDebtBill bill = requireBill(billNo);
        if (STATUS_TRANSFERRED.equals(bill.getStatus())) {
            throw new BusinessException("该账单已转结至存续集团，不可再新增扣款");
        }
        if (!StringUtils.hasText(request.getChannel())) {
            throw new BusinessException("请选择扣款渠道");
        }
        BigDecimal amount = FinExtras.nonNull(request.getAmount());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("扣款金额必须大于 0");
        }
        BigDecimal remain = FinExtras.nonNull(bill.getRemainAmount());
        if (amount.compareTo(remain) > 0) {
            throw new BusinessException("扣款金额不能超过剩余待还 " + remain.toPlainString());
        }

        FinDebtRepayment repayment = new FinDebtRepayment();
        repayment.setBillId(bill.getId());
        repayment.setBillNo(bill.getBillNo());
        repayment.setRepayDate(request.getDate() == null ? LocalDate.now() : request.getDate());
        repayment.setChannel(request.getChannel());
        repayment.setAmount(amount);
        repayment.setRemark(request.getRemark());
        repayment.setOperator(operatorResolver.currentOperatorName());
        repayment.setOperateTime(LocalDateTime.now());
        repayment.setCanDelete(1);
        repaymentMapper.insert(repayment);

        applyPaid(bill, FinExtras.nonNull(bill.getPaidAmount()).add(amount));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteRepayment(Long id) {
        FinDebtRepayment repayment = repaymentMapper.selectById(id);
        if (repayment == null) {
            throw new BusinessException(ResultCode.NOT_FOUND.getCode(), "还款记录不存在");
        }
        if (repayment.getCanDelete() != null && repayment.getCanDelete() == 0) {
            throw new BusinessException("系统生成的转移结算记录不可删除");
        }
        FinDebtBill bill = billMapper.selectById(repayment.getBillId());
        if (bill == null) {
            throw new BusinessException(ResultCode.NOT_FOUND.getCode(), "还款记录对应的欠款单不存在");
        }
        repaymentMapper.deleteById(id);
        applyPaid(bill, FinExtras.nonNull(bill.getPaidAmount()).subtract(FinExtras.nonNull(repayment.getAmount())));
    }

    /** 按已还金额回写账单待还金额与状态 */
    private void applyPaid(FinDebtBill bill, BigDecimal paidAmount) {
        BigDecimal paid = paidAmount.compareTo(BigDecimal.ZERO) > 0 ? paidAmount : BigDecimal.ZERO;
        BigDecimal remain = FinExtras.nonNull(bill.getDebtTotal()).subtract(paid);
        if (remain.compareTo(BigDecimal.ZERO) < 0) {
            remain = BigDecimal.ZERO;
        }
        bill.setPaidAmount(FinExtras.round2(paid));
        bill.setRemainAmount(FinExtras.round2(remain));
        // 已转结账单不因还款记录变动改变状态
        if (!STATUS_TRANSFERRED.equals(bill.getStatus())) {
            bill.setStatus(remain.compareTo(BigDecimal.ZERO) <= 0 ? STATUS_SETTLED : STATUS_UNSETTLED);
        }
        billMapper.updateById(bill);
    }

    private List<FinDebtRepaymentVO> loadRepayments(Long billId) {
        List<FinDebtRepayment> repayments = repaymentMapper.selectList(
                new LambdaQueryWrapper<FinDebtRepayment>()
                        .eq(FinDebtRepayment::getBillId, billId)
                        .orderByAsc(FinDebtRepayment::getRepayDate)
                        .orderByAsc(FinDebtRepayment::getId));
        return repayments.stream().map(FinDebtRepaymentVO::from).toList();
    }

    /** 品牌待还统计（口径与前端一致：仅统计筛选结果中未结清账单的剩余待还） */
    private FinDebtPageVO.BrandStats brandStats(FinDebtQuery query) {
        LambdaQueryWrapper<FinDebtBill> wrapper = buildWrapper(query, false);
        wrapper.eq(FinDebtBill::getStatus, STATUS_UNSETTLED);
        FinDebtPageVO.BrandStats stats = new FinDebtPageVO.BrandStats();
        for (FinDebtBill bill : billMapper.selectList(wrapper)) {
            FinDebtPageVO.Stat target = isShanfeng(bill.getBrand()) ? stats.getShanfeng() : stats.getMfood();
            target.setAmount(FinExtras.round2(target.getAmount().add(FinExtras.nonNull(bill.getRemainAmount()))));
            target.setCount(target.getCount() + 1);
        }
        return stats;
    }

    /** 品牌判定（兼容 flashBee / shanfeng / 1 等写法，与前端 isShanfeng 一致） */
    private static boolean isShanfeng(String brand) {
        if (brand == null) {
            return false;
        }
        String value = brand.toLowerCase();
        return "1".equals(value) || "shanfeng".equals(value) || "flashbee".equals(value) || "閃蜂".equals(brand);
    }

    private LambdaQueryWrapper<FinDebtBill> buildWrapper(FinDebtQuery query, boolean withOrder) {
        LambdaQueryWrapper<FinDebtBill> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinDebtBill::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinDebtBill::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getStoreName())) {
            wrapper.like(FinDebtBill::getStoreName, query.getStoreName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinDebtBill::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getBillNo())) {
            wrapper.like(FinDebtBill::getBillNo, query.getBillNo());
        }
        if (StringUtils.hasText(query.getBatchNo())) {
            wrapper.like(FinDebtBill::getBatchNo, query.getBatchNo());
        }
        if (StringUtils.hasText(query.getFlowNo())) {
            wrapper.like(FinDebtBill::getFlowNo, query.getFlowNo());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(FinDebtBill::getStatus, query.getStatus());
        }
        if (StringUtils.hasText(query.getSource())) {
            wrapper.eq(FinDebtBill::getSource, query.getSource());
        }
        if (StringUtils.hasText(query.getChannel())) {
            wrapper.eq(FinDebtBill::getChannel, query.getChannel());
        }
        if (query.getLoanFrom() != null) {
            wrapper.ge(FinDebtBill::getLoanDate, query.getLoanFrom());
        }
        if (query.getLoanTo() != null) {
            wrapper.le(FinDebtBill::getLoanDate, query.getLoanTo());
        }
        if (withOrder) {
            wrapper.orderByDesc(FinDebtBill::getLoanDate).orderByDesc(FinDebtBill::getId);
        }
        return wrapper;
    }

    private FinDebtBill requireBill(String billNo) {
        FinDebtBill bill = billMapper.selectOne(
                new LambdaQueryWrapper<FinDebtBill>().eq(FinDebtBill::getBillNo, billNo));
        if (bill == null) {
            throw new BusinessException(ResultCode.NOT_FOUND.getCode(), "欠款单不存在: " + billNo);
        }
        return bill;
    }
}
