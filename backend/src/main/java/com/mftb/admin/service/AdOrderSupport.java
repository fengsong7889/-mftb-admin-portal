package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.util.AdCalcUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

/**
 * 广告下单公共支撑: 六个销售模块（人气/金字招牌/投流/复苏/星星/新店）
 * placeOrder 共享的分组/门店解析、下单人快照、赠送天数抵扣与扣减、推广金余额校验、财务扣款写入。
 * 全部方法仅做数据读写, 不改变各模块的计价与格子规则。
 */
@Component
@RequiredArgsConstructor
public class AdOrderSupport {

    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final GiftService giftService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final OperatorResolver operatorResolver;
    private final AdOrderMapper orderMapper;

    /** 分组名称解析: 集团存在取其名称, 否则回退使用集团编码 */
    public String resolveGroupName(String groupCode) {
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, groupCode)
                        .last("LIMIT 1"));
        return group != null ? group.getGroupName() : groupCode;
    }

    /** 门店可选解析: storeCode 为空或不存在时返回 null（允许仅集团下单） */
    public BizStore findStore(String storeCode) {
        if (!StringUtils.hasText(storeCode)) {
            return null;
        }
        return storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getStoreCode, storeCode)
                .last("LIMIT 1"));
    }

    /** 下单人快照: 当前登录的业务人员写入订单 */
    public void applyOperatorSnapshot(AdOrder order) {
        SysUser operator = operatorResolver.currentUser();
        if (operator != null) {
            order.setOperatorType(2);
            order.setOperatorId(StringUtils.hasText(operator.getEmpId()) ? operator.getEmpId() : operator.getUsername());
            order.setOperatorName(StringUtils.hasText(operator.getName()) ? operator.getName() : operator.getUsername());
        }
    }

    /**
     * 赠送天数抵扣校验与计算: 按折后总价等比折算, 封顶折后总额
     * （赠送部分不走推广金, 退款不返还; 抵扣天数不能超过购买格子数）
     *
     * @param adType          赠送天数的广告类型标识（各模块常量, 如 popular_merchant）
     * @param store           门店（使用抵扣时必填）
     * @param giftDays        申请抵扣天数
     * @param cellCount       购买格子数
     * @param discountedTotal 折后总额
     * @return 实际抵扣金额（giftDays<=0 时为 0）
     */
    public BigDecimal calcGiftDeduction(String adType, BizStore store, int giftDays,
                                        int cellCount, BigDecimal discountedTotal) {
        if (giftDays <= 0) {
            return BigDecimal.ZERO;
        }
        if (store == null) {
            throw new BusinessException("請選擇門店後再使用贈送天數抵扣");
        }
        int available = giftService.availableDays(store.getId(), adType);
        if (available < giftDays) {
            throw new BusinessException("贈送天數餘額不足，當前可用 " + available + " 天");
        }
        if (giftDays > cellCount) {
            throw new BusinessException("抵扣天數不能超過購買天數");
        }
        BigDecimal giftDeduction = AdCalcUtils.round2(discountedTotal
                .multiply(BigDecimal.valueOf(giftDays))
                .divide(BigDecimal.valueOf(cellCount), RoundingMode.HALF_UP));
        return giftDeduction.compareTo(discountedTotal) > 0 ? discountedTotal : giftDeduction;
    }

    /** 推广金余额校验（仅实际需要推广金时才检查账户状态与余额） */
    public void requireSufficientBalance(String groupCode, String brand, BigDecimal actualTotal) {
        if (actualTotal.signum() <= 0) {
            return;
        }
        FinAccount account = accountService.requireUsable(groupCode, brand);
        BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
        if (balance.compareTo(actualTotal) < 0) {
            throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
        }
    }

    /** 扣减赠送天数余额并写消费流水（与订单同事务; 无抵扣或无门店时跳过） */
    public void deductGiftDays(String adType, BizStore store, int giftDays, String orderNo,
                               String algoCode, String algoName) {
        if (giftDays > 0 && store != null) {
            giftService.deductForOrder(store.getId(), adType, giftDays, orderNo, algoCode, algoName);
        }
    }

    /**
     * 财务扣款 + 消费明细写入并回写订单 flowNo
     * （财务写入链: 按充值批次 FIFO 拆分挂批次号, 实付为 0 时不写入）
     */
    public void writeAdConsume(AdOrder order, String groupCode, String brand, String finChannel,
                               BigDecimal actualTotal, String changeType, String bdEmpId, LocalDateTime tradeTime) {
        if (actualTotal.signum() <= 0) {
            return;
        }
        String firstDetailId = finWriteChainService.writeAdConsume(
                groupCode, order.getGroupName(), brand,
                order.getStoreCode(), order.getStoreName(), finChannel,
                actualTotal, changeType, bdEmpId,
                changeType + "廣告購買 訂單" + order.getOrderNo(), order.getOrderNo(), tradeTime);
        order.setFlowNo(firstDetailId);
        orderMapper.updateById(order);
    }
}
